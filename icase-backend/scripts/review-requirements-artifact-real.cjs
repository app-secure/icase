// Revisión opt-in de un artefacto de evaluación, sin MongoDB ni regeneración.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const AI = require('../src/infrastructure/services/ModelosIaService');
const Review = require('../src/infrastructure/services/RequirementSemanticReviewService');
const Coverage = require('../src/infrastructure/services/RequirementCoverageService');
const Approval = require('../src/core/services/RequirementApprovalService');

async function main() {
  if (!process.argv.includes('--run-real')) throw new Error('Se requiere --run-real.');
  const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (!option('artifact')) throw new Error('Indica --artifact=ruta del resultado guardado.');
  const source = path.resolve(option('artifact'));
  const allowed = path.resolve(__dirname, '../verification-results');
  if (!source.startsWith(allowed + path.sep) || path.extname(source) !== '.json') throw new Error('Solo artefactos JSON de verification-results.');
  const originalText = fs.readFileSync(source, 'utf8');
  const saved = JSON.parse(originalText);
  if (!saved.fixture?.input || !Array.isArray(saved.resultado?.requerimientos) || !saved.resultado?.auditoria_requisitos) throw new Error('Artefacto incompleto.');
  const ai = new AI();
  if (!ai.geminiApiKey) throw new Error('Falta configurar Gemini.');
  const output = path.join(allowed, 'requirements-review', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(output, { recursive: true });
  const before = JSON.stringify(saved.resultado.requerimientos);
  const report = { inicio: new Date().toISOString(), alcance: 'Solo auditoría semántica de requisitos guardados. Sin regeneración, correcciones automáticas ni base de datos.',
    proveedor: 'gemini', modelos_configurados: ai.models.gemini, origen: path.relative(allowed, source),
    origen_sha256: crypto.createHash('sha256').update(originalText).digest('hex') };
  const result = await ai.requestBudget.run(() => new Review().run({ input: saved.fixture.input,
    result: saved.resultado, coverage: new Coverage(), allowCorrection: false,
    request: (prompt, { etapa }) => ai.requestBudget.logical(etapa, () => ai.generarConGemini(prompt, option('model') || null, { allowFallback: false }))
  }));
  const review = result.auditoria_requisitos.revision_semantica;
  report.estado = review.estado;
  report.requisitos_sin_cambios = JSON.stringify(result.requerimientos) === before;
  report.archivo_original_sin_cambios = fs.readFileSync(source, 'utf8') === originalText;
  report.hallazgos = review.hallazgos;
  report.contraste_categorias = review.contraste_categorias || null;
  report.metricas = result.auditoria_requisitos.metricas_ejecucion;
  report.control_aprobacion = new Approval().evaluate(result.requerimientos, result.auditoria_requisitos);
  report.fin = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'resultado.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(output, 'artefacto-revisado.json'), JSON.stringify({ fixture: saved.fixture, resultado: result }, null, 2));
  console.log(JSON.stringify({ estado: report.estado, hallazgos: report.hallazgos.length, pendientes_contraste: report.contraste_categorias?.pendientes || [],
    requisitos_sin_cambios: report.requisitos_sin_cambios, archivo_original_sin_cambios: report.archivo_original_sin_cambios, evidencias: output }, null, 2));
  if (review.estado !== 'completada' || !report.requisitos_sin_cambios || !report.archivo_original_sin_cambios) process.exitCode = 1;
}
main().catch(() => { console.error('No se pudo completar la revisión aislada. No se modificaron proyectos ni el artefacto original.'); process.exitCode = 1; });
