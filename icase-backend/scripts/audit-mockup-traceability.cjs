// Reevalúa evidencias guardadas; no modifica proyectos ni llama a proveedores IA.
const fs = require('node:fs');
const path = require('node:path');
const Traceability = require('../src/infrastructure/services/MockupTraceabilityService');
const root = path.resolve(__dirname, '../verification-results');
const project = JSON.parse(fs.readFileSync(path.join(root, 'real-ui/artefactos.json')));
const mockups = JSON.parse(fs.readFileSync(path.join(root, 'mockups-html-v2/mockups-html.json')));
const service = new Traceability();
const details = mockups.map(mockup => {
  const previous = mockup.rf_trazabilidad || [];
  const corrected = service.enrichMockup(mockup, null, project.requisitos);
  return { pantalla: mockup.nombre_pantalla, anteriores: previous, propuestas: corrected, descartadas: previous.filter(id => !corrected.includes(id)) };
});
const report = {
  fecha: new Date().toISOString(), pantallas: details.length,
  asociacionesAnteriores: details.reduce((sum, item) => sum + item.anteriores.length, 0),
  asociacionesPropuestas: details.reduce((sum, item) => sum + item.propuestas.length, 0),
  detalle: details,
  limites: 'Heurística conservadora de evidencia local. Una propuesta no certifica cobertura completa; ausencia de vínculo requiere revisar la pantalla. Los datos persistidos no fueron alterados.'
};
fs.mkdirSync(path.join(root, 'correcciones'), { recursive: true });
fs.writeFileSync(path.join(root, 'correcciones/trazabilidad-local.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
