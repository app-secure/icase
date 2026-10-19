const ARTIFACT_TYPES = Object.freeze({
  BACKEND_CODE: 'codigo_backend',
  FRONTEND_CODE: 'codigo_frontend',
  TESTS: 'pruebas',
  INFRASTRUCTURE: 'infraestructura',
  CI_CD_PIPELINE: 'pipeline_ci_cd',
  DELIVERY_PACKAGE: 'paquete_entrega'
});

const ARTIFACT_TYPE_VALUES = Object.freeze(Object.values(ARTIFACT_TYPES));
const ARTIFACT_STATES = Object.freeze(['borrador', 'generado', 'en_revision', 'aprobado', 'rechazado', 'desactualizado', 'fallido']);

module.exports = { ARTIFACT_TYPES, ARTIFACT_TYPE_VALUES, ARTIFACT_STATES };
