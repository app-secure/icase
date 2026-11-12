// Isolated real-provider evaluation. No database, approvals or project mutations.
const fs = require('node:fs');
const path = require('node:path');
if (!process.argv.includes('--run-real')) throw new Error('Se requiere --run-real.');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const AI = require('../src/infrastructure/services/ModelosIaService');
const Router = require('../src/infrastructure/services/RequirementProviderRouter');
const Budget = require('../src/infrastructure/services/AiRequestBudget');
const fixtures = require('../tests/fixtures/requirements-evaluation.json');
const output = path.resolve(__dirname, '../verification-results/initial-analysis-real', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(output, { recursive: true });
const report = { alcance: 'Análisis inicial real de casos sintéticos; sin aprobar ni redactar requisitos.', evaluacion_semantica: 'pendiente de revisión humana', casos: [] };
(async () => {
  for (const fixture of fixtures) {
    const rows = new Map(), env = { ...process.env, REQUIREMENTS_RESILIENT_ENABLED: 'true' };
    const router = new Router({ env, budget: new Budget(), stateRepository: { get: async id => rows.get(id), put: async (id, value) => rows.set(id, value), remove: async id => rows.delete(id) } });
    const service = new AI({ env, requirementsRouter: router });
    const entry = { caso: fixture.id, inicio: new Date().toISOString() };
    console.log(`[Análisis real] ${fixture.id}: inicio`);
    try {
      const result = await service.procesar({ objetivo: 'requisitos', provider: 'auto', initialAnalysisOnly: true, insumo_bruto: `[Fuente enriquecida]\nArchivo: ${fixture.id}.txt\n[Contenido extraído]\n${fixture.input}` });
      fs.writeFileSync(path.join(output, `${fixture.id}.json`), JSON.stringify(result, null, 2));
      entry.estado = 'generado'; entry.revision = result.revision_inventario; entry.integridad = result.integridad_extraccion;
      entry.metricas = result.auditoria_requisitos?.metricas_ejecucion;
    } catch (error) { entry.estado = 'fallido'; entry.codigo = error.code || 'ERROR_GENERACION'; entry.metricas = error.metricasEjecucion; }
    entry.intentos = router.trace; entry.fin = new Date().toISOString(); report.casos.push(entry);
    fs.writeFileSync(path.join(output, 'resultado.json'), JSON.stringify(report, null, 2));
    console.log(`[Análisis real] ${fixture.id}: ${entry.estado}`);
  }
  console.log(output);
})().catch(() => { console.error('Ensayo interrumpido; revisar archivos conservados.'); process.exitCode = 1; });
