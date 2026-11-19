const fs = require('node:fs');
const path = require('node:path');
const DomainModelExtractor = require('./DomainModelExtractor');
const Compatibility = require('../../core/services/RequirementScreenCompatibility');
const ApplicationContractBuilder = require('./ApplicationContractBuilder');
const { systemManaged } = require('./MockupFieldPolicy');

const PROMPT = path.join(__dirname, '..', 'prompts', 'analista_especificacion_aplicacion.md');
const TIPOS = ['consulta', 'crear', 'actualizar', 'eliminar', 'transicion'];
const OPERADORES = ['==', '!=', '>', '>=', '<', '<='];
const ORIGENES = ['sesion', 'parametro', 'constante'];
const VALORES_SESION = ['usuario.id', 'usuario.email', 'usuario.rol'];
const COMPONENTES = ['tabla', 'tarjetas', 'formulario', 'detalle', 'kpi'];
const MAX_OPERACIONES = 120;
// Motivos (de MockupFieldPolicy) por los que un dato no se pide en un formulario de alta.
const NO_SE_PIDE = new Set(['empieza en su estado inicial', 'se calcula', 'lo genera el sistema', 'solo lectura']);
// Solo la marca de tiempo del propio registro la pone el servidor. Una vigencia («finVigencia») o una apertura dependen
// del negocio (¿7 días?): no son «ahora», así que se piden o se calculan con una regla, nunca se rellenan con la fecha de hoy.
const MARCA_DE_REGISTRO = /^(?:fecha|fechahora|hora)(?:de)?(?:adquisicion|compra|creacion|registro|alta|emision|cierre|pago|confirmacion|canje)$/;
// Cantidades que elige la persona aunque el nombre parezca «derivado» (el tamaño del paquete).
const LA_ELIGE_LA_PERSONA = /^usostotales$/;
const compacto = (campo) => strip(campo).replace(/[^a-z0-9]/g, '');
const VALIDAR = /\b(?:valid\w*|verific\w*|comprob\w*)\b/;
// Un requisito de gestión («registrar o actualizar», «gestión de…») pide poder listar, crear y editar.
const GESTION = /\bgesti\w*\b|\b(?:registr\w*|cre\w*|agreg\w*)\b[^.]{0,80}\b(?:actualiz\w*|modific\w*|edit\w*)\b|\b(?:actualiz\w*|modific\w*|edit\w*)\b[^.]{0,80}\b(?:registr\w*|cre\w*|agreg\w*)\b/;
// Datos que nunca se devuelven ni se editan en una lista (la contraseña de una cuenta se cambia por su propio camino).
const SENSIBLE = /password|hash|secret|token|clave/i;

const strip = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Conserva las mayúsculas internas (listarMesas) y normaliza separadores y tildes.
const camel = (value) => {
  const words = String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  const joined = words.map((word, index) => (index ? word.charAt(0).toUpperCase() + word.slice(1) : word)).join('');
  return joined.charAt(0).toLowerCase() + joined.slice(1);
};
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? '').trim();

// Verbo del nombre del RF -> tipo de operación (solo se usa cuando la IA no responde o no cubre un RF).
const VERBOS = [
  [/\b(?:eliminar|borrar|dar de baja|anular)\b/, 'eliminar'],
  [/\b(?:consult\w*|visualiz\w*|list\w*|ver|revis\w*|mostrar|buscar)\b/, 'consulta'],
  [/\b(?:modific\w*|actualiz\w*|reasign\w*|editar|configur\w*|cerrar|marcar|cambiar|canje\w*)\b/, 'actualizar'],
  [/\b(?:registr\w*|crear|compra\w*|reserv\w*|acumul\w*|agregar|solicitar|asign\w*)\b/, 'crear']
];

/**
 * Especificación de la aplicación: describe, por RF aprobado, qué operación de negocio se ejecuta
 * (qué se filtra, qué se escribe, qué se devuelve) y qué componentes tiene cada pantalla.
 *
 * La IA solo propone. Todo lo propuesto se valida contra el modelo de dominio aprobado y se descarta si
 * referencia entidades, campos o operaciones inexistentes. Si la IA no responde, se deriva una especificación
 * básica de forma determinista, marcada como `derivado` para que la revisión humana la distinga.
 */
class ApplicationSpecService {
  constructor({ modelosIa = null, extractor = new DomainModelExtractor(), builder = new ApplicationContractBuilder() } = {}) {
    this.modelosIa = modelosIa;
    this.extractor = extractor;
    this.builder = builder;
  }

  async inferir({ requerimientos = [], diagramas = [], pantallas = [], retroalimentacion = '', analisis = null } = {}) {
    const rf = list(requerimientos).filter((item) => item.aprobado === true && String(item.tipo || '').toUpperCase() === 'RF');
    const modelo = this.extractor.fromDiagrams(diagramas);
    if (!modelo || !modelo.entities.length) {
      return { especificacion: null, advertencias: ['No hay un diagrama de clases de dominio aprobado y vigente; sin él no puede especificarse el comportamiento de la aplicación.'] };
    }
    if (!rf.length) return { especificacion: null, advertencias: ['No hay requisitos funcionales aprobados.'] };

    let propuesta = null;
    const advertencias = [];
    if (this.modelosIa && typeof this.modelosIa.generarJson === 'function') {
      try {
        propuesta = await this.modelosIa.generarJson(this.construirPrompt({ rf, modelo, pantallas, retroalimentacion, analisis }));
      } catch (error) {
        advertencias.push(`La IA no pudo completar la especificación: ${error.message}`);
      }
      if (!propuesta) advertencias.push('Ningún modelo de IA devolvió una especificación; se derivó una básica de los RF y del dominio.');
    } else {
      advertencias.push('El servicio de IA no está configurado; se derivó una especificación básica de los RF y del dominio.');
    }
    const resultado = this.depurar(propuesta, { modelo, rf, pantallas });
    return { especificacion: resultado.especificacion, advertencias: [...advertencias, ...resultado.advertencias] };
  }

  construirPrompt({ rf, modelo, pantallas = [], retroalimentacion = '', analisis = null }) {
    const requisitos = rf.map((item) => [
      `- [${item.identificador}] ${item.nombre}`,
      item.descripcion ? `  Declaración: ${item.descripcion}` : '',
      list(item.actores).length ? `  Actores: ${list(item.actores).join(', ')}` : '',
      item.precondiciones ? `  Precondición: ${item.precondiciones}` : '',
      item.poscondiciones ? `  Poscondición: ${item.poscondiciones}` : ''
    ].filter(Boolean).join('\n')).join('\n');
    const entidades = modelo.entities.map((entity) => {
      const campos = Object.entries(entity.schema.properties).filter(([name]) => name !== 'id').map(([name, property]) => {
        const tipo = property['x-references'] ? `referencia a ${property['x-references']}` : property.enum ? `enum(${property.enum.join('|')})` : `${property.type}${property.format ? `:${property.format}` : ''}`;
        return `${name}: ${tipo}`;
      });
      return `- ${entity.name}: ${campos.join(', ')}`;
    }).join('\n');
    const vistas = list(pantallas).map((screen) => {
      const rfs = list(screen.rf_trazabilidad || screen.mockup?.rf_trazabilidad);
      return `- ${this._screenId(screen)} | ${screen.nombre || screen.nombre_visible || ''}${screen.plataforma ? ` | ${screen.plataforma}` : ''}${rfs.length ? ` | RF: ${rfs.join(', ')}` : ''}`;
    }).join('\n');
    return [
      fs.readFileSync(PROMPT, 'utf8'),
      `# MODELO DE DOMINIO APROBADO\n${entidades}`,
      `# REQUISITOS FUNCIONALES APROBADOS\n${requisitos}`,
      vistas ? `# PANTALLAS (id | nombre | plataforma | RF)\n${vistas}` : '',
      analisis ? `# ANÁLISIS (reglas, restricciones y exclusiones)\n${JSON.stringify(analisis)}` : '',
      retroalimentacion ? `# OBSERVACIONES DE LA REVISIÓN ANTERIOR\n${retroalimentacion}` : ''
    ].filter(Boolean).join('\n\n');
  }

  /** Conserva lo válido, descarta el resto explicando por qué y completa con derivación determinista los RF sin operación. */
  depurar(propuesta, { modelo, rf, pantallas = [] }) {
    const advertencias = [];
    const entidades = new Map(modelo.entities.map((entity) => [entity.name, entity]));
    const rfIds = new Set(rf.map((item) => String(item.identificador).toUpperCase()));
    const operaciones = [];
    const nombres = new Set();

    const candidatas = list(propuesta?.operaciones).slice(0, MAX_OPERACIONES);
    if (list(propuesta?.operaciones).length > MAX_OPERACIONES) advertencias.push(`La IA propuso ${propuesta.operaciones.length} operaciones; se conservaron las primeras ${MAX_OPERACIONES}.`);
    candidatas.forEach((candidata, index) => {
      const { operacion, error } = this._operacion(candidata, { entidades, rfIds, nombres });
      if (error) { advertencias.push(`Se descartó la operación #${index + 1} (${candidata?.nombre || 'sin nombre'}): ${error}`); return; }
      const corregida = this._corregir(operacion, { entidad: entidades.get(operacion.entidad), requisito: rf.find((item) => String(item.identificador).toUpperCase() === operacion.rf), advertencias });
      nombres.add(corregida.nombre);
      operaciones.push({ ...corregida, origen: 'ia' });
    });

    // Los RF que la IA no cubrió reciben una operación derivada del verbo y de la entidad asociada.
    for (const requisito of rf) {
      const id = String(requisito.identificador).toUpperCase();
      if (operaciones.some((operacion) => operacion.rf === id)) continue;
      const derivada = this._derivar(requisito, { modelo, nombres });
      if (derivada) {
        nombres.add(derivada.nombre);
        operaciones.push(derivada);
        advertencias.push(`${id}: sin operación propuesta; se derivó «${derivada.nombre}» (${derivada.tipo} sobre ${derivada.entidad}). Revísala.`);
      } else if (!this._esAcceso(requisito)) {
        advertencias.push(`${id}: no se pudo asociar a ninguna entidad del dominio; no genera operación.`);
      }
    }

    const gestion = this._completarGestion(operaciones, { rf, entidades, nombres, advertencias });
    for (const { listar, actualizar } of gestion) operaciones.push(listar, actualizar);
    const porNombre = new Map(operaciones.map((operacion) => [operacion.nombre, operacion]));
    const vistas = this._pantallas(propuesta?.pantallas, { porNombre, entidades, pantallas, advertencias });
    for (const triple of gestion) this._reorganizarGestion(vistas, triple, advertencias);
    this._cablearEdicion(operaciones, vistas, pantallas, advertencias);
    operaciones.forEach((operacion, index) => { operacion.id = `OP-${String(index + 1).padStart(2, '0')}`; });
    const sinPantalla = operaciones.filter((operacion) => !vistas.some((vista) => vista.componentes.some((c) => c.operacion === operacion.nombre || c.acciones.some((a) => a.operacion === operacion.nombre))));
    if (vistas.length && sinPantalla.length) advertencias.push(`Operaciones sin ninguna pantalla que las use: ${sinPantalla.map((operacion) => operacion.nombre).join(', ')}.`);

    return { especificacion: { version: 1, operaciones, pantallas: vistas }, advertencias };
  }

  /**
   * Revalida una especificación ya guardada (editada o aprobada) sin derivar nada nuevo. Conserva el origen y la decisión
   * de cada operación; devuelve `errores` si alguna dejó de ser válida (el dominio o los RF cambiaron).
   */
  validar(guardada, { modelo, rf, pantallas = [], cablear = true }) {
    const entidades = new Map(modelo.entities.map((entity) => [entity.name, entity]));
    const rfIds = new Set(rf.map((item) => String(item.identificador).toUpperCase()));
    const errores = [];
    const operaciones = [];
    const nombres = new Set();
    list(guardada?.operaciones).forEach((candidata, index) => {
      const { operacion, error } = this._operacion(candidata, { entidades, rfIds, nombres });
      if (error) { errores.push(`«${candidata?.nombre || `#${index + 1}`}»: ${error}`); return; }
      nombres.add(operacion.nombre);
      const decision = ['confirmado', 'rechazado'].includes(candidata.estado_decision) ? candidata.estado_decision : 'pendiente';
      operaciones.push({ ...operacion, id: `OP-${String(operaciones.length + 1).padStart(2, '0')}`, origen: candidata.origen === 'derivado' ? 'derivado' : candidata.origen === 'manual' ? 'manual' : 'ia', estado_decision: decision });
    });
    const avisos = [];
    // Los botones y componentes de una operación rechazada no pueden quedar en las pantallas.
    const vigentes = new Map(operaciones.filter((op) => op.estado_decision !== 'rechazado').map((op) => [op.nombre, op]));
    const vistas = this._pantallas(guardada?.pantallas, { porNombre: vigentes, entidades, pantallas, advertencias: avisos });
    // Sin el árbol de pantallas (al generar) no se conocen los roles: no se cablea nada nuevo, solo se normaliza.
    if (cablear) this._cablearEdicion(operaciones.filter((op) => op.estado_decision !== 'rechazado'), vistas, pantallas, avisos);
    return { operaciones, pantallas: vistas, errores, avisos };
  }

  _operacion(candidata, { entidades, rfIds, nombres }) {
    if (!candidata || typeof candidata !== 'object') return { error: 'no es un objeto.' };
    const nombre = camel(candidata.nombre);
    if (!/^[a-z][a-zA-Z0-9]{2,60}$/.test(nombre)) return { error: 'el nombre no es válido.' };
    if (nombres.has(nombre)) return { error: 'el nombre ya existe.' };
    const rf = text(candidata.rf).toUpperCase();
    if (!rfIds.has(rf)) return { error: `el RF «${candidata.rf}» no está aprobado.` };
    const tipo = text(candidata.tipo);
    if (!TIPOS.includes(tipo)) return { error: `el tipo «${tipo}» no es válido.` };
    const entidad = entidades.get(text(candidata.entidad));
    if (!entidad) return { error: `la entidad «${candidata.entidad}» no existe en el dominio.` };
    const campos = entidad.schema.properties;
    const existe = (campo) => Object.prototype.hasOwnProperty.call(campos, campo);

    const filtros = [];
    for (const filtro of list(candidata.filtros)) {
      if (!filtro || !existe(filtro.campo)) return { error: `el filtro usa el campo inexistente «${filtro?.campo}».` };
      if (!OPERADORES.includes(filtro.operador || '==')) return { error: `el operador «${filtro.operador}» no es válido.` };
      if (!ORIGENES.includes(filtro.origen)) return { error: `el origen de filtro «${filtro.origen}» no es válido.` };
      if (filtro.origen === 'sesion' && !VALORES_SESION.includes(filtro.valor)) return { error: `el valor de sesión «${filtro.valor}» no es válido.` };
      if (filtro.origen !== 'sesion' && (filtro.valor === undefined || filtro.valor === '')) return { error: `el filtro de «${filtro.campo}» no tiene valor.` };
      filtros.push({ campo: filtro.campo, operador: filtro.operador || '==', origen: filtro.origen, valor: filtro.valor });
    }
    const subconjunto = (lista, etiqueta) => {
      const valores = list(lista).map(text).filter(Boolean);
      const falta = valores.find((campo) => !existe(campo));
      return falta ? { error: `${etiqueta} incluye el campo inexistente «${falta}».` } : { valores: [...new Set(valores)] };
    };
    const entradas = subconjunto(candidata.entradas, 'las entradas');
    if (entradas.error) return { error: entradas.error };
    const salida = subconjunto(candidata.salida, 'la salida');
    if (salida.error) return { error: salida.error };
    if (['crear', 'actualizar'].includes(tipo) && !entradas.valores.length) return { error: `una operación de tipo ${tipo} necesita entradas.` };

    let transicion = null;
    if (tipo === 'transicion') {
      const campo = text(candidata.transicion?.campo);
      const valores = campos[campo]?.enum;
      if (!valores) return { error: `la transición debe usar un campo enum del dominio (recibido «${campo}»).` };
      const destino = text(candidata.transicion?.a);
      const origen = list(candidata.transicion?.de).map(text).filter(Boolean);
      if (!valores.includes(destino) || origen.some((valor) => !valores.includes(valor))) return { error: `la transición usa estados fuera de ${valores.join('|')}.` };
      transicion = { campo, de: origen, a: destino };
    }
    const operacion = {
      nombre, rf, tipo, entidad: entidad.name, entidadClave: entidad.key,
      actores: list(candidata.actores).map(text).filter(Boolean),
      filtros, entradas: entradas.valores, salida: salida.valores, ...(transicion ? { transicion } : {}),
      descripcion: text(candidata.descripcion).slice(0, 300), estado_decision: 'pendiente',
      ...(list(candidata.sesionEntradas).length ? { sesionEntradas: list(candidata.sesionEntradas).filter((item) => existe(item?.campo) && item.valor === 'usuario.id').map((item) => ({ campo: item.campo, valor: item.valor })) } : {}),
      ...(list(candidata.autoEntradas).length ? { autoEntradas: list(candidata.autoEntradas).filter((item) => existe(item?.campo) && ['ahora', 'hoy', 'inicial', 'generado'].includes(item.valor)).map((item) => ({ campo: item.campo, valor: item.valor, ...(item.valor === 'inicial' && Array.isArray(item.opciones) ? { opciones: item.opciones.map(String) } : {}) })) } : {})
    };
    return { operacion: this._completarDelSistema(operacion, entidad) };
  }

  /**
   * Un requisito de gestión que solo trae «crear» no deja corregir un registro: se le añaden, derivadas y pendientes de
   * revisión, la consulta que lista los registros y la actualización que edita uno. La contraseña no se lista ni se edita aquí.
   */
  _completarGestion(operaciones, { rf, entidades, nombres, advertencias }) {
    const resultado = [];
    for (const crear of operaciones.filter((operacion) => operacion.tipo === 'crear')) {
      const requisito = rf.find((item) => String(item.identificador).toUpperCase() === crear.rf);
      if (!requisito || !GESTION.test(strip(`${requisito.nombre} ${requisito.descripcion}`))) continue;
      if (operaciones.some((operacion) => operacion.rf === crear.rf && operacion.tipo !== 'crear')) continue;
      const entidad = entidades.get(crear.entidad);
      const editables = crear.entradas.filter((campo) => !SENSIBLE.test(campo));
      if (!entidad || !editables.length) continue;
      const unico = (base) => { let nombre = base; for (let n = 2; nombres.has(nombre); n += 1) nombre = `${base}${n}`; nombres.add(nombre); return nombre; };
      const visibles = Object.keys(entidad.schema.properties).filter((campo) => campo !== 'id' && !SENSIBLE.test(campo));
      const base = { rf: crear.rf, entidad: crear.entidad, entidadClave: crear.entidadClave, actores: crear.actores, estado_decision: 'pendiente', origen: 'derivado' };
      const listar = { ...base, nombre: unico(`listar${crear.entidad}`), tipo: 'consulta', filtros: [], entradas: [], salida: visibles, descripcion: `Lista los registros de ${crear.entidad} para revisarlos y editarlos.` };
      const actualizar = { ...base, nombre: unico(`actualizar${crear.entidad}`), tipo: 'actualizar', filtros: [], entradas: editables, salida: [], descripcion: `Modifica un registro de ${crear.entidad}.` };
      advertencias.push(`${crear.rf}: el requisito es de gestión y solo traía crear; se añadieron «${listar.nombre}» y «${actualizar.nombre}» para poder listar y editar. Revísalas.`);
      resultado.push({ crear, listar, actualizar });
    }
    return resultado;
  }

  /**
   * Una actualización que ninguna pantalla usa no se puede ejecutar: se añade como botón «Editar» por fila a la lista de la
   * misma entidad, prefiriendo la pantalla del mismo requisito y de un rol que pueda ejecutarla. Sin lista que la acoja, queda
   * como estaba (la revisión ya avisa de que no tiene pantalla).
   */
  _cablearEdicion(operaciones, vistas, pantallas, advertencias) {
    const operacionDe = new Map(operaciones.map((op) => [op.nombre, op]));
    const pantallaPorId = new Map(list(pantallas).map((screen) => [this._screenId(screen), screen]));
    // Un «Editar» que quedó en una pantalla cuyo rol no puede ejecutarlo (cableado antes de conocer los roles) se retira.
    for (const vista of vistas) {
      const roles = Compatibility.rolesOf(pantallaPorId.get(vista.id));
      if (!roles.length) continue;
      for (const componente of vista.componentes) {
        componente.acciones = componente.acciones.filter((accion) => {
          const op = operacionDe.get(accion.operacion);
          const actores = (op?.actores || []).map(Compatibility.canonicalRole);
          const ajena = accion.etiqueta === 'Editar' && op?.tipo === 'actualizar' && actores.length && !roles.some((rol) => actores.includes(rol));
          if (ajena) advertencias.push(`Pantalla ${vista.id}: se retiró «Editar» (${op.nombre}): lo ejecuta ${actores.join(' / ')} y la pantalla es de ${roles.join(' / ')}.`);
          return !ajena;
        });
      }
    }
    const usadas = new Set(vistas.flatMap((vista) => vista.componentes.flatMap((c) => [c.operacion, ...c.acciones.map((a) => a.operacion)])));
    const porNombre = new Map(operaciones.map((op) => [op.nombre, op]));
    const pantallaDe = new Map(list(pantallas).map((screen) => [this._screenId(screen), screen]));
    for (const edicion of operaciones.filter((op) => op.tipo === 'actualizar' && !usadas.has(op.nombre))) {
      const actores = (edicion.actores || []).map(Compatibility.canonicalRole);
      const candidatos = vistas.flatMap((vista) => vista.componentes
        .filter((c) => ['tabla', 'tarjetas'].includes(c.tipo))
        .map((componente) => ({ vista, componente, lista: porNombre.get(componente.operacion) }))
        .filter((x) => x.lista?.tipo === 'consulta' && x.lista.entidad === edicion.entidad))
        .map((x) => {
          const roles = Compatibility.rolesOf(pantallaDe.get(x.vista.id));
          const puede = !roles.length || !actores.length || roles.some((rol) => actores.includes(rol));
          return { ...x, puede, puntos: (x.lista.rf === edicion.rf ? 2 : 0) + (puede ? 1 : 0) };
        })
        .filter((x) => x.puede)
        .sort((a, b) => b.puntos - a.puntos);
      const elegido = candidatos[0];
      if (!elegido) continue;
      elegido.componente.acciones.push({ etiqueta: 'Editar', operacion: edicion.nombre });
      advertencias.push(`Pantalla ${elegido.vista.id}: se añadió «Editar» (${edicion.nombre}) a la lista de ${edicion.entidad}, porque ninguna pantalla la usaba.`);
    }
  }

  /** La pantalla de un requisito de gestión pasa de un formulario de alta a una lista con «Nuevo» y «Editar» por fila. */
  _reorganizarGestion(vistas, { crear, listar, actualizar }, advertencias) {
    for (const vista of vistas) {
      const indice = vista.componentes.findIndex((componente) => componente.operacion === crear.nombre && componente.tipo === 'formulario');
      if (indice < 0) continue;
      vista.componentes[indice] = {
        tipo: 'tabla', operacion: listar.nombre, campos: listar.salida,
        acciones: [{ etiqueta: `Nuevo ${crear.entidad.toLowerCase()}`, operacion: crear.nombre }, { etiqueta: 'Editar', operacion: actualizar.nombre }]
      };
      advertencias.push(`Pantalla ${vista.id}: ahora lista los registros de ${crear.entidad}, con «Nuevo» y «Editar».`);
    }
  }

  /**
   * Lo que no debe preguntarse a la persona al crear un registro: quién lo crea (la cuenta de la sesión, cuando el campo
   * apunta a la entidad de cuentas) y la marca de tiempo del propio registro. El servidor los completa y no se pueden
   * falsificar desde la petición. Idempotente: se puede aplicar a una operación ya guardada.
   */
  _completarDelSistema(operacion, entidad) {
    if (operacion.tipo !== 'crear') return operacion;
    const propiedades = entidad.schema.properties;
    const sesion = list(operacion.sesionEntradas).slice();
    const auto = list(operacion.autoEntradas).slice();
    for (const campo of operacion.entradas) {
      const objetivo = String(propiedades[campo]?.['x-references'] || '');
      if (/^usuarios?$/i.test(objetivo) && entidad.key !== 'usuario' && !sesion.some((item) => item.campo === campo)) sesion.push({ campo, valor: 'usuario.id' });
      else if (auto.some((item) => item.campo === campo)) continue;
      else if (MARCA_DE_REGISTRO.test(compacto(campo)) && ['string'].includes(propiedades[campo]?.type)) {
        auto.push({ campo, valor: propiedades[campo]?.format === 'date' ? 'hoy' : 'ahora' });
      } else if (systemManaged(campo, propiedades[campo]) === 'empieza en su estado inicial' && propiedades[campo]?.enum?.length) {
        // El estado inicial lo fija el servidor (el primero del dominio): sin él, las reglas que exigen el estado rechazarían el alta.
        auto.push({ campo, valor: 'inicial', opciones: propiedades[campo].enum });
      } else if (systemManaged(campo, propiedades[campo]) === 'lo genera el sistema' && propiedades[campo]?.type === 'string' && !(entidad.key === 'usuario' && /^password/i.test(campo))) {
        // Códigos que genera el sistema (el QR de una reserva): el servidor los crea; la persona no los inventa.
        auto.push({ campo, valor: 'generado' });
      }
    }
    // Lo que el servidor debe aportar aunque la propuesta no lo liste (la IA suele omitir el estado y el código del QR): sin eso la
    // reserva nacería sin estado ni código. Solo estado inicial, códigos generados y la fecha del propio registro.
    for (const [campo, definicion] of Object.entries(propiedades)) {
      if (campo === 'id' || definicion?.readOnly || operacion.entradas.includes(campo) || [...sesion, ...auto].some((item) => item.campo === campo)) continue;
      const razon = systemManaged(campo, definicion);
      if (razon === 'empieza en su estado inicial' && definicion?.enum?.length) auto.push({ campo, valor: 'inicial', opciones: definicion.enum });
      else if (razon === 'lo genera el sistema' && definicion?.type === 'string' && !(entidad.key === 'usuario' && /^password/i.test(campo))) auto.push({ campo, valor: 'generado' });
      else if (MARCA_DE_REGISTRO.test(compacto(campo)) && definicion?.type === 'string') auto.push({ campo, valor: definicion?.format === 'date' ? 'hoy' : 'ahora' });
    }
    const completados = new Set([...sesion, ...auto].map((item) => item.campo));
    // «Quién lo registra» solo se omite cuando se puede resolver (la cuenta de la sesión). Una referencia al propio actor
    // que no se puede resolver (cliente_id de un cliente) se conserva: sin ella el registro quedaría sin dueño.
    const actores = operacion.actores.map(strip);
    const conservadas = Object.entries(propiedades)
      .filter(([campo, definicion]) => definicion?.['x-references'] && !completados.has(campo) && !operacion.entradas.includes(campo)
        && !/^usuarios?$/i.test(String(definicion['x-references'])) && String(definicion['x-references']) !== entidad.name
        && actores.some((actor) => actor.includes(strip(campo).replace(/_?id$/, ''))))
      .map(([campo]) => campo);
    return {
      ...operacion,
      entradas: [...operacion.entradas.filter((campo) => !completados.has(campo)), ...conservadas],
      ...(sesion.length ? { sesionEntradas: sesion } : {}), ...(auto.length ? { autoEntradas: auto } : {})
    };
  }

  /** ¿Se muestra este dato en el formulario de la operación? Lo que completa el sistema o se calcula no se pregunta. */
  _seMuestra(operacion, campo, entidad) {
    if (operacion.tipo !== 'crear') return true;
    if ([...list(operacion.sesionEntradas), ...list(operacion.autoEntradas)].some((item) => item.campo === campo)) return false;
    // La contraseña de una cuenta sí la escribe la persona: «hash» aquí es el nombre técnico del dato, no algo generado.
    if (entidad.key === 'usuario' && /^password/i.test(campo)) return true;
    if (LA_ELIGE_LA_PERSONA.test(compacto(campo))) return true;
    return !NO_SE_PIDE.has(systemManaged(campo, entidad.schema.properties[campo]));
  }

  /**
   * Una validación («validar el QR») no modifica el dato que identifica al registro: lo busca. Si la IA la propuso como
   * actualización de un código generado, se convierte en una consulta por ese campo.
   */
  _corregir(operacion, { entidad, requisito, advertencias }) {
    const propiedades = entidad.schema.properties;
    const soloGenerados = operacion.entradas.length > 0 && operacion.entradas.every((campo) => systemManaged(campo, propiedades[campo]) === 'lo genera el sistema');
    if (operacion.tipo === 'actualizar' && soloGenerados && VALIDAR.test(strip(`${requisito?.nombre || ''} ${operacion.nombre}`))) {
      const campo = operacion.entradas[0];
      advertencias.push(`${operacion.rf}: «${operacion.nombre}» modificaba «${campo}», que identifica al registro; se convirtió en una consulta por ese campo. Revísala.`);
      return {
        ...operacion, tipo: 'consulta', entradas: [], filtros: [{ campo, operador: '==', origen: 'parametro', valor: campo }],
        salida: Object.keys(propiedades).filter((nombre) => nombre !== 'id' && !propiedades[nombre].readOnly)
      };
    }
    if (operacion.tipo === 'consulta' && operacion.salida.length === 1 && Object.keys(propiedades).filter((nombre) => nombre !== 'id').length > 1) {
      advertencias.push(`${operacion.rf}: «${operacion.nombre}» devuelve un solo campo («${operacion.salida[0]}»). Si la pantalla necesita datos de otras entidades (platos, mesa), todavía no se incluyen: amplía la salida o se verá casi vacía.`);
    }
    return operacion;
  }

  /** Operación mínima y honesta para un RF sin propuesta: el verbo fija el tipo y la entidad sale del asociador existente. */
  _derivar(requisito, { modelo, nombres }) {
    if (this._esAcceso(requisito)) return null;
    const match = this.builder._entityFor(requisito, modelo.entities);
    if (!match) return null;
    const nombreRf = strip(requisito.nombre);
    const tipo = (VERBOS.find(([patron]) => patron.test(nombreRf)) || [null, 'consulta'])[1];
    const entidad = match.primary;
    const campos = Object.keys(entidad.schema.properties).filter((campo) => campo !== 'id' && !entidad.schema.properties[campo].readOnly);
    let base = `${{ consulta: 'consultar', crear: 'registrar', actualizar: 'actualizar', eliminar: 'eliminar' }[tipo]}${entidad.name}`;
    base = camel(base.replace(/([a-z0-9])([A-Z])/g, '$1 $2'));
    let nombre = base;
    for (let n = 2; nombres.has(nombre); n += 1) nombre = `${base}${n}`;
    return this._completarDelSistema({
      nombre, rf: String(requisito.identificador).toUpperCase(), tipo, entidad: entidad.name, entidadClave: entidad.key,
      actores: list(requisito.actores).map(text).filter(Boolean), filtros: [],
      entradas: ['crear', 'actualizar'].includes(tipo) ? campos : [], salida: tipo === 'consulta' ? campos : [],
      descripcion: text(requisito.nombre), estado_decision: 'pendiente', origen: 'derivado'
    }, entidad);
  }

  _esAcceso(requisito) {
    return /\b(?:autentic\w*|inicio de sesion|iniciar sesion|login)\b/.test(strip(requisito.nombre));
  }

  _pantallas(propuestas, { porNombre, entidades, pantallas, advertencias }) {
    const conocidas = new Map(list(pantallas).map((screen) => [this._screenId(screen), screen]));
    const vistas = [];
    for (const propuesta of list(propuestas)) {
      const id = text(propuesta?.id);
      if (!id || (conocidas.size && !conocidas.has(id))) { advertencias.push(`Se descartó la pantalla «${id || 'sin id'}»: no existe en el árbol de navegación.`); continue; }
      const componentes = [];
      for (const componente of list(propuesta.componentes)) {
        const operacion = porNombre.get(text(componente?.operacion));
        if (!COMPONENTES.includes(text(componente?.tipo)) || !operacion) { advertencias.push(`Pantalla ${id}: se descartó un componente (${componente?.tipo}/${componente?.operacion}) con tipo u operación inválidos.`); continue; }
        const props = entidades.get(operacion.entidad).schema.properties;
        const entidadOp = entidades.get(operacion.entidad);
        const propuestos = list(componente.campos).map(text).filter((campo) => Object.prototype.hasOwnProperty.call(props, campo));
        let campos = propuestos.filter((campo) => this._seMuestra(operacion, campo, entidadOp));
        // Un formulario sin ningún campo no sirve: si todo era «del sistema», se conserva lo que la persona pueda rellenar.
        if (!campos.length && propuestos.length && operacion.tipo === 'crear') {
          campos = propuestos.filter((campo) => ![...list(operacion.sesionEntradas), ...list(operacion.autoEntradas)].some((item) => item.campo === campo));
          if (campos.length) advertencias.push(`Pantalla ${id}: todos los campos de «${operacion.nombre}» parecían del sistema; se conservan para que el formulario no quede vacío. Revísalos.`);
        }
        let tipoComponente = text(componente.tipo);
        if (tipoComponente === 'formulario' && operacion.tipo === 'consulta') {
          tipoComponente = 'tarjetas';
          advertencias.push(`Pantalla ${id}: «${operacion.nombre}» solo consulta; se muestra como tarjetas con su filtro en lugar de un formulario de alta.`);
        }
        const acciones = [];
        for (const accion of list(componente.acciones)) {
          const destino = porNombre.get(text(accion?.operacion));
          if (!destino || !text(accion?.etiqueta)) { advertencias.push(`Pantalla ${id}: se descartó el botón «${accion?.etiqueta || ''}» porque no ejecuta una operación definida.`); continue; }
          acciones.push({ etiqueta: text(accion.etiqueta), operacion: destino.nombre });
        }
        componentes.push({ tipo: tipoComponente, operacion: operacion.nombre, campos, acciones });
      }
      if (componentes.length) vistas.push({ id, componentes });
    }
    return vistas;
  }

  _screenId(screen) {
    return text(screen?.pantalla_id || screen?.slug || screen?.nombre_pantalla || screen?.nombre)
      .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
}

/** Solo lo confirmado por una persona llega a los generadores; las operaciones pendientes o rechazadas se ignoran. */
ApplicationSpecService.confirmada = (decision) => {
  const operaciones = list(decision?.operaciones).filter((op) => op.estado_decision === 'confirmado');
  if (!operaciones.length) return null;
  const nombres = new Set(operaciones.map((op) => op.nombre));
  // Un componente o botón que apunta a una operación no confirmada se descarta: no podría ejecutarse.
  const pantallas = list(decision.pantallas).map((pantalla) => ({
    ...pantalla,
    componentes: list(pantalla.componentes).filter((c) => nombres.has(c.operacion)).map((c) => ({ ...c, acciones: list(c.acciones).filter((a) => nombres.has(a.operacion)) }))
  })).filter((pantalla) => pantalla.componentes.length);
  return { version: decision.version || 1, operaciones, pantallas };
};

ApplicationSpecService.TIPOS = TIPOS;
module.exports = ApplicationSpecService;
