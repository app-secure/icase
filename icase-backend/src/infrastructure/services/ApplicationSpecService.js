const fs = require('node:fs');
const path = require('node:path');
const DomainModelExtractor = require('./DomainModelExtractor');
const Compatibility = require('../../core/services/RequirementScreenCompatibility');
const ApplicationContractBuilder = require('./ApplicationContractBuilder');
const { systemManaged } = require('./MockupFieldPolicy');

const PROMPT = path.join(__dirname, '..', 'prompts', 'analista_especificacion_aplicacion.md');
const TIPOS = ['consulta', 'crear', 'actualizar', 'eliminar', 'transicion', 'resumen'];
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

    // Los RF de reporte («más vendidos», «reporte de ventas por fechas») necesitan agregados: se derivan como resumen aunque la
    // IA haya propuesto una consulta plana (que solo listaría registros) o nada.
    for (const requisito of rf) {
      const id = String(requisito.identificador).toUpperCase();
      if (operaciones.some((operacion) => operacion.rf === id && operacion.tipo === 'resumen')) continue;
      const resumen = this._derivarResumen(requisito, { entidades, operaciones, nombres });
      if (!resumen) continue;
      const validado = this._operacion(resumen, { entidades, rfIds, nombres });
      if (validado.error) { advertencias.push(`${id}: no se pudo derivar el reporte (${validado.error}).`); continue; }
      nombres.add(validado.operacion.nombre);
      operaciones.push({ ...validado.operacion, origen: 'derivado' });
      advertencias.push(`${id}: reporte derivado «${validado.operacion.nombre}» (${validado.operacion.resumen.medidas.map((medida) => medida.nombre).join(', ')}). Revísalo.`);
    }
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
    this._colgarResumenes(operaciones, vistas, pantallas);
    for (const triple of gestion) this._reorganizarGestion(vistas, triple, advertencias);
    operaciones.push(...this._cablearEdicion(operaciones, vistas, pantallas, advertencias));
    operaciones.forEach((operacion, index) => { operacion.id = `OP-${String(index + 1).padStart(2, '0')}`; });
    this._reponerAlAnular(operaciones, entidades);
    const sinPantalla = operaciones.filter((operacion) => !vistas.some((vista) => vista.componentes.some((c) => c.operacion === operacion.nombre || c.acciones.some((a) => a.operacion === operacion.nombre))));
    if (vistas.length && sinPantalla.length) advertencias.push(`Operaciones sin ninguna pantalla que las use: ${sinPantalla.map((operacion) => operacion.nombre).join(', ')}.`);

    return { especificacion: { version: 1, operaciones, pantallas: vistas }, advertencias };
  }

  /**
   * Revalida una especificación ya guardada (editada o aprobada) sin derivar nada nuevo. Conserva el origen y la decisión
   * de cada operación; devuelve `errores` si alguna dejó de ser válida (el dominio o los RF cambiaron).
   */
  validar(guardada, { modelo, rf, pantallas = [], cablear = true, verbosPorRf = null }) {
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
    if (cablear) {
      const añadidas = this._cablearEdicion(operaciones.filter((op) => op.estado_decision !== 'rechazado'), vistas, pantallas, avisos);
      for (const operacion of añadidas) operaciones.push({ ...operacion, id: `OP-${String(operaciones.length + 1).padStart(2, '0')}` });
      const relacionadas = this._completarRelacionadas(operaciones.filter((op) => op.estado_decision !== 'rechazado'), vistas, { entidades, verbosPorRf, avisos, nombres: new Set(operaciones.map((op) => op.nombre)) });
      for (const operacion of relacionadas) operaciones.push({ ...operacion, id: `OP-${String(operaciones.length + 1).padStart(2, '0')}` });
    }
    this._reponerAlAnular(operaciones, entidades);
    return { operaciones, pantallas: vistas, errores, avisos };
  }

  /**
   * Anular o cancelar un registro con líneas (una venta) devuelve las existencias que su alta descontó: la transición
   * lleva las líneas del alta para reponer el stock de cada producto.
   */
  _reponerAlAnular(operaciones, entidades = null) {
    for (const transicion of operaciones.filter((op) => op.tipo === 'transicion' && op.transicion && /^(anul|cancel|devuel|revert|rechaz)/i.test(String(op.transicion.a || '')))) {
      const alta = operaciones.find((op) => op.tipo === 'crear' && op.entidad === transicion.entidad && op.lineas?.stock && op.estado_decision !== 'rechazado');
      if (alta) transicion.reponer = { ...alta.lineas };
    }
    // «Anular venta» registrada como alta de AnulacionVenta (con su motivo) para una venta: además de guardar el motivo, la venta
    // pasa a «anulada», sus productos recuperan el stock y sus documentos vinculados (la factura) quedan anulados.
    for (const alta of operaciones.filter((op) => op.tipo === 'crear' && op.vincula && /anul|cancel/i.test(`${op.entidad} ${op.nombre}`))) {
      const dueño = entidades?.get(alta.vincula.entidad);
      const props = dueño?.schema?.properties || {};
      const estado = Object.keys(props).find((campo) => /^estado$/i.test(campo));
      if (!estado) continue;
      const anulado = (props[estado].enum || []).find((valor) => /^(anul|cancel)/i.test(valor)) || 'anulada';
      const lineasDueño = operaciones.find((op) => op.tipo === 'crear' && op.entidad === alta.vincula.entidad && op.lineas?.stock && op.estado_decision !== 'rechazado')?.lineas;
      const documentos = Object.entries(props)
        .filter(([campo, def]) => campo !== alta.vincula.campo && def?.['x-references'] && entidades.get(def['x-references'])?.schema?.properties?.estado)
        .map(([campo, def]) => {
          const doc = entidades.get(def['x-references']);
          const valores = doc.schema.properties.estado.enum || [];
          return { campo, entidad: doc.name, entidadClave: doc.key, estado: 'estado', valor: valores.find((valor) => /^(anul|cancel)/i.test(valor)) || 'anulada' };
        })
        .filter((doc) => /factura|boleta|recibo|comprobante|ticket/i.test(doc.entidad));
      alta.anula = { estado, valor: anulado, ...(lineasDueño ? { reponer: { ...lineasDueño } } : {}), ...(documentos.length ? { documentos } : {}) };
    }
    return operaciones;
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

    // Resumen (reporte): agrupa, cuenta y suma; su rango de fechas puede estar en la cabecera («via»): las líneas no tienen fecha.
    let resumen = null;
    if (tipo === 'resumen') {
      resumen = this._resumenDe(candidata.resumen, entidad, entidades);
      if (resumen.error) return { error: resumen.error };
    }
    const camposVia = resumen?.via ? entidades.get(resumen.via.entidad)?.schema?.properties || {} : null;
    const filtros = [];
    for (const filtro of list(candidata.filtros)) {
      if (resumen && filtro?.en === 'via' && camposVia && Object.prototype.hasOwnProperty.call(camposVia, filtro.campo)
        && OPERADORES.includes(filtro.operador || '==') && ORIGENES.includes(filtro.origen) && filtro.origen !== 'sesion' && filtro.valor !== undefined && filtro.valor !== '') {
        filtros.push({ campo: filtro.campo, operador: filtro.operador || '==', origen: filtro.origen, valor: filtro.valor, en: 'via' });
        continue;
      }
      // En un alta, edición o transición los filtros no eligen filas: uno con un campo ajeno se ignora en vez de descartar
      // la operación entera (así se perdían «emitirFactura» y «anularVenta»).
      if ((!filtro || !existe(filtro.campo)) && !['consulta', 'resumen'].includes(tipo)) continue;
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
    // «venta_id» en una operación sobre Venta es el propio registro (el id de la ruta), no un campo de entrada.
    const propioId = new Set(['id', `${String(entidad.key || '').toLowerCase()}_id`, `${String(entidad.name || '').toLowerCase()}_id`]);
    // Emitir una factura «para la venta X»: la referencia vive en Venta (factura_id), no en Factura. El alta recibe el
    // id de la venta y, al crearse, la venta queda vinculada a esta factura (una sola por venta).
    let vincula = null;
    // Una especificación ya normalizada trae la vinculación guardada (su venta_id ya no está en las entradas): se revalida.
    if (tipo === 'crear' && candidata.vincula) {
      const dueño = entidades.get(text(candidata.vincula.entidad));
      const campoDueño = text(candidata.vincula.campo);
      if (dueño && dueño.schema.properties[campoDueño]?.['x-references'] === entidad.name) {
        vincula = { entidad: dueño.name, entidadClave: dueño.key, parametro: text(candidata.vincula.parametro) || `${dueño.key}_id`, campo: campoDueño };
      }
    }
    const brutas = list(candidata.entradas).filter((campo) => !propioId.has(String(text(campo)).toLowerCase()));
    if (tipo === 'crear') {
      for (const campo of brutas.map(text).filter((item) => !existe(item) && /_id$/i.test(item))) {
        const dueño = [...entidades.values()].find((item) => campo.toLowerCase() === `${String(item.key || '').toLowerCase()}_id` || campo.toLowerCase() === `${String(item.name || '').toLowerCase()}_id`);
        const enlace = dueño && Object.entries(dueño.schema.properties).find(([, def]) => def?.['x-references'] === entidad.name);
        if (enlace && !vincula) vincula = { entidad: dueño.name, entidadClave: dueño.key, parametro: campo, campo: enlace[0] };
      }
    }
    const entradas = subconjunto(brutas.filter((campo) => !(vincula && text(campo) === vincula.parametro)), 'las entradas');
    if (entradas.error) return { error: entradas.error };
    const relacionadas = this._relacionadasDe(candidata.relacionadas, entidades);
    const derivados = new Set(relacionadas.flatMap((rel) => [...rel.campos.map((campo) => `${rel.clave}_${campo}`), ...(rel.items ? [`${rel.clave}_items`] : [])]));
    // La salida de un resumen son su agrupación y sus medidas, no campos guardados.
    const salida = resumen ? { valores: [...(resumen.agruparPor ? [resumen.agruparPor] : []), ...resumen.medidas.map((medida) => medida.nombre)] }
      : subconjunto(list(candidata.salida).filter((campo) => !derivados.has(text(campo))), 'la salida');
    if (salida.error) return { error: salida.error };
    if (derivados.size) salida.valores = [...new Set([...list(candidata.salida).map(text).filter((campo) => derivados.has(campo)), ...salida.valores])];
    const sobre = this._sobreDe(candidata.sobre, entidades, entidad);
    if (['crear', 'actualizar'].includes(tipo) && !entradas.valores.length && !vincula) return { error: `una operación de tipo ${tipo} necesita entradas.` };

    let transicion = null;
    if (tipo === 'transicion') {
      // «desactivarProducto» sin campo ni estados: el campo es «estado» y el destino sale del verbo (desactivar → inactivo).
      const verbo = strip(nombre);
      const inferido = /^desactiv|^inhabilit|^bloque/.test(verbo) ? { de: ['activo'], a: 'inactivo' } : /^(activ|habilit|reactiv)/.test(verbo) ? { de: ['inactivo'], a: 'activo' }
        : /^anul/.test(verbo) ? { de: ['activa'], a: 'anulada' } : /^cancel/.test(verbo) ? { de: [], a: 'cancelada' } : null;
      const campo = text(candidata.transicion?.campo) || (Object.keys(campos).find((item) => /^estado$/i.test(item)) || '');
      if (campos[campo] && inferido && !text(candidata.transicion?.a)) {
        const valoresEnum = campos[campo].enum;
        const ajustar = (valor) => (valoresEnum ? valoresEnum.find((item) => strip(item).startsWith(strip(valor).slice(0, 5))) || valor : valor);
        candidata = { ...candidata, transicion: { campo, de: inferido.de.map(ajustar), a: ajustar(inferido.a) } };
      }
      // Un «estado» de texto (sin enum en el diagrama) admite los estados que la propia transición declara.
      const declarados = [...list(candidata.transicion?.de).map(text), text(candidata.transicion?.a)].filter(Boolean);
      const valores = campos[campo]?.enum || (campos[campo]?.type === 'string' && /^(estado|status|situacion)$/i.test(campo) && declarados.length >= 2 ? [...new Set(declarados)] : null);
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
      ...(relacionadas.length && tipo === 'consulta' ? { relacionadas } : {}), ...(sobre && tipo === 'transicion' ? { sobre } : {}),
      ...(vincula ? { vincula } : {}),
      ...(resumen ? { resumen } : {}),
      descripcion: text(candidata.descripcion).slice(0, 300), estado_decision: 'pendiente',
      ...(list(candidata.sesionEntradas).length ? { sesionEntradas: list(candidata.sesionEntradas).filter((item) => existe(item?.campo) && item.valor === 'usuario.id').map((item) => ({ campo: item.campo, valor: item.valor })) } : {}),
      ...(list(candidata.autoEntradas).length ? { autoEntradas: list(candidata.autoEntradas).filter((item) => existe(item?.campo) && ['ahora', 'hoy', 'inicial', 'generado', 'cero', 'lineas', 'correlativo', 'vinculado'].includes(item.valor)).map((item) => ({ campo: item.campo, valor: item.valor, ...(item.valor === 'inicial' && Array.isArray(item.opciones) ? { opciones: item.opciones.map(String) } : {}), ...(item.valor === 'correlativo' ? { prefijo: String(item.prefijo || ''), digitos: Number(item.digitos) || 5 } : {}), ...(item.valor === 'vinculado' && item.desde ? { desde: String(item.desde) } : {}) })) } : {})
    };
    return { operacion: this._completarDelSistema(operacion, entidad, entidades) };
  }

  /** Valida un resumen: agrupación por un campo propio, medidas contar/sumar/promedio sobre números, y cabecera opcional. */
  _resumenDe(candidato, entidad, entidades) {
    const props = entidad.schema.properties;
    const numero = (campo) => ['number', 'integer'].includes(props[campo]?.type);
    const agruparPor = text(candidato?.agruparPor);
    if (agruparPor && !props[agruparPor]) return { error: `el resumen agrupa por el campo inexistente «${agruparPor}».` };
    const medidas = list(candidato?.medidas).map((medida) => ({ funcion: text(medida?.funcion), campo: text(medida?.campo), nombre: camel(medida?.nombre || `${medida?.funcion}_${medida?.campo || 'registros'}`) }));
    if (!medidas.length) return { error: 'el resumen necesita al menos una medida.' };
    const invalida = medidas.find((medida) => !['contar', 'sumar', 'promedio'].includes(medida.funcion) || (medida.funcion !== 'contar' && !numero(medida.campo)));
    if (invalida) return { error: `medida inválida «${invalida.nombre}»: usa contar, o sumar/promedio sobre un campo numérico.` };
    let via = null;
    if (candidato?.via) {
      const cabecera = entidades.get(text(candidato.via.entidad));
      const campo = text(candidato.via.campo);
      if (!cabecera || props[campo]?.['x-references'] !== cabecera.name) return { error: 'la cabecera del resumen no corresponde a una referencia del registro.' };
      via = { entidad: cabecera.name, entidadClave: cabecera.key, campo };
    }
    const excluir = candidato?.excluir && text(candidato.excluir.campo) ? { campo: text(candidato.excluir.campo), patron: text(candidato.excluir.patron) || '^(anul|cancel)', ...(candidato.excluir.en === 'via' && via ? { en: 'via' } : {}) } : null;
    return { ...(agruparPor ? { agruparPor } : {}), medidas, ...(via ? { via } : {}), ...(excluir ? { excluir } : {}), orden: candidato?.orden === 'asc' ? 'asc' : 'desc', ...(Number.isInteger(candidato?.limite) && candidato.limite > 0 ? { limite: Math.min(candidato.limite, 100) } : {}) };
  }

  /**
   * Reportes que la IA no logra expresar (agregados): «Productos más vendidos» agrupa las líneas de la venta por producto y
   * suma la cantidad; «Reporte de ventas por fechas» cuenta las ventas y suma su total. Ambos por rango de fechas de la venta
   * y sin las anuladas. Se derivan del modelo (la venta con líneas y sus campos), no de un dominio fijo.
   */
  _derivarResumen(requisito, { entidades, operaciones, nombres }) {
    const titulo = strip(`${requisito.nombre || ''}`);
    if (!/\b(reporte|resumen|informe|ranking|estadistic\w*)\b|mas vendid/.test(titulo)) return null;
    const fechaDe = (props) => Object.keys(props).find((campo) => /^(fecha|fechahora|fecha_?registro|creado_?en)$/i.test(campo) || props[campo]?.format === 'date' || props[campo]?.format === 'date-time');
    const estadoDe = (props) => Object.keys(props).find((campo) => /^estado$/i.test(campo));
    const unico = (base) => { let nombre = base; let n = 2; while (nombres.has(nombre)) nombre = `${base}${n++}`; return nombre; };
    const rango = (campo, extra = {}) => campo ? [{ campo, operador: '>=', origen: 'parametro', valor: 'desde', ...extra }, { campo, operador: '<=', origen: 'parametro', valor: 'hasta', ...extra }] : [];
    const alta = operaciones.find((op) => op.tipo === 'crear' && op.lineas && op.estado_decision !== 'rechazado');
    if (/mas vendid|ranking|top\b/.test(titulo) && alta) {
      const lineas = entidades.get(alta.lineas.entidad);
      const cabecera = entidades.get(alta.entidad);
      if (!lineas || !cabecera) return null;
      const fecha = fechaDe(cabecera.schema.properties);
      const estado = estadoDe(cabecera.schema.properties);
      const medidas = [{ funcion: 'sumar', campo: alta.lineas.cantidad, nombre: 'cantidadVendida' }];
      return {
        nombre: unico(camel(requisito.nombre).slice(0, 40) || 'masVendidos'), rf: String(requisito.identificador).toUpperCase(), tipo: 'resumen', entidad: lineas.name, entidadClave: lineas.key,
        actores: list(requisito.actores), filtros: rango(fecha, { en: 'via' }), entradas: [], salida: [alta.lineas.referencia, 'cantidadVendida'],
        resumen: { agruparPor: alta.lineas.referencia, medidas, via: { entidad: cabecera.name, entidadClave: cabecera.key, campo: alta.lineas.fk }, ...(estado ? { excluir: { campo: estado, patron: '^(anul|cancel)', en: 'via' } } : {}), orden: 'desc' },
        descripcion: `Suma la cantidad vendida de cada ${alta.lineas.destino} en el rango de fechas, sin ${cabecera.name.toLowerCase()}s anuladas.`, estado_decision: 'pendiente', origen: 'derivado'
      };
    }
    // «Reporte de ventas…»: la entidad nombrada en el título con fecha (y total, si lo tiene).
    const candidata = [...entidades.values()].find((item) => titulo.includes(strip(item.name)) && fechaDe(item.schema.properties)) || (alta && entidades.get(alta.entidad));
    if (!candidata) return null;
    const props = candidata.schema.properties;
    const total = Object.keys(props).find((campo) => /^total$/i.test(campo) && ['number', 'integer'].includes(props[campo]?.type));
    const estado = estadoDe(props);
    const plural = `${strip(candidata.name)}s`;
    const medidas = [{ funcion: 'contar', nombre: `numero${candidata.name}s` }, ...(total ? [{ funcion: 'sumar', campo: total, nombre: 'totalVendido' }] : [])];
    return {
      nombre: unico(camel(requisito.nombre).slice(0, 40) || 'reporte'), rf: String(requisito.identificador).toUpperCase(), tipo: 'resumen', entidad: candidata.name, entidadClave: candidata.key,
      actores: list(requisito.actores), filtros: rango(fechaDe(props)), entradas: [], salida: medidas.map((medida) => medida.nombre),
      resumen: { medidas, ...(estado ? { excluir: { campo: estado, patron: '^(anul|cancel)' } } : {}), orden: 'desc' },
      descripcion: `Número de ${plural} y total en el rango de fechas, sin las anuladas.`, estado_decision: 'pendiente', origen: 'derivado'
    };
  }

  /** Datos del registro relacionado que acompañan a cada fila de una consulta (la mesa y los platos del pedido de una comanda). Se revalida contra el dominio. */
  _relacionadasDe(candidatas, entidades) {
    return list(candidatas).map((rel) => {
      const entidad = entidades.get(text(rel?.entidad));
      if (!entidad) return null;
      const props = entidad.schema.properties;
      if (!props[text(rel.via)]) return null;
      const campos = list(rel.campos).map(text).filter((campo) => props[campo]);
      if (!campos.length) return null;
      const items = rel.items && entidades.get(text(rel.items.entidad)) ? { ...rel.items } : null;
      return {
        entidad: entidad.name, entidadClave: entidad.key, clave: entidad.key, via: text(rel.via), campos, estado: props[text(rel.estado)] ? text(rel.estado) : null,
        excluir: list(rel.excluir).map(text).filter(Boolean), ...(items ? { items } : {})
      };
    }).filter(Boolean);
  }

  _sobreDe(candidata, entidades, destino) {
    const entidad = candidata && entidades.get(text(candidata.entidad));
    if (!entidad || !destino.schema.properties[text(candidata.via)]) return null;
    return { entidad: entidad.name, entidadClave: entidad.key, via: text(candidata.via) };
  }

  /**
   * Un requisito cuyo mockup tiene botones de «editar» (marcar lista una comanda) pero cuya entidad no tiene un estado propio no tiene nada
   * que cambiar: el estado vive en la entidad que la referencia (el pedido de la comanda). Se enriquece la consulta con los datos de ese
   * registro (mesa, estado, platos), se oculta lo ya servido y se propone, pendiente de revisión, la transición que el botón ejecuta.
   */
  _completarRelacionadas(operaciones, vistas, { entidades, verbosPorRf, avisos, nombres }) {
    const añadidas = [];
    if (!verbosPorRf) return añadidas;
    for (const consulta of operaciones.filter((op) => op.tipo === 'consulta' && !op.relacionadas)) {
      if (!list(verbosPorRf[String(consulta.rf).toUpperCase()]).includes('editar')) continue;
      if (operaciones.some((op) => op.rf === consulta.rf && ['actualizar', 'transicion'].includes(op.tipo))) continue;
      const base = entidades.get(consulta.entidad);
      if (!base || Object.values(base.schema.properties).some((def) => def?.enum?.length >= 2 || def?.type === 'boolean')) continue;
      const otra = [...entidades.values()].find((item) => item !== base && list(item.references).some((ref) => ref.entity === base.name) && item.schema.properties.estado?.enum?.length >= 2);
      if (!otra) continue;
      const via = list(otra.references).find((ref) => ref.entity === base.name).field;
      const props = otra.schema.properties;
      const estados = props.estado.enum;
      const destino = estados.find((valor) => /SERV|LIST|TERMIN|ENTREG|COMPLET|FINAL/i.test(valor)) || [...estados].reverse().find((valor) => !/CANCEL/i.test(valor));
      const campos = [
        ...Object.keys(props).filter((campo) => props[campo]['x-references'] && props[campo]['x-references'] !== base.name && !/^(usuarios?|clientes?)$/i.test(props[campo]['x-references'])).sort((x, y) => (/mesa|silla/i.test(y) ? 1 : 0) - (/mesa|silla/i.test(x) ? 1 : 0)).slice(0, 2),
        'estado',
        ...Object.keys(props).filter((campo) => /^total$/i.test(campo) && ['number', 'integer'].includes(props[campo].type)).slice(0, 1)
      ];
      const items = this._lineasDe({ tipo: 'crear' }, otra, entidades);
      const relacion = {
        entidad: otra.name, entidadClave: otra.key, clave: otra.key, via, campos, estado: 'estado', excluir: estados.filter((valor) => valor === destino || /CANCEL/i.test(valor)),
        ...(items ? { items: { entidad: items.entidad, entidadClave: items.entidadClave, fk: items.fk, referencia: items.referencia, destino: items.destino, destinoClave: items.destinoClave, cantidad: items.cantidad } } : {})
      };
      consulta.relacionadas = [relacion];
      consulta.salida = [...new Set([...campos.map((campo) => `${otra.key}_${campo}`), ...(items ? [`${otra.key}_items`] : []), ...consulta.salida])];
      let nombre = `marcar${otra.name}${destino.charAt(0)}${destino.slice(1).toLowerCase()}`;
      for (let n = 2; nombres.has(nombre); n += 1) nombre = `marcar${otra.name}${destino.charAt(0)}${destino.slice(1).toLowerCase()}${n}`;
      nombres.add(nombre);
      const transicion = {
        rf: consulta.rf, entidad: otra.name, entidadClave: otra.key, actores: consulta.actores, nombre, tipo: 'transicion', filtros: [], entradas: [], salida: [],
        transicion: { campo: 'estado', de: estados.filter((valor) => valor !== destino && !/CANCEL/i.test(valor)), a: destino },
        sobre: { entidad: base.name, entidadClave: base.key, via }, estado_decision: 'pendiente', origen: 'derivado',
        descripcion: `Pasa el ${otra.name} de ${base.name} a ${destino} desde la lista de ${base.name}.`
      };
      añadidas.push(transicion);
      const etiqueta = /LIST/i.test(destino) ? 'Marcar lista' : `Marcar ${destino.toLowerCase()}`;
      for (const vista of vistas) for (const componente of vista.componentes) {
        if (componente.operacion === consulta.nombre && ['tabla', 'tarjetas'].includes(componente.tipo) && !componente.acciones.some((accion) => accion.operacion === nombre)) componente.acciones.push({ etiqueta, operacion: nombre });
      }
      avisos.push(`${consulta.rf}: el mockup tiene botones de editar y ${base.name} no tiene estado; se propone «${nombre}» (pendiente de confirmar) sobre el ${otra.name} de cada ${base.name}, y la lista muestra sus datos.`);
    }
    return añadidas;
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
    const añadidas = [];
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
    const rfsDe = (screen) => (screen?.rf_trazabilidad || screen?.mockup?.rf_trazabilidad || []).map((id) => String(id).toUpperCase());
    const nombresUsados = new Set(operaciones.map((op) => op.nombre));
    for (const edicion of operaciones.filter((op) => op.tipo === 'actualizar' && !usadas.has(op.nombre))) {
      const actores = (edicion.actores || []).map(Compatibility.canonicalRole);
      // La pantalla del mismo requisito y de un rol que puede ejecutarla manda: si su lista es de otro actor (el menú del cliente en la
      // pantalla de la cocina), recibiría 403 al abrirla; esa pantalla gana una lista propia de la entidad, con «Editar» por fila.
      const propia = vistas.find((vista) => {
        const pantalla = pantallaDe.get(vista.id);
        const roles = Compatibility.rolesOf(pantalla);
        return rfsDe(pantalla).includes(String(edicion.rf).toUpperCase()) && roles.length && (!actores.length || roles.some((rol) => actores.includes(rol)));
      });
      if (propia) {
        const roles = Compatibility.rolesOf(pantallaDe.get(propia.id));
        const ejecutable = (op) => op?.tipo === 'consulta' && op.entidad === edicion.entidad && (op.actores || []).map(Compatibility.canonicalRole).some((rol) => roles.includes(rol));
        let componente = propia.componentes.find((c) => ['tabla', 'tarjetas'].includes(c.tipo) && ejecutable(porNombre.get(c.operacion)));
        if (!componente) {
          const base = `listar${edicion.entidad}Gestion`;
          let nombre = base;
          for (let n = 2; nombresUsados.has(nombre); n += 1) nombre = `${base}${n}`;
          nombresUsados.add(nombre);
          const lista = {
            rf: edicion.rf, entidad: edicion.entidad, entidadClave: edicion.entidadClave, actores: edicion.actores, nombre, tipo: 'consulta',
            filtros: [], entradas: [], salida: edicion.entradas.filter((campo) => !SENSIBLE.test(campo)), estado_decision: 'confirmado', origen: 'derivado',
            descripcion: `Lista los registros de ${edicion.entidad} para quien los gestiona en esta pantalla.`
          };
          añadidas.push(lista);
          porNombre.set(nombre, lista);
          operacionDe.set(nombre, lista);
          const ajena = propia.componentes.findIndex((c) => ['tabla', 'tarjetas'].includes(c.tipo) && porNombre.get(c.operacion)?.entidad === edicion.entidad);
          componente = { tipo: 'tabla', operacion: nombre, campos: lista.salida, acciones: [] };
          if (ajena >= 0) {
            advertencias.push(`Pantalla ${propia.id}: su lista (${propia.componentes[ajena].operacion}) es de otro actor y daría «sin permiso»; ahora usa «${nombre}».`);
            propia.componentes[ajena] = componente;
          } else propia.componentes.push(componente);
        }
        componente.acciones.push({ etiqueta: 'Editar', operacion: edicion.nombre });
        advertencias.push(`Pantalla ${propia.id}: se añadió «Editar» (${edicion.nombre}) a la lista de ${edicion.entidad}.`);
        continue;
      }
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
    return añadidas;
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
  /**
   * Un pedido «contiene» líneas (composición del dominio): el alta del pedido recibe también sus líneas (plato y cantidad), el
   * precio de cada una sale del plato y el total es la suma. Devuelve la descripción, o null si la entidad no tiene líneas.
   */
  _lineasDe(operacion, entidad, entidades) {
    if (operacion.tipo !== 'crear' || !entidades) return null;
    const numero = (def) => ['number', 'integer'].includes(def?.type);
    for (const hijo of entidades.values()) {
      // Composición, o una asociación de muchos (Venta "1" -- "*" LineaVenta) cuyo hijo es una línea: cantidad + otra referencia.
      const union = list(hijo.references).find((ref) => ref.entity === entidad.name && (ref.relation === 'composicion' || ref.cardinality === 'uno_a_muchos' || ref.cardinality === 'muchos_a_uno'));
      if (!union) continue;
      const props = hijo.schema.properties;
      const referencia = Object.entries(props).find(([campo, def]) => campo !== union.field && def?.['x-references'] && def['x-references'] !== entidad.name);
      const cantidad = Object.keys(props).find((campo) => /^(cantidad|unidades|qty)$/i.test(campo) && numero(props[campo]));
      const destino = referencia && entidades.get(referencia[1]['x-references']);
      if (!referencia || !cantidad || !destino) continue;
      const destinoProps = destino.schema.properties;
      const precioHijo = Object.keys(props).find((campo) => /precio|importe|monto/i.test(campo) && numero(props[campo]));
      const precioOrigen = Object.keys(destinoProps).find((campo) => /^precio/i.test(campo) && numero(destinoProps[campo]));
      const total = Object.keys(entidad.schema.properties).find((campo) => /^total$/i.test(campo) && numero(entidad.schema.properties[campo]));
      // Existencias del producto: se validan y se descuentan al vender (y se reponen al anular).
      const stock = Object.keys(destinoProps).find((campo) => /^(stock|existencias?|inventario|cantidad_?disponible|disponibles)$/i.test(campo) && numero(destinoProps[campo]));
      // Sin composición, el destino debe ser el artículo vendido (con precio o existencias): «Producto» no es cabecera de LineaVenta.
      if (union.relation !== 'composicion' && !precioOrigen && !stock) continue;
      // Un producto desactivado no se vende: estado «activo» o bandera booleana activo/disponible.
      const estado = Object.keys(destinoProps).find((campo) => /^estado$/i.test(campo));
      const activo = destinoProps.disponible?.type === 'boolean' ? { campo: 'disponible', valor: true }
        : destinoProps.activo?.type === 'boolean' ? { campo: 'activo', valor: true }
          : estado ? { campo: estado, valor: (destinoProps[estado].enum || []).find((item) => /^activ/i.test(item)) || 'activo' } : null;
      return {
        entidad: hijo.name, entidadClave: hijo.key, fk: union.field, referencia: referencia[0], destino: destino.name, destinoClave: destino.key, cantidad,
        ...(precioHijo && precioOrigen ? { precio: { campo: precioHijo, desde: precioOrigen } } : {}), ...(total ? { total } : {}),
        ...(stock ? { stock } : {}), ...(activo ? { activo } : {}),
        // Solo se pueden pedir los disponibles.
        ...(activo ? { filtros: [{ campo: activo.campo, operador: '==', origen: 'constante', valor: activo.valor }] } : {})
      };
    }
    return null;
  }

  _completarDelSistema(operacion, entidad, entidades = null) {
    if (operacion.tipo !== 'crear') return operacion;
    const lineas = entidades ? this._lineasDe(operacion, entidad, entidades) : (operacion.lineas || null);
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
      } else if (/^(sub)?total(es)?$/.test(compacto(campo)) && ['number', 'integer'].includes(propiedades[campo]?.type)) {
        // Un total no lo escribe la persona: con líneas es su suma; sin ellas nace en 0 (la regla «obligatorio» lo exige).
        auto.push({ campo, valor: lineas?.total === campo ? 'lineas' : 'cero' });
      }
    }
    // Lo que el servidor debe aportar aunque la propuesta no lo liste (la IA suele omitir el estado y el código del QR): sin eso la
    // reserva nacería sin estado ni código. Solo estado inicial, códigos generados y la fecha del propio registro.
    for (const [campo, definicion] of Object.entries(propiedades)) {
      if (campo === 'id' || definicion?.readOnly || operacion.entradas.includes(campo) || [...sesion, ...auto].some((item) => item.campo === campo)) continue;
      const razon = systemManaged(campo, definicion);
      // Quién lo registra (la venta y su vendedor) sale de la sesión: el formulario no lo pide y la regla «obligatorio» lo exige.
      if (/^usuarios?$/i.test(String(definicion?.['x-references'] || '')) && entidad.key !== 'usuario') sesion.push({ campo, valor: 'usuario.id' });
      else if (razon === 'empieza en su estado inicial' && definicion?.enum?.length) auto.push({ campo, valor: 'inicial', opciones: definicion.enum });
      else if (razon === 'lo genera el sistema' && definicion?.type === 'string' && !(entidad.key === 'usuario' && /^password/i.test(campo))) auto.push({ campo, valor: 'generado' });
      // La «fecha» a secas que el formulario no pide es la del propio registro (venta, factura, anulación).
      else if ((MARCA_DE_REGISTRO.test(compacto(campo)) || /^(fecha|fechahora)$/.test(compacto(campo))) && definicion?.type === 'string') auto.push({ campo, valor: definicion?.format === 'date' ? 'hoy' : 'ahora' });
      else if (lineas?.total === campo) auto.push({ campo, valor: 'lineas' });
    }
    // Documentos numerados (F001-00001): el «numero» de una factura, boleta o recibo lo pone el sistema, correlativo con serie
    // (no un código aleatorio ni algo que la persona escriba). En otras entidades («Mesa.numero») sí lo escribe la persona.
    if (/factura|boleta|recibo|comprobante|ticket|nota ?de ?credito/i.test(String(entidad.name || ''))) {
      const numero = Object.keys(propiedades).find((campo) => /^(numero|nro|correlativo)$/i.test(campo) && propiedades[campo]?.type === 'string');
      if (numero && !auto.some((item) => item.campo === numero)) auto.push({ campo: numero, valor: 'generado' });
    }
    for (const item of auto) {
      if (item.valor === 'generado' && /^(numero|nro|correlativo|num_?documento)$/i.test(item.campo)) {
        Object.assign(item, { valor: 'correlativo', prefijo: `${String(entidad.name || 'D').charAt(0).toUpperCase()}001-`, digitos: 5 });
      }
    }
    // Emitir para un registro existente (factura de una venta): el importe base sale de ese registro (subtotal ← total).
    if (operacion.vincula && entidades) {
      const dueño = entidades.get(operacion.vincula.entidad);
      const origen = dueño && Object.keys(dueño.schema.properties).find((campo) => /^total$/i.test(campo) && ['number', 'integer'].includes(dueño.schema.properties[campo]?.type));
      const base = Object.keys(propiedades).find((campo) => /^subtotal$/i.test(campo)) || Object.keys(propiedades).find((campo) => /^total$/i.test(campo));
      if (origen && base) {
        const existente = auto.find((item) => item.campo === base);
        if (existente) Object.assign(existente, { valor: 'vinculado', desde: origen });
        else auto.push({ campo: base, valor: 'vinculado', desde: origen });
      }
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
      ...(sesion.length ? { sesionEntradas: sesion } : {}), ...(auto.length ? { autoEntradas: auto } : {}),
      ...(lineas ? { lineas } : {})
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

  /**
   * Un reporte derivado (resumen) que ninguna pantalla usa se muestra como tabla en la pantalla del árbol que traza su RF,
   * prefiriendo la que se llama «Reporte…»: si la IA ató la pantalla a operaciones descartadas, quedaba vacía.
   */
  _colgarResumenes(operaciones, vistas, pantallas) {
    for (const op of operaciones.filter((item) => item.tipo === 'resumen')) {
      if (vistas.some((vista) => vista.componentes.some((componente) => componente.operacion === op.nombre))) continue;
      const candidatas = list(pantallas).filter((screen) => list(screen.rf_trazabilidad).map((id) => String(id).toUpperCase()).includes(op.rf));
      // La trazabilidad puede citar el mismo RF en varias pantallas: gana la que más se parece al nombre del reporte.
      const palabras = (value) => new Set(strip(value).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3).map((word) => word.slice(0, 5)));
      const propias = palabras(String(op.nombre).replace(/([a-z])([A-Z])/g, '$1 $2'));
      const puntaje = (screen) => [...palabras(screen.nombre || screen.slug || '')].filter((word) => propias.has(word)).length
        + (/reporte|informe|resumen|mas vendid/.test(strip(screen.nombre || screen.slug || '')) ? 1 : 0);
      const pantalla = [...candidatas].sort((a, b) => puntaje(b) - puntaje(a))[0];
      if (!pantalla) continue;
      const id = this._screenId(pantalla);
      let vista = vistas.find((item) => item.id === id);
      if (!vista) { vista = { id, componentes: [] }; vistas.push(vista); }
      vista.componentes.unshift({ tipo: 'tabla', operacion: op.nombre, acciones: [] });
    }
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
