const CODE_PHASE_STATES = Object.freeze({
  BLOCKED: 'bloqueada',
  PENDING: 'pendiente',
  IN_REVIEW: 'en_revision',
  APPROVED: 'aprobada',
  REJECTED: 'rechazada',
  STALE: 'desactualizada'
});

const CODE_PHASES = Object.freeze({
  scope: Object.freeze({
    id: 'alcance_plataforma', orden: 10, tipo: 'decision', dependencias: [],
    titulo: 'Qué generar',
    descripcion: 'El backend se incluye siempre. Elige las interfaces que necesitas.'
  }),
  stack: Object.freeze({
    id: 'stack_tecnologico', orden: 20, tipo: 'decision', dependencias: [], influyen: ['alcance_plataforma'],
    titulo: 'Herramientas y tecnologías',
    descripcion: 'Confirma lenguajes, frameworks, base de datos, gestor de paquetes y versiones.'
  }),
  folders: Object.freeze({
    id: 'estructura_carpetas', orden: 40, tipo: 'decision', dependencias: ['stack_tecnologico'],
    titulo: 'Estructura de carpetas',
    descripcion: 'Aprueba el árbol de archivos antes de producir código fuente.'
  }),
  rules: Object.freeze({
    id: 'reglas_negocio', orden: 45, tipo: 'decision', dependencias: ['estructura_carpetas'],
    titulo: 'Reglas de negocio',
    descripcion: 'Revisa y confirma las reglas de validación, unicidad, estados y relaciones que el backend aplicará a los datos.'
  }),
  access: Object.freeze({
    id: 'control_acceso', orden: 46, tipo: 'decision', dependencias: ['estructura_carpetas'],
    titulo: 'Autenticación y roles',
    descripcion: 'Define cómo se autentican las personas, qué roles existen y qué puede hacer cada rol sobre cada operación.'
  }),
  modules: Object.freeze({
    id: 'modulos', orden: 47, tipo: 'decision', dependencias: ['reglas_negocio', 'control_acceso'], opcional: true,
    titulo: 'Módulos',
    descripcion: 'Elige qué funcionalidades opcionales incluye la aplicación. Si omites este paso, se incluyen los módulos sugeridos por el análisis.'
  }),
  spec: Object.freeze({
    id: 'especificacion_aplicacion', orden: 48, tipo: 'decision', dependencias: ['reglas_negocio'], opcional: true,
    titulo: 'Comportamiento de la aplicación',
    descripcion: 'Revisa qué operación ejecuta cada requisito (qué filtra, qué escribe, qué devuelve) y qué componentes tiene cada pantalla. Si la omites, cada requisito usa un CRUD genérico.'
  }),
  backend: Object.freeze({
    id: 'generacion_backend', orden: 50, tipo: 'generacion', dependencias: ['estructura_carpetas', 'reglas_negocio', 'control_acceso'], influyen: ['modulos', 'especificacion_aplicacion'],
    titulo: 'Generación del backend', artefacto: 'codigo_backend'
  }),
  frontend: Object.freeze({
    id: 'generacion_frontend', orden: 60, tipo: 'generacion', dependencias: ['estructura_carpetas', 'control_acceso'], influyen: ['modulos', 'especificacion_aplicacion'],
    titulo: 'Generación del frontend', artefacto: 'codigo_frontend'
  }),
  tests: Object.freeze({
    id: 'generacion_pruebas', orden: 70, tipo: 'generacion', dependencias: ['generacion_backend', 'generacion_frontend'],
    titulo: 'Generación de pruebas', artefacto: 'pruebas'
  }),
  infrastructure: Object.freeze({
    id: 'generacion_infraestructura', orden: 80, tipo: 'generacion', dependencias: ['generacion_backend', 'generacion_frontend'],
    titulo: 'Infraestructura y puesta en marcha', artefacto: 'infraestructura'
  }),
  pipeline: Object.freeze({
    id: 'generacion_ci_cd', orden: 90, tipo: 'generacion', dependencias: ['generacion_pruebas', 'generacion_infraestructura'],
    titulo: 'Pipeline CI/CD', artefacto: 'pipeline_ci_cd'
  }),
  delivery: Object.freeze({
    id: 'paquete_entrega', orden: 100, tipo: 'entrega', dependencias: ['generacion_ci_cd'],
    titulo: 'Paquete final', artefacto: 'paquete_entrega'
  })
});

const CODE_PHASE_DEFINITIONS = Object.freeze(
  Object.fromEntries(Object.values(CODE_PHASES).map((phase) => [phase.id, phase]))
);
const CODE_PHASE_IDS = Object.freeze(Object.keys(CODE_PHASE_DEFINITIONS));

module.exports = { CODE_PHASES, CODE_PHASE_DEFINITIONS, CODE_PHASE_IDS, CODE_PHASE_STATES };
