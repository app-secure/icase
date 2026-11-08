// Opt-in explícito. Sin MongoDB, cambios en proyectos, aprobaciones ni Docker.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const AI = require('../src/infrastructure/services/ModelosIaService');
const { evaluate } = require('./lib/requirements-evaluation.cjs');
const fixtures = require('../tests/fixtures/requirements-evaluation.json');

async function main() {
  if (!process.argv.includes('--run-real')) throw new Error('Requiere --run-real: consume cuota de los proveedores configurados.');
  const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const providers = (option('providers') || 'gemini,openai').split(',');
  const keys = { gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', groq: 'GROQ_API_KEY' };
  if (providers.some(provider => !keys[provider])) throw new Error('Proveedor no soportado por este evaluador.');
  const cases = fixtures.filter(item => !option('case') || item.id === option('case'));
  if (!cases.length) throw new Error('Caso de evaluación no encontrado.');
  const output = path.resolve(__dirname, '../verification-results/requirements-evaluation', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(output, { recursive: true });
  const report = { protocolo: 'requirements-evaluation-v1', inicio: new Date().toISOString(), revision_codigo: null, alcance: 'Generación real de requisitos de dominios sintéticos. Sin aprobación ni recorrido completo hasta ZIP.', escenarios: [], limites: ['La cobertura léxica requiere revisión humana.', 'No existe comparación válida con pruebas históricas de otros insumos.', 'No valida PDF/audio, navegador, Docker ni despliegue.'] };
  try { report.revision_codigo = require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true }).trim(); } catch { /* Opcional */ }
  try { report.codigo_con_cambios_locales = Boolean(require('node:child_process').execFileSync('git', ['status', '--porcelain'], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true }).trim()); } catch { report.codigo_con_cambios_locales = null; }
  const save = () => fs.writeFileSync(path.join(output, 'resultado.json'), JSON.stringify(report, null, 2));
  for (const provider of providers) for (const fixture of cases) {
    const entry = { dominio: fixture.id, proveedor_solicitado: provider, modelo_solicitado: option('model') || null, modelo_efectivo: 'no registrado; consultar logs del adaptador', insumo_sha256: crypto.createHash('sha256').update(fixture.input).digest('hex') };
    report.escenarios.push(entry);
    if (!process.env[keys[provider]]) { entry.estado = 'omitido_sin_credencial'; save(); continue; }
    console.log(`[Evaluación] ${provider} / ${fixture.id}: inicio`);
    const modelEnvironment = { gemini: 'GEMINI_ANALYSIS_MODELS', groq: 'GROQ_ANALYSIS_MODELS', openai: 'OPENAI_ANALYSIS_MODELS' }[provider];
    const previousModel = process.env[modelEnvironment];
    if (option('model')) process.env[modelEnvironment] = option('model');
    try {
      const ai = new AI();
      entry.modelos_configurados = ai.models[provider];
      entry.configuracion = { presupuesto_entrada_groq: Number(process.env.GROQ_ANALYSIS_INPUT_BUDGET || 3000), max_solicitudes: Number(process.env.AI_REQUIREMENTS_MAX_ATTEMPTS || 8), limite_ms: Number(process.env.AI_REQUIREMENTS_TIMEOUT_MS || 180000) };
      const result = await ai.procesar({ objetivo: 'requisitos', provider, specificModel: option('model'), insumo_bruto: fixture.input, contexto_proyecto: {} });
      entry.estado = 'generado'; entry.metricas = evaluate(fixture, result);
      if (option('model')) entry.modelo_efectivo = option('model'); // lista de modelos fijada solo en este proceso
      fs.writeFileSync(path.join(output, `${provider}-${fixture.id}.json`), JSON.stringify({ fixture, resultado: result }, null, 2));
    } catch (error) {
      entry.estado = 'fallido'; entry.error = 'El proveedor no produjo un resultado utilizable; consultar el registro sanitizado y las métricas.';
      entry.metricas_ejecucion = error.metricasEjecucion || null;
      const stages = entry.metricas_ejecucion?.etapas || [];
      entry.causas = [...new Set(stages.map(stage => stage.causa).filter(Boolean))];
    } finally {
      if (previousModel === undefined) delete process.env[modelEnvironment]; else process.env[modelEnvironment] = previousModel;
    }
    save(); console.log(`[Evaluación] ${provider} / ${fixture.id}: ${entry.estado}`);
  }
  report.fin = new Date().toISOString(); save();
  const lines = ['# Evaluación real de requisitos', '', `Inicio: ${report.inicio}`, '', report.alcance, '', ...report.escenarios.map(item => `- ${item.proveedor_solicitado} / ${item.dominio}: ${item.estado}${item.metricas ? `; ${item.metricas.rf} RF, ${item.metricas.rnf} RNF; ${item.metricas.duracion_ms} ms; ${item.metricas.solicitudes_http} solicitudes; aprobación ${item.metricas.control_aprobacion.bloqueado ? 'bloqueada' : 'estructuralmente habilitada'}` : ''}`), '', 'Los JSON conservan los artefactos sintéticos para revisión. No se afirma exhaustividad ni corrección semántica por obtener coincidencias léxicas.', '', ...report.limites.map(item => `- ${item}`)];
  fs.writeFileSync(path.join(output, 'resultado.md'), lines.join('\n') + '\n');
  console.log(`[Evaluación] Evidencias: ${output}`);
  if (report.escenarios.some(item => item.estado !== 'generado')) process.exitCode = 1;
}
main().catch(() => { console.error('No se pudo iniciar la evaluación; comprueba opciones y permisos. No se han modificado proyectos.'); process.exitCode = 1; });
