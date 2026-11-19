const ApplicationContractBuilder = require('./ApplicationContractBuilder');
const ApplicationSpecService = require('./ApplicationSpecService');
const DomainModelExtractor = require('./DomainModelExtractor');
const MockupBindingValidator = require('./MockupBindingValidator');

const slug = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pantalla';
const PlatformPolicy = require('../../core/services/PlatformPolicy');

/**
 * Vista previa de lo que se va a generar, calculada con las mismas entradas que los generadores pero sin generar nada:
 * pantallas (de dónde sale cada una, qué componentes y botones tendrá), operaciones con su endpoint, RF sin cubrir y
 * contenedores. Es lo que la persona revisa antes de confiar en la generación.
 */
class GenerationPreviewService {
  construir({ proyecto = {}, requerimientos = [], diagramas = [], diseno = {}, decisiones = {} } = {}) {
    const rf = requerimientos.filter((item) => item.aprobado === true && String(item.tipo || '').toUpperCase() === 'RF');
    const domainModel = new DomainModelExtractor().fromDiagrams(diagramas);
    const spec = ApplicationSpecService.confirmada(decisiones.especificacion_aplicacion);
    const manifest = Array.isArray(diseno?.manifiesto_navegacion) ? diseno.manifiesto_navegacion : [];
    const mockups = new Map((diseno?.mockups || []).map((item) => [item.pantalla_id || item.nombre_pantalla, item]));
    const contract = new ApplicationContractBuilder().build({ proyecto, requerimientos: rf, domainModel, spec, screens: manifest });
    const actions = new Map(contract.operations.flatMap((operation) => (operation.actions || []).map((action) => [action.name, { ...action, requisito: operation.id }])));
    const specScreens = new Map((spec?.pantallas || []).map((screen) => [screen.id, screen]));
    const validator = new MockupBindingValidator();

    const pantallas = manifest.map((screen) => {
      const id = screen.pantalla_id || slug(screen.slug || screen.nombre);
      const mockup = mockups.get(id) || mockups.get(screen.slug);
      const rfs = (Array.isArray(mockup?.rf_trazabilidad) ? mockup.rf_trazabilidad : screen.rf_trazabilidad) || [];
      const base = { id, nombre: screen.nombre || screen.nombre_visible || id, ruta: screen.ruta || `/${id}`, plataforma: PlatformPolicy.of(screen), modulo: screen.flujo || screen.modulo || 'General', rf: rfs };
      const fromSpec = specScreens.get(id);
      const components = (fromSpec?.componentes || []).filter((component) => actions.has(component.operacion));
      if (components.length) {
        return { ...base, origen: 'especificacion', componentes: components.map((component) => {
          const action = actions.get(component.operacion);
          return {
            tipo: component.tipo, operacion: component.operacion, endpoint: `${action.method} ${action.path}`, entidad: action.entity,
            campos: component.campos || [],
            // Tipo de cada campo (texto, número, fecha, lista de opciones, relación): con esto se dibuja el esquema de la pantalla.
            campos_meta: Object.fromEntries((component.campos || []).filter((name) => action.fields?.[name]).map((name) => [name, action.fields[name]])),
            filtros: (action.filters || []).filter((filter) => filter.origen === 'parametro').map((filter) => String(filter.valor)),
            botones: (component.acciones || []).filter((item) => actions.has(item.operacion)).map((item) => ({
              etiqueta: item.etiqueta, operacion: item.operacion, tipo: actions.get(item.operacion).type, por_fila: Boolean(actions.get(item.operacion).byId),
              endpoint: `${actions.get(item.operacion).method} ${actions.get(item.operacion).path}`
            }))
          };
        }), controles_sin_operacion: [] };
      }
      if (mockup?.preview_code) {
        const check = validator.validar({ html: mockup.preview_code, requerimientos: rf, contrato: contract });
        const wired = check.enlaces.filter((item) => item.estado === 'valido');
        const acceso = /^auth/i.test(String(screen.shell || ''));
        const dead = acceso ? [] : check.advertencias.filter((item) => item.startsWith('sin enlace: ')).map((item) => item.slice('sin enlace: '.length));
        return { ...base, origen: 'mockup', ...(acceso ? { nota: 'El inicio de sesión lo resuelve la autenticación de la aplicación (JWT): no necesita una operación propia.' } : {}), componentes: [], enlaces: wired.slice(0, 20).map((item) => ({ control: item.control, operacion: String(item.rf).toLowerCase(), verbo: item.verbo })), controles_sin_operacion: dead };
      }
      return { ...base, origen: 'crud', componentes: [], controles_sin_operacion: [] };
    });

    const operaciones = [...actions.values()].map((action) => ({ nombre: action.name, tipo: action.type, requisito: action.requisito, endpoint: `${action.method} ${action.path}`, entidad: action.entity, filtros: action.filters.length, pantallas: pantallas.filter((screen) => screen.componentes.some((c) => c.operacion === action.name || c.botones.some((b) => b.operacion === action.name))).map((screen) => screen.id) }));
    const cubiertos = new Set([...operaciones.map((item) => item.requisito), ...pantallas.filter((screen) => screen.origen === 'mockup').flatMap((screen) => screen.rf.map((id) => String(id).toUpperCase()))]);
    const identidad = new Set([...(contract.identity?.login || []), ...(contract.identity?.usuarios || [])]);
    const rfSinCubrir = rf.filter((item) => !cubiertos.has(String(item.identificador).toUpperCase()) && !identidad.has(item.identificador))
      .map((item) => ({ id: item.identificador, nombre: item.nombre, motivo: spec ? 'No tiene operación confirmada ni pantalla con enlaces: solo ofrecerá CRUD genérico.' : 'Sin especificación aprobada: solo ofrecerá CRUD genérico.' }));

    const stack = decisiones.stack_tecnologico || {};
    const plataformas = stack.plataformas || decisiones.alcance_plataforma?.plataformas || ['web'];
    // Cada pantalla pertenece a una sola aplicación; si esa aplicación no está en el alcance, no se genera.
    const sinAlcance = new Set(PlatformPolicy.missing(manifest, plataformas));
    for (const screen of pantallas) screen.generada = !sinAlcance.has(screen.plataforma);
    const aplicaciones = Object.fromEntries([PlatformPolicy.WEB, PlatformPolicy.MOBILE].map((app) => {
      const own = pantallas.filter((screen) => screen.plataforma === app);
      return [app, { pantallas: own.length, generadas: own.filter((screen) => screen.generada).length, en_alcance: !sinAlcance.has(app) }];
    }));
    const avisosPlataforma = [...sinAlcance].map((app) => `${aplicaciones[app].pantallas} pantalla(s) ${app === 'móvil' ? 'móviles' : 'web'} no se generarán: la plataforma ${app} no está en el alcance.`);
    const contenedores = [
      { id: 'backend', tecnologia: stack.backend || 'Node.js + Express', descripcion: `API con ${contract.operations.length} operaciones de datos y ${operaciones.length} de negocio.` },
      { id: 'base_datos', tecnologia: stack.base_datos || 'MongoDB', descripcion: `${contract.entities.length} entidades del dominio.` },
      ...(plataformas.some((item) => item === 'web' || item === 'tablet') ? [{ id: 'web', tecnologia: `${stack.frontend || 'React + Vite'} (nginx)`, descripcion: `${pantallas.filter((screen) => screen.plataforma === 'web').length} pantallas web.` }] : []),
      ...(plataformas.some((item) => /m[oó]vil/i.test(item)) ? [{ id: 'movil', tecnologia: 'Expo (React Native)', descripcion: `${pantallas.filter((screen) => screen.plataforma === 'móvil').length} pantallas móviles.` }] : [])
    ];

    const por = (origen) => pantallas.filter((screen) => screen.origen === origen).length;
    return {
      version: 1,
      resumen: {
        requisitos: rf.length, pantallas: pantallas.length, operaciones_negocio: operaciones.length, entidades: contract.entities.length,
        pantallas_por_origen: { especificacion: por('especificacion'), mockup: por('mockup'), crud: por('crud') },
        pantallas_sin_generar: pantallas.filter((screen) => !screen.generada).length,
        rf_sin_cubrir: rfSinCubrir.length, controles_sin_operacion: pantallas.reduce((total, screen) => total + screen.controles_sin_operacion.length, 0)
      },
      aplicaciones, contenedores, pantallas, operaciones, rf_sin_cubrir: rfSinCubrir, advertencias: [...avisosPlataforma, ...contract.warnings]
    };
  }
}

module.exports = GenerationPreviewService;
