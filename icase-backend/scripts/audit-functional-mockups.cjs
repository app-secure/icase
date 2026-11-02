// Auditoría de solo lectura sobre el resultado real: no usa IA ni base activa.
const fs = require('node:fs');
const path = require('node:path');
const Traceability = require('../src/infrastructure/services/MockupTraceabilityService');
const root = path.resolve(__dirname, '../verification-results/traceability-real-replay-v2');
const previous = JSON.parse(fs.readFileSync(path.join(root, 'artefactos.json')));
const service = new Traceability();
const manifest = service.buildManifest(previous.diseno.manifiesto_navegacion, previous.requisitos);
const mockups = service.enrichAll(previous.diseno.mockups, manifest, previous.requisitos);
const audit = service.validate({ manifest, mockups, requirements: previous.requisitos, requireComplete: true });
const report = {
  fecha: new Date().toISOString(), auditoria: audit,
  limites: 'Reevaluación estática de HTML previamente generado con Gemini. No certifica comportamiento en ejecución ni cambia las aprobaciones o HTML persistidos.'
};
fs.writeFileSync(path.join(root, 'cobertura-funcional.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ valido: audit.valido, criterios: audit.metricas.criterios_ui_evaluados, conEvidencia: audit.metricas.criterios_ui_con_evidencia, errores: audit.errores, advertencias: audit.advertencias }));
