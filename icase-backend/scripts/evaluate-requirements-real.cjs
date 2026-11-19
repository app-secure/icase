// Opt-in explícito. Sin MongoDB, cambios en proyectos, aprobaciones ni Docker.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const AI = require('../src/infrastructure/services/ModelosIaService');
const { build: buildSourceContext } = require('../src/infrastructure/services/RequirementSourceContext');
const { evaluate } = require('./lib/requirements-evaluation.cjs');
const fixtures = require('../tests/fixtures/requirements-evaluation.json');

async function main() {
  if (!process.argv.includes('--run-real')) throw new Error('Requiere --run-real: consume cuota de los proveedores configurados.');
  const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const resilient = process.argv.includes('--resilient');
  const sourceContext = process.argv.includes('--source-context') || process.argv.includes('--source-context-no-hints');
  const includeHints = !process.argv.includes('--source-context-no-hints');
  const providers = (option('providers') || 'gemini').split(',');
  const keys = { gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', groq: 'GROQ_API_KEY', openrouter: 'OPENROUTER_API_KEY', ollama: null };
  if (providers.some(provider => !(provider in keys) || (provider === 'ollama' && !resilient) || (provider === 'openai' && resilient))) throw new Error('Proveedor no soportado por este perfil de evaluación.');
  const inputFile = option('input-file');
  const cases = inputFile ? [{ id: 'entrevista-restaurante', input: fs.readFileSync(path.resolve(inputFile), 'utf8'), objectives: [], exclusions: [], scope: 'Entrevista real proporcionada para pruebas; cobertura semántica sujeta a revisión humana.' }]
    : fixtures.filter(item => !option('case') || item.id === option('case'));
  if (!cases.length) throw new Error('Caso de evaluación no encontrado.');
  const output = path.resolve(__dirname, '../verification-results/requirements-evaluation', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(output, { recursive: true });
  const report = { protocolo: 'requirements-evaluation-v1', inicio: new Date().toISOString(), revision_codigo: null, alcance: 'Generación real de requisitos de dominios sintéticos. Sin aprobación ni recorrido completo hasta ZIP.', escenarios: [], limites: ['La cobertura léxica requiere revisión humana.', 'No existe comparación válida con pruebas históricas de otros insumos.', 'No valida PDF/audio, navegador, Docker ni despliegue.'] };
  try { report.revision_codigo = require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true }).trim(); } catch { /* Opcional */ }
  try { report.codigo_con_cambios_locales = Boolean(require('node:child_process').execFileSync('git', ['status', '--porcelain'], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true }).trim()); } catch { report.codigo_con_cambios_locales = null; }
  const save = () => fs.writeFileSync(path.join(output, 'resultado.json'), JSON.stringify(report, null, 2));
  for (const provider of providers) for (const fixture of cases) {
    const entry = { dominio: fixture.id, proveedor_solicitado: provider, modelo_solicitado: option('model') || null, modelo_efectivo: 'no registrado; consultar logs del adaptador', insumo_sha256: crypto.createHash('sha256').update(fixture.input).digest('hex') };
    if (sourceContext) entry.prueba_pistas_fuente = inputFile ? 'Metadatos mínimos; el documento original es la única fuente citable' : includeHints ? 'Redis y Prisma figuran solo en metadatos sugeridos por IA' : 'Contenido de fuente sin pistas, para contraste';
    report.escenarios.push(entry);
    if (keys[provider] && !process.env[keys[provider]]) { entry.estado = 'omitido_sin_credencial'; save(); continue; }
    console.log(`[Evaluación] ${provider} / ${fixture.id}: inicio`);
    const modelEnvironment = { gemini: 'GEMINI_ANALYSIS_MODELS', groq: 'GROQ_ANALYSIS_MODELS', openai: 'OPENAI_ANALYSIS_MODELS' }[provider];
    const previousModel = process.env[modelEnvironment];
    if (option('model')) process.env[modelEnvironment] = option('model');
    let requirementsRouter;
    try {
      if (resilient) {
        const Router = require('../src/infrastructure/services/RequirementProviderRouter');
        const Budget = require('../src/infrastructure/services/AiRequestBudget');
        const rows = new Map();
        requirementsRouter = new Router({ env: { ...process.env, OLLAMA_ENABLED: 'true' }, budget: new Budget(),
          stateRepository: { get: async id => rows.get(id), put: async (id, value) => rows.set(id, value), remove: async id => rows.delete(id) } });
      }
      const ai = new AI({ env: { ...process.env, REQUIREMENTS_RESILIENT_ENABLED: String(resilient) }, requirementsRouter });
      entry.modelos_configurados = ai.models[provider];
      entry.configuracion = { presupuesto_entrada_groq: Number(process.env.GROQ_ANALYSIS_INPUT_BUDGET || 3000), max_solicitudes: Number(process.env.AI_REQUIREMENTS_MAX_ATTEMPTS || 8), limite_ms: Number(process.env.AI_REQUIREMENTS_TIMEOUT_MS || 180000) };
      const source = sourceContext ? buildSourceContext([{ nombre_archivo: inputFile ? path.basename(inputFile) : `${fixture.id}.txt`, tipo: 'texto', tipo_contenido: 'Entrevista',
        descripcion: inputFile ? 'Entrevista de requisitos' : 'Entrevista sobre un sistema con Redis y Prisma.', etiquetas: inputFile ? [] : ['Redis', 'Prisma'], metadatos_generados_ia: !inputFile,
        texto_transcrito: fixture.input }]) : null;
      const result = await ai.procesar({ objetivo: 'requisitos', provider, specificModel: option('model'),
        insumo_bruto: source?.content || fixture.input, pistas_fuentes: includeHints ? source?.hints || [] : [], contexto_proyecto: {} });
      entry.estado = 'generado'; entry.metricas = evaluate(fixture, result);
      if (sourceContext) {
        const inventory = result.auditoria_requisitos?.inventario || [];
        entry.control_pistas_fuente = {
          inventario_con_redis_o_prisma: inventory.filter(item => /\b(?:redis|prisma)\b/i.test(item.necesidad || '')).map(item => item.id),
          requisitos_con_redis_o_prisma: (result.requerimientos || []).filter(item => /\b(?:redis|prisma)\b/i.test(`${item.nombre || ''} ${item.descripcion || ''}`)).map(item => item.identificador),
          fuente_contenido_original: `${fixture.id}.txt`
        };
      }
      if (entry.metricas.revision_semantica !== 'completada' || entry.metricas.control_aprobacion?.bloqueado) entry.estado = 'borrador_pendiente_de_revision';
      if (requirementsRouter?.lastResponse) entry.modelo_efectivo = requirementsRouter.lastResponse.model;
      if (option('model')) entry.modelo_efectivo = option('model'); // lista de modelos fijada solo en este proceso
      fs.writeFileSync(path.join(output, `${provider}-${fixture.id}.json`), JSON.stringify({ fixture, resultado: result }, null, 2));
    } catch (error) {
      entry.estado = 'fallido'; entry.error = 'El proveedor no produjo un resultado utilizable; consultar el registro sanitizado y las métricas.';
      entry.metricas_ejecucion = error.metricasEjecucion || null;
      entry.rutas = requirementsRouter?.lastEvents || [];
      const stages = entry.metricas_ejecucion?.etapas || [];
      entry.causas = [...new Set(stages.map(stage => stage.causa).filter(Boolean))];
    } finally {
      if (requirementsRouter) entry.intentos_detallados = requirementsRouter.trace;
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
