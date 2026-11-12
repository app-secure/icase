// Evaluación opt-in: reutiliza un análisis guardado; nunca escribe en la base activa.
const fs = require('node:fs');
const path = require('node:path');
if (!process.argv.includes('--run-real')) throw new Error('Se requiere --run-real para consumir un proveedor.');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const arg = name => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3);
const artifact = arg('artifact');
const inputFile = arg('input-file');
const caseId = arg('case');
const selected = caseId ? require('../tests/fixtures/requirements-evaluation.json').find(c => c.id === caseId) : null;
if (!artifact || !inputFile && !selected) throw new Error('Indica --artifact y --input-file o --case.');
const output = path.resolve(__dirname, '../verification-results/initial-analysis-quality', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(output, { recursive: true });
const report = { caso: caseId || path.basename(inputFile), artefacto_base: path.resolve(artifact), inicio: new Date().toISOString(), extracciones: 0, aceptacion_semantica: 'Requiere evaluación humana; no se infiere de un resultado HTTP correcto.' };
(async () => {
  const previous = JSON.parse(fs.readFileSync(artifact, 'utf8'));
  const input = inputFile ? fs.readFileSync(inputFile, 'utf8') : selected.input;
  const name = inputFile ? path.basename(inputFile) : `${caseId}.txt`;
  const Budget = require('../src/infrastructure/services/AiRequestBudget');
  const Router = require('../src/infrastructure/services/RequirementProviderRouter');
  const AI = require('../src/infrastructure/services/ModelosIaService');
  const rows = new Map(), env = { ...process.env, REQUIREMENTS_RESILIENT_ENABLED: 'true' };
  const router = new Router({ env, budget: new Budget(), stateRepository: { get: async id => rows.get(id), put: async (id, row) => rows.set(id, row), remove: async id => rows.delete(id) } });
  const service = new AI({ env, requirementsRouter: router });
  const result = await service.procesar({ objetivo: 'requisitos', provider: 'gemini', initialAnalysisTask: 'revision_calidad', initialAnalysisPrevious: previous, insumo_bruto: `[Fuente enriquecida]\nArchivo: ${name}\n\n[Contenido extraído]\n${input}` });
  fs.writeFileSync(path.join(output, 'revision.json'), JSON.stringify(result, null, 2));
  report.revision = result.revision_inventario; report.metricas = result.auditoria_requisitos?.metricas_ejecucion; report.intentos = router.trace; report.estado = 'ejecutada';
})().catch(error => { report.estado = 'fallida'; report.error = 'La revisión no pudo completarse.'; report.metricas = error.metricasEjecucion; process.exitCode = 1; }).finally(() => { report.fin = new Date().toISOString(); fs.writeFileSync(path.join(output, 'resultado.json'), JSON.stringify(report, null, 2)); console.log(`[Revisión aislada] ${report.estado}: ${output}`); });
