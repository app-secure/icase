const fs = require('node:fs');
const path = require('node:path');
const DomainModelExtractor = require('./DomainModelExtractor');
const ApplicationContractBuilder = require('./ApplicationContractBuilder');

const PROMPT = path.join(__dirname, '..', 'prompts', 'analista_especificacion_aplicacion.md');
const TIPOS = ['consulta', 'crear', 'actualizar', 'eliminar', 'transicion'];
const OPERADORES = ['==', '!=', '>', '>=', '<', '<='];
const ORIGENES = ['sesion', 'parametro', 'constante'];
const VALORES_SESION = ['usuario.id', 'usuario.email', 'usuario.rol'];
const COMPONENTES = ['tabla', 'tarjetas', 'formulario', 'detalle', 'kpi'];
const MAX_OPERACIONES = 120;

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
      nombres.add(operacion.nombre);
      operaciones.push({ ...operacion, origen: 'ia' });
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

    const porNombre = new Map(operaciones.map((operacion) => [operacion.nombre, operacion]));
    const vistas = this._pantallas(propuesta?.pantallas, { porNombre, entidades, pantallas, advertencias });
    operaciones.forEach((operacion, index) => { operacion.id = `OP-${String(index + 1).padStart(2, '0')}`; });
    const sinPantalla = operaciones.filter((operacion) => !vistas.some((vista) => vista.componentes.some((c) => c.operacion === operacion.nombre || c.acciones.some((a) => a.operacion === operacion.nombre))));
    if (vistas.length && sinPantalla.length) advertencias.push(`Operaciones sin ninguna pantalla que las use: ${sinPantalla.map((operacion) => operacion.nombre).join(', ')}.`);

    return { especificacion: { version: 1, operaciones, pantallas: vistas }, advertencias };
  }

  /**
   * Revalida una especificación ya guardada (editada o aprobada) sin derivar nada nuevo. Conserva el origen y la decisión
   * de cada operación; devuelve `errores` si alguna dejó de ser válida (el dominio o los RF cambiaron).
   */
  validar(guardada, { modelo, rf, pantallas = [] }) {
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
    return {
      operacion: {
        nombre, rf, tipo, entidad: entidad.name, entidadClave: entidad.key,
        actores: list(candidata.actores).map(text).filter(Boolean),
        filtros, entradas: entradas.valores, salida: salida.valores, ...(transicion ? { transicion } : {}),
        descripcion: text(candidata.descripcion).slice(0, 300), estado_decision: 'pendiente'
      }
    };
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
    return {
      nombre, rf: String(requisito.identificador).toUpperCase(), tipo, entidad: entidad.name, entidadClave: entidad.key,
      actores: list(requisito.actores).map(text).filter(Boolean), filtros: [],
      entradas: ['crear', 'actualizar'].includes(tipo) ? campos : [], salida: tipo === 'consulta' ? campos : [],
      descripcion: text(requisito.nombre), estado_decision: 'pendiente', origen: 'derivado'
    };
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
        const campos = list(componente.campos).map(text).filter((campo) => Object.prototype.hasOwnProperty.call(props, campo));
        const acciones = [];
        for (const accion of list(componente.acciones)) {
          const destino = porNombre.get(text(accion?.operacion));
          if (!destino || !text(accion?.etiqueta)) { advertencias.push(`Pantalla ${id}: se descartó el botón «${accion?.etiqueta || ''}» porque no ejecuta una operación definida.`); continue; }
          acciones.push({ etiqueta: text(accion.etiqueta), operacion: destino.nombre });
        }
        componentes.push({ tipo: text(componente.tipo), operacion: operacion.nombre, campos, acciones });
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
