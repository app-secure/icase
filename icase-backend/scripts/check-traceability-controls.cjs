const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Traceability = require('../src/infrastructure/services/MockupTraceabilityService');
const root = path.resolve(__dirname, '../verification-results/traceability-real-replay-v2');
const before = JSON.parse(fs.readFileSync(path.join(root, 'artefactos-generados.json')));
const after = JSON.parse(fs.readFileSync(path.join(root, 'artefactos.json')));
const service = new Traceability();
const manifest = service.buildManifest(after.diseno.manifiesto_navegacion, after.requisitos);
const mockups = service.enrichAll(after.diseno.mockups, manifest, after.requisitos);
const positive = service.validate({ manifest, mockups, requirements: after.requisitos, requireComplete: true });
const requirement = after.requisitos.find(r => r.identificador === 'RF-01');
if (!requirement || !mockups.some(m => m.rf_trazabilidad.includes('RF-01'))) throw new Error('Falta el control positivo del catálogo');
const omitted = mockups.map(m => m.rf_trazabilidad.includes('RF-01') ? { ...m, preview_code: '<main><h1>Pantalla pendiente</h1></main>' } : m);
const negative = service.validate({ manifest, mockups: omitted, requirements: after.requisitos, requireComplete: true });
const hash = value => crypto.createHash('sha256').update(value || '').digest('hex');
const unchanged = after.diseno.mockups.every(m => hash(m.preview_code) === hash(before.diseno.mockups.find(b => b.nombre_pantalla === m.nombre_pantalla)?.preview_code));
const report = {
  fecha: new Date().toISOString(), aprobadoHTTP: JSON.parse(fs.readFileSync(path.join(root, 'aprobacion-corregida.json'))).status,
  htmlIntacto: unchanged, controlPositivo: positive.valido,
  controlNegativoDetectaRF01: negative.metricas.rf_altos_ui_sin_cobertura.includes('RF-01'),
  erroresControlNegativo: negative.errores,
  advertenciasPositivas: positive.advertencias,
  limites: 'La omisión se inyectó únicamente en memoria. No se alteraron mockups persistidos ni se generó código/ZIP en esta repetición.'
};
fs.writeFileSync(path.join(root, 'controles.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (!unchanged || !positive.valido || !report.controlNegativoDetectaRF01 || report.aprobadoHTTP !== 200) process.exitCode = 1;
