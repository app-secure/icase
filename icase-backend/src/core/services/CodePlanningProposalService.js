const { CODE_PHASE_DEFINITIONS } = require('../constants/CodeGenerationPhases');
const AccessControlService = require('./AccessControlService');
const ModuleService = require('./ModuleService');

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
  constructor({ ruleInferenceService = null } = {}) {
    this.ruleInferenceService = ruleInferenceService;
  }

  generar({ etapa, proyecto, requerimientos = [], diagramas = [], plan }) {
    if (!CODE_DECISION_PHASES.includes(etapa)) {
      throw new Error(`La etapa ${etapa} no admite propuestas de planificación.`);
    }

    const requisitosAprobados = requerimientos.filter((item) => item.aprobado === true);
    const diagramasAprobados = diagramas.filter((item) =>
      item.aprobado === true && item.estado === 'aprobado' && !item.desactualizado
    );
    const texto = this._textoDe(requisitosAprobados, diagramasAprobados);
    const contexto = { proyecto, requisitosAprobados, diagramasAprobados, plan, texto };
    const propuesta = this[`_${etapa}`](contexto);
    const construir = (resultado) => ({
      etapa,
      propuesta: resultado.valor,
      evidencias: this._evidencias(requisitosAprobados, diagramasAprobados),
      advertencias: resultado.advertencias
    });
    // La etapa de reglas de negocio consulta a la IA, por lo que responde de forma asíncrona.
    return propuesta && typeof propuesta.then === 'function' ? propuesta.then(construir) : construir(propuesta);
  }

  _modulos() {
    return new ModuleService().proponer();
  }

  _control_acceso({ requisitosAprobados }) {
    return new AccessControlService().proponer({ requerimientos: requisitosAprobados });
  }

  async _reglas_negocio({ requisitosAprobados, diagramasAprobados, plan }) {
    const anterior = plan?.etapas?.find((item) => item.etapa === 'reglas_negocio');
    if (!this.ruleInferenceService) {
      return { valor: { reglas: [], notas: 'Sin inferencia automática: redacta las reglas manualmente.' }, advertencias: ['El servicio de inferencia de reglas no está configurado.'] };
    }
    const { reglas, advertencias } = await this.ruleInferenceService.inferir({
      requerimientos: requisitosAprobados,
      diagramas: diagramasAprobados,
      retroalimentacion: anterior?.estado === 'rechazada' ? anterior.observaciones : ''
    });
    const pendientes = reglas.filter((item) => item.estado_decision === 'pendiente').length;
    return {
      valor: {
        reglas,
        notas: `Reglas propuestas desde los RF y el modelo de dominio aprobados. ${pendientes} requieren tu decisión (confirmar o rechazar) antes de aprobar la etapa.`
      },
      advertencias: [...advertencias, ...(reglas.length ? [] : ['No se propuso ninguna regla: puedes aprobar la etapa vacía o redactarlas manualmente.'])]
    };
  }

  _alcance_plataforma({ requisitosAprobados, texto }) {
    const rf = requisitosAprobados.filter((item) => item.tipo === 'RF');
    const rnf = requisitosAprobados.filter((item) => item.tipo === 'RNF');
    const plataformas = [];
    if (/react native|android|ios|aplicaci[oó]n m[oó]vil|\bapp m[oó]vil\b/i.test(texto)) plataformas.push('móvil');
    if (/\bweb\b|react|navegador|spa/i.test(texto)) plataformas.push('web');
    if (/tablet/i.test(texto)) plataformas.push('tablet');
    const plataformaInferida = plataformas.length === 0;
    if (plataformaInferida) plataformas.push('web');

    return {
      valor: {
        plataformas: unique(plataformas),
        alcance: `Implementar ${rf.length} requisitos funcionales aprobados para ${unique(plataformas).join(', ')}.`,
        exclusiones: 'No se incluirán capacidades que no consten en requisitos o artefactos aprobados.',
        capacidades_principales: rf.map((item) => `${item.identificador}: ${item.nombre}`),
        restricciones_no_funcionales: rnf.map((item) => `${item.identificador}: ${item.nombre}`)
      },
      advertencias: plataformaInferida ? ['No se identificó una plataforma explícita; se propone web para revisión.'] : []
    };
  }

  _stack_tecnologico({ texto }) {
    const advertencias = [];
    const conSpring = /spring|\bjava\b/i.test(texto);
    const backend = /nestjs/i.test(texto) ? 'Node.js + NestJS'
      : conSpring ? 'Java + Spring Boot'
        : 'Node.js + Express';
    const frontend = /react native/i.test(texto) ? 'React + Vite para web; React Native para móvil' : 'React + Vite';
    let baseDatos = /postgres(?:ql)?/i.test(texto) ? 'PostgreSQL'
      : /mongodb|mongo\b/i.test(texto) ? 'MongoDB'
        : /mysql/i.test(texto) ? 'MySQL' : 'MongoDB';
    if (!/nestjs|express|spring|\bjava\b/i.test(texto)) advertencias.push('Backend no especificado: se propone Node.js + Express para revisión.');
    if (!/react/i.test(texto)) advertencias.push('Frontend no especificado: se propone React + Vite para revisión.');
    if (!/postgres(?:ql)?|mongodb|mongo\b|mysql/i.test(texto)) advertencias.push('Base de datos no especificada: se propone MongoDB para revisión.');
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
        frontend,
        base_datos: baseDatos,
        gestor_paquetes: conSpring ? 'Maven' : /\bpnpm\b/i.test(texto) ? 'pnpm' : /\byarn\b/i.test(texto) ? 'yarn' : 'npm',
        plataformas: unique([
          /\bweb\b|react/i.test(texto) && 'web',
          /react native|android|ios/i.test(texto) && 'móvil'
        ]),
        tiempo_real: /socket\.io/i.test(texto) ? 'Socket.IO' : /websocket/i.test(texto) ? 'WebSocket' : '',
        estilos: /tailwind/i.test(texto) ? 'Tailwind CSS' : '',
        observaciones_tecnicas: 'Versiones exactas y librerías complementarias deberán fijarse antes de generar dependencias.'
      },
      advertencias
    };
  }

  _arquitectura_codigo({ requisitosAprobados, diagramasAprobados, texto }) {
    const modulos = unique(requisitosAprobados
      .filter((item) => item.tipo === 'RF')
      .map((item) => item.nombre)
      .slice(0, 12));
    const tieneJwt = /\bjwt\b/i.test(texto);
    const diagramaArquitectura = diagramasAprobados.some((item) =>
      ['arquitectura_software', 'clases_diseno'].includes(item.tipo)
    );
    return {
      valor: {
        estilo: /clean architecture/i.test(texto) ? 'Clean Architecture por módulos' : 'Arquitectura modular por capas',
        capas: 'Dominio, aplicación, adaptadores de interfaz e infraestructura',
        comunicacion: /socket\.io|websocket/i.test(texto) ? 'API REST/JSON y eventos en tiempo real' : 'API REST con JSON',
        autenticacion: tieneJwt ? 'JWT y control de acceso basado en roles' : 'Autenticación y autorización según requisitos aprobados',
        modulos,
        decisiones_adicionales: 'Las dependencias apuntan hacia el dominio; la infraestructura implementa los puertos definidos por la aplicación.'
      },
      advertencias: diagramaArquitectura ? [] : ['No se encontró una arquitectura de software o clases de diseño aprobada y vigente.']
    };
  }

  _estructura_carpetas({ plan }) {
    const arquitectura = this._propuestaAprobada(plan, 'arquitectura_codigo');
    const stack = this._propuestaAprobada(plan, 'stack_tecnologico');
    const usaNest = /nestjs/i.test(clean(stack.backend));
    const backendTree = usaNest
      ? 'backend/\n  src/{domain,application,infrastructure,interfaces,modules}\n  test/{unit,integration,e2e}'
      : 'backend/\n  src/core/{entities,use-cases,services}\n  src/interface-adapters/{controllers,repositories}\n  src/infrastructure/{database,middlewares,services}\n  src/routes\n  tests/{unit,integration,e2e}';
    return {
      valor: {
        arbol: `${backendTree}\nfrontend/\n  src/{components,pages,services,hooks,utils}\n  tests/{unit,integration,e2e}\nops/{docker,ci}`,
        convenciones: `Organización por capacidad funcional dentro de ${clean(arquitectura.estilo) || 'la arquitectura aprobada'}; código fuente y pruebas separados; infraestructura reproducible en ops/.`
      },
      advertencias: []
    };
  }

  _propuestaAprobada(plan, etapa) {
    const item = plan?.etapas?.find((candidate) => candidate.etapa === etapa);
    return item?.estado === 'aprobada' ? (item.propuesta || {}) : {};
  }

  _textoDe(requisitos, diagramas) {
    return [
      ...requisitos.flatMap((item) => [item.identificador, item.nombre, item.descripcion, item.metrica_medible, item.evidencia]),
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
