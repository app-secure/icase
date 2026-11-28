const { CODE_PHASE_DEFINITIONS } = require('../constants/CodeGenerationPhases');
const AccessControlService = require('./AccessControlService');
const ModuleService = require('./ModuleService');
const NestRuntimePolicy = require('./NestRuntimePolicy');
const { humanize } = require('./FieldLabel');
const { contextOf } = require('./RequirementAnalysisContext');

const CODE_DECISION_PHASES = Object.values(CODE_PHASE_DEFINITIONS)
  .filter((item) => item.tipo === 'decision')
  .map((item) => item.id);

// Tecnologías habituales que el generador aún no produce (el aviso las nombra en lugar de ignorarlas).
const NO_SOPORTADAS = [
  [/\bdjango\b|\bflask\b|\bfastapi\b|\bpython\b/i, 'Python'],
  [/asp\.net|\.net core|c#/i, '.NET / C#'],
  [/\blaravel\b|\bphp\b/i, 'PHP'],
  [/\bruby\b|\brails\b/i, 'Ruby on Rails'],
  [/\bgolang\b|\bgo\s+(?:gin|fiber|echo)\b/i, 'Go'],
  [/\bvue(?:\.js)?\b|\bangular\b|\bsvelte\b/i, 'Vue / Angular / Svelte (el frontend es React)'],
  [/\boracle\b|sql\s*server|\bsqlite\b|\bmariadb\b|\bcassandra\b|\bdynamodb\b/i, 'esa base de datos']
];

const clean = (value) => String(value || '').trim();
const unique = (values) => [...new Set(values.map(clean).filter(Boolean))];

class CodePlanningProposalService {
  constructor({ ruleInferenceService = null, specService = null } = {}) {
    this.ruleInferenceService = ruleInferenceService;
    this.specService = specService;
  }

  generar({ etapa, proyecto, requerimientos = [], diagramas = [], diseno = {}, plan, inicial = false }) {
    if (!CODE_DECISION_PHASES.includes(etapa)) {
      throw new Error(`La etapa ${etapa} no admite propuestas de planificación.`);
    }

    const requisitosAprobados = requerimientos.filter((item) => item.aprobado === true);
    const diagramasAprobados = diagramas.filter((item) =>
      item.aprobado === true && item.estado === 'aprobado' && !item.desactualizado
    );
    const analysis = contextOf(proyecto?.auditoria_requisitos, { includeContext: true });
    const analysisDecisions = [...analysis.restricciones_tecnicas, ...analysis.reglas_negocio, ...analysis.decisiones, ...analysis.contexto]
      .filter((item) => item.estado === 'confirmado');
    const texto = [this._textoDe(requisitosAprobados, diagramasAprobados), ...analysisDecisions.map((item) => `${item.necesidad}\n${item.evidencia || ''}`)].join('\n');
    // Las plataformas se deciden con lo que el insumo y los requisitos dicen, no con el código de los diagramas: la IA dibuja
    // a veces un «Dispositivo Móvil» en la arquitectura aunque el insumo diga «no habrá aplicación móvil».
    const textoPlataforma = [this._textoDe(requisitosAprobados, []), ...analysisDecisions.map((item) => `${item.necesidad}\n${item.evidencia || ''}`)].join(String.fromCharCode(10));
    const contexto = { proyecto, requisitosAprobados, diagramasAprobados, plan, texto, textoPlataforma, diseno, inicial, analisis: analysis };
    const propuesta = this[`_${etapa}`](contexto);
    const construir = (resultado) => ({
      etapa,
      propuesta: Object.values(analysis).some(entries => entries.length) ? { ...resultado.valor, contexto_analisis: analysis } : resultado.valor,
      contexto_analisis: analysis,
      evidencias: [...this._evidencias(requisitosAprobados, diagramasAprobados), ...analysisDecisions.map((item) => ({ tipo: item.tipo, identificador: item.id, nombre: item.necesidad }))],
      advertencias: resultado.advertencias
    });
    // La etapa de reglas de negocio consulta a la IA, por lo que responde de forma asíncrona.
    return propuesta && typeof propuesta.then === 'function' ? propuesta.then(construir) : construir(propuesta);
  }

  _modulos({ texto, plan }) {
    const stack = this._propuestaAprobada(plan, 'stack_tecnologico');
    const acceso = this._propuestaAprobada(plan, 'control_acceso');
    const compatible = !/spring/i.test(stack.backend) && acceso.autenticacion?.metodo === 'jwt';
    // Una mención excluida («fuera de alcance: lectura de códigos QR») no pide el módulo.
    const frases = String(texto || '').split(/(?<=[.;!?\n])\s+|\n+/);
    const excluida = (frase) => /\b(?:fuera\s+del?\s+alcance|queda\s+fuera|quedan\s+fuera|excluy\w*|exclusi\w*|descart\w*|no\s+(?:incluye|incluir\w*|se\s+\w+|habr\w*))/i.test(frase);
    const pedida = (patron) => frases.some((frase) => patron.test(frase) && !excluida(frase));
    // «Se actualizan en las pantallas sin recargar»: eso es avisar de los cambios en vivo, lo diga la pila o el requisito.
    const enVivo = pedida(/sin\s+(?:necesidad\s+de\s+)?(?:recargar|refrescar)|(?:actualiza\w*|visibles?)\s+en\s+tiempo\s+real/i);
    const sugeridos = {
      eventos_cambios: compatible && (stack.tiempo_real === 'Socket.IO' || enVivo),
      camara_qr: compatible && pedida(/\bqr\b/i),
      reportes_calculos: compatible && /reportes?|estadísticas/i.test(texto),
      pagos_prueba: compatible && /stripe/i.test(texto) && /sandbox|de prueba/i.test(texto)
    };
    const valor = new ModuleService().proponer().valor;
    return { valor: { ...valor, modo: 'personalizado', modulos: valor.modulos.map(item => ({
      id: item.id, activo: Boolean(sugeridos[item.id])
    })) }, advertencias: [] };
  }

  _control_acceso({ requisitosAprobados, diseno }) {
    // Los verbos de los mockups aprobados son lo que cada requisito realmente hace: de ahí salen los permisos por defecto.
    const verbosPorRf = {};
    for (const link of (diseno?.mockups || []).flatMap((item) => item.enlaces || [])) {
      if (link.estado !== 'valido' || !link.rf || !link.verbo) continue;
      const key = String(link.rf).toUpperCase();
      verbosPorRf[key] = [...new Set([...(verbosPorRf[key] || []), link.verbo])];
    }
    return new AccessControlService().proponer({ requerimientos: requisitosAprobados, verbosPorRf });
  }

  async _reglas_negocio({ requisitosAprobados, diagramasAprobados, plan, analisis, inicial }) {
    const anterior = plan?.etapas?.find((item) => item.etapa === 'reglas_negocio');
    const confirmadas = analisis.reglas_negocio.filter(item => item.estado === 'confirmado');
    const modelo = new (require('../../infrastructure/services/DomainModelExtractor'))().fromDiagrams(diagramasAprobados);
    const Builder = require('../../infrastructure/services/ApplicationContractBuilder');
    const contrato = new Builder().build({ proyecto: {}, requerimientos: requisitosAprobados, domainModel: modelo });
    const dominio = [];
    for (const entidad of modelo?.entities || []) {
      const rf = contrato.operations.filter(op => op.entity === entidad.key).map(op => op.id);
      if (!rf.length) continue;
      for (const campo of entidad.attributes.filter(attr => attr.name !== 'id' && !attr.nullable && !attr.referencia)) {
        const etiqueta = humanize(campo.name);
        dominio.push({ id: 'DOM-' + entidad.key + '-' + campo.name, tipo: 'requerido', entidad: entidad.name,
          entidad_etiqueta: humanize(entidad.name), campo: campo.name, campo_etiqueta: etiqueta, rf, origen: 'inferido', estado_decision: 'pendiente',
          mensaje: etiqueta + ' es obligatorio.', justificacion: 'En el diagrama de clases este dato no es opcional, por eso el sistema lo pide siempre.' });
      }
    }
    // Reglas de sentido común (no negativos, fin >= inicio): solo las que el motor de reglas valida como correctas.
    const rfPorEntidad = Object.fromEntries((modelo?.entities || []).map((entidad) => [entidad.key, contrato.operations.filter((op) => op.entity === entidad.key).map((op) => op.id)]));
    const sentidoComun = new (require('./SanityRuleService'))().derivar({ entidades: modelo?.entities || [], rfPorEntidad });
    const validador = new (require('./BusinessRuleService'))();
    const contextoReglas = { entidades: modelo?.entities || [], requerimientos: requisitosAprobados };
    for (const regla of sentidoComun) {
      if (!validador.validar([regla], contextoReglas).errores.length) dominio.push(regla);
    }
    if (inicial) return { valor: { reglas: dominio, confirmadas }, advertencias: [] };
    if (!this.ruleInferenceService) {
      return { valor: { reglas: dominio, confirmadas, notas: 'Revisa las reglas derivadas del dominio.' }, advertencias: ['El servicio de inferencia de reglas no está configurado.'] };
    }
    const { reglas, advertencias } = await this.ruleInferenceService.inferir({
      requerimientos: requisitosAprobados,
      diagramas: diagramasAprobados,
      analisis,
      retroalimentacion: anterior?.estado === 'rechazada' ? anterior.observaciones : ''
    });
    const todas = [...dominio.filter(base => !reglas.some(r => r.entidad === base.entidad && r.tipo === base.tipo && r.campo === base.campo)), ...reglas];
    const pendientes = todas.filter(item => item.estado_decision === 'pendiente').length;
    return {
      valor: {
        reglas: todas, confirmadas,
        notas: `Reglas propuestas desde los RF y el modelo de dominio aprobados. ${pendientes} requieren tu decisión (confirmar o rechazar) antes de aprobar la etapa.`
      },
      advertencias: [...advertencias, ...(reglas.length ? [] : ['No se propuso ninguna regla: puedes aprobar la etapa vacía o redactarlas manualmente.'])]
    };
  }

  /** Operaciones de negocio por RF y componentes por pantalla; la IA propone y el servicio valida contra el dominio aprobado. */
  async _especificacion_aplicacion({ requisitosAprobados, diagramasAprobados, plan, analisis, diseno }) {
    const vacio = { operaciones: [], pantallas: [], version: 1 };
    if (!this.specService) return { valor: vacio, advertencias: ['El servicio de especificación no está configurado.'] };
    const anterior = plan?.etapas?.find((item) => item.etapa === 'especificacion_aplicacion');
    const { especificacion, advertencias } = await this.specService.inferir({
      requerimientos: requisitosAprobados,
      diagramas: diagramasAprobados,
      pantallas: Array.isArray(diseno?.manifiesto_navegacion) ? diseno.manifiesto_navegacion : [],
      analisis,
      retroalimentacion: anterior?.estado === 'rechazada' ? anterior.observaciones : ''
    });
    if (!especificacion) return { valor: vacio, advertencias };
    const derivadas = especificacion.operaciones.filter((op) => op.origen === 'derivado').length;
    return {
      valor: { ...especificacion, notas: `${especificacion.operaciones.length} operaciones (${derivadas} derivadas sin IA) y ${especificacion.pantallas.length} pantallas. Confirma o rechaza cada operación antes de aprobar.` },
      advertencias
    };
  }

  _alcance_plataforma({ texto, textoPlataforma, diseno }) {
    texto = textoPlataforma ?? texto;
    const plataformas = [];
    // «No se desarrollará aplicación móvil» o «queda fuera de alcance la app móvil» no piden esa plataforma:
    // solo cuentan las frases que la mencionan sin negarla ni excluirla.
    const NEGADA = /\b(?:no|sin|ni|excluy\w*|exclusi\w*|descart\w*|fuera\s+del?\s+alcance|queda\s+fuera|quedan\s+fuera)\b/i;
    const frases = String(texto || '').split(/(?<=[.;!?\n])\s+|\n+/);
    const pedida = (patron) => frases.some((frase) => patron.test(frase) && !NEGADA.test(frase));
    if (pedida(/\bweb\b|react(?!\s+native)\b|navegador/i)) plataformas.push('web');
    if (pedida(/react native|\bandroid\b|\bios\b|m[oó]vil/i)) plataformas.push('móvil');
    // Las pantallas del árbol de navegación también cuentan: una pantalla móvil exige la aplicación móvil.
    const PlatformPolicy = require('./PlatformPolicy');
    const arbol = Array.isArray(diseno?.manifiesto_navegacion) ? diseno.manifiesto_navegacion : [];
    for (const app of ['web', 'móvil']) if (PlatformPolicy.count(arbol)[app] > 0 && !plataformas.includes(app)) plataformas.push(app);
    const opciones = plataformas.length ? plataformas : ['web'];
    return { valor: { plataformas: opciones, detectadas: opciones },
      advertencias: plataformas.length ? [] : ['Se propone web porque el análisis no especifica plataforma.'] };
  }

  _stack_tecnologico({ texto, textoPlataforma, analisis, plan }) {
    const restricciones = analisis.restricciones_tecnicas.filter(item => item.estado === 'confirmado');
    const confirmado = restricciones.map(item => item.necesidad).join(' ');
    const plataformas = plan?.etapas?.find(item => item.etapa === 'alcance_plataforma')?.propuesta?.plataformas
      || this._alcance_plataforma({ texto, textoPlataforma }).valor.plataformas;
    texto = confirmado;
    const advertencias = [];
    const conSpring = /spring|\bjava\b/i.test(texto);
    const backend = /nestjs/i.test(texto) ? NestRuntimePolicy.label
      : conSpring ? 'Java + Spring Boot'
        : 'Node.js + Express';
    const frontend = 'React + Vite';
    let baseDatos = /postgres(?:ql)?/i.test(texto) ? 'PostgreSQL'
      : /mongodb|mongo\b/i.test(texto) ? 'MongoDB'
        : /mysql/i.test(texto) ? 'MySQL' : 'MongoDB';
    if (!/nestjs|express|spring|\bjava\b/i.test(texto)) advertencias.push('Backend no especificado: se propone Node.js + Express para revisión.');
    if (!/react/i.test(texto)) advertencias.push('Frontend no especificado: se propone React + Vite para revisión.');
    if (/nestjs/i.test(texto)) {
      try { NestRuntimePolicy.validate(texto); } catch (error) { advertencias.push(error.message); }
    }
    if (!/postgres(?:ql)?|mongodb|mongo\b|mysql/i.test(texto)) advertencias.push('Base de datos no especificada: se propone MongoDB para revisión.');
    if (/prisma/i.test(texto)) advertencias.push('Prisma está confirmado. El backend actual usa el controlador de la base de datos y genera SQL directamente.');
    if (/redis/i.test(texto)) advertencias.push('El generador no implementa caché de consultas con Redis.');
    if (conSpring && baseDatos === 'MongoDB') {
      baseDatos = 'PostgreSQL';
      advertencias.push('Java + Spring Boot solo se genera con PostgreSQL o MySQL: se propone PostgreSQL en lugar de MongoDB.');
    }
    // Tecnologías que los requisitos mencionan y que el generador todavía no produce: se avisa, no se sustituyen en silencio.
    for (const [patron, nombre] of NO_SOPORTADAS) {
      if (patron.test(texto)) advertencias.push(`Los requisitos mencionan ${nombre}, que todavía no está soportado: se propone ${backend} con ${baseDatos}.`);
    }

    return {
      valor: {
        backend,
        ...(/nestjs/i.test(backend) ? { version_backend: NestRuntimePolicy.version } : {}),
        frontend,
        base_datos: baseDatos,
        gestor_paquetes: conSpring ? 'Maven' : 'npm',
        plataformas,
        origen: Object.fromEntries(Object.entries({
          backend: /nestjs|express|spring/i, base_datos: /postgres|mongo|mysql/i, frontend: /react(?!\s+native)\b/i,
          gestor_paquetes: /npm|maven/i, tiempo_real: /socket\.io/i, estilos: /tailwind/i
        }).map(([campo, patron]) => [campo, patron.test(confirmado) ? 'Confirmado en el análisis' : 'Propuesta'])),
        tiempo_real: /socket\.io/i.test(texto) ? 'Socket.IO' : '',
        estilos: /tailwind/i.test(texto) ? 'Tailwind CSS' : 'Estilos del mockup',
        ci_cd: 'GitHub Actions',
        observaciones_tecnicas: 'Versiones exactas y librerías complementarias deberán fijarse antes de generar dependencias.'
      },
      advertencias
    };
  }

  async _estructura_carpetas({ proyecto, plan, requisitosAprobados, diagramasAprobados, diseno }) {
    const Backend = require('../../infrastructure/services/BackendScaffoldGenerator');
    const Frontend = require('../../infrastructure/services/FrontendScaffoldGenerator');
    const decisiones = Object.fromEntries((plan?.etapas || []).filter(item => item.estado === 'aprobada').map(item => [item.etapa, item.propuesta]));
    const insumos = { decisiones, requerimientos: requisitosAprobados, diseno: diseno || {},
      diagramaDominio: diagramasAprobados.find(item => ['clases_dominio', 'clases'].includes(item.tipo)) };
    const partes = await Promise.all([new Backend(), new Frontend()].map(generador =>
      generador.generar({ proyecto, insumos, versionesOrigen: {} })));
    const rutas = partes.flatMap(parte => parte.archivos.map(archivo => archivo.ruta)).sort();
    return { valor: { arbol: rutas.join('\n') }, advertencias: [] };
  }

  _propuestaAprobada(plan, etapa) {
    const item = plan?.etapas?.find((candidate) => candidate.etapa === etapa);
    return item?.estado === 'aprobada' ? (item.propuesta || {}) : {};
  }

  _textoDe(requisitos, diagramas) {
    return [
      ...requisitos.flatMap((item) => [item.identificador, item.nombre, item.descripcion, item.metrica_medible, item.evidencia, item.canal, ...(Array.isArray(item.canales) ? item.canales : [])]),
      ...diagramas.flatMap((item) => [item.tipo, item.titulo, item.descripcion, item.codigo_plantuml, item.codigo_mermaid])
    ].map(clean).filter(Boolean).join('\n');
  }

  _evidencias(requisitos, diagramas) {
    return [
      ...requisitos.map((item) => ({ tipo: 'requisito', identificador: item.identificador, nombre: item.nombre })),
      ...diagramas.map((item) => ({ tipo: 'diagrama', identificador: item.tipo, nombre: item.titulo, version: item.version || 1 }))
    ];
  }
}

module.exports = CodePlanningProposalService;
