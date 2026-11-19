// Comparación de modelos de IA sobre las tareas reales de I-CASE. Solo lee la base de datos; no guarda nada del proyecto.
// Uso: node scripts/_bench-models.cjs --task mockups|analisis --models haiku,sonnet,kimi [--project <id>] [--screens a,b,c] [--out <carpeta>] [--cases id1,id2]
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');
const mongoose = require('mongoose');
const BedrockClient = require('../src/infrastructure/services/BedrockClient');

const arg = (name, fallback) => { const index = process.argv.indexOf(`--${name}`); return index > 0 ? process.argv[index + 1] : fallback; };
const task = arg('task', 'mockups');
const names = arg('models', 'haiku,sonnet,kimi').split(',');
const projectId = arg('project', '6afbb80282d3719608258a66');
const out = path.resolve(arg('out', path.join(__dirname, '../verification-results/bench')));
fs.mkdirSync(out, { recursive: true });

// Precio en USD por millón de tokens [entrada, salida]. Kimi: tarifa de referencia de OpenRouter (SiliconFlow puede variar).
const MODELS = {
  haiku: { label: 'Claude Haiku 4.5', via: 'bedrock', id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', price: [1, 5] },
  sonnet: { label: 'Claude Sonnet 4.6', via: 'bedrock', id: 'us.anthropic.claude-sonnet-4-6', price: [3, 15] },
  kimi31: { label: 'Kimi K3.1 (Bedrock, razonamiento bajo)', via: 'bedrock', id: 'us.moonshotai.kimi-k3.1', price: [0.25, 8.8], noTemperature: true, extra: { reasoning_config: 'low' } },
  kimik2: { label: 'Kimi K2 Thinking (Bedrock)', via: 'bedrock', id: 'moonshot.kimi-k2-thinking', price: [0.6, 2.5] },
  kimi: { label: 'Kimi K3.1 Pro', via: 'siliconflow', id: 'moonshotai/Kimi-K3.1-Pro', price: [0.25, 8.8] }
};

const bedrock = new BedrockClient();
/** Una llamada al modelo; acumula tokens y tiempo en `acc`. */
async function call(model, { prompt, system, maxTokens = 16000, temperature = 0.3 }, acc) {
  const start = Date.now();
  let text = '';
  let usage = { in: 0, out: 0 };
  let truncated = false;
  if (model.via === 'bedrock') {
    const r = await bedrock.converse({ modelId: model.id, prompt, system, maxTokens, temperature: model.noTemperature ? null : temperature, timeout: 300000, extra: model.extra || null });
    text = r.text || '';
    truncated = Boolean(r.truncated);
    usage = { in: r.usage?.inputTokens || 0, out: r.usage?.outputTokens || 0 };
  } else {
    const r = await axios.post('https://api.siliconflow.com/v1/chat/completions', {
      model: model.id, max_tokens: maxTokens, temperature,
      messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }]
    }, { headers: { Authorization: `Bearer ${process.env.SILICONFLOW_API_KEY}` }, timeout: 600000 });
    const choice = r.data.choices?.[0];
    text = choice?.message?.content || '';
    truncated = choice?.finish_reason === 'length';
    usage = { in: r.data.usage?.prompt_tokens || 0, out: r.data.usage?.completion_tokens || 0 };
  }
  acc.calls += 1;
  acc.in += usage.in;
  acc.out += usage.out;
  acc.ms += Date.now() - start;
  if (truncated) { acc.truncated += 1; throw Object.assign(new Error('Respuesta truncada por el límite de salida'), { code: 'TRUNCATED' }); }
  return text;
}
const cost = (model, acc) => (acc.in * model.price[0] + acc.out * model.price[1]) / 1e6;
const fresh = () => ({ calls: 0, in: 0, out: 0, ms: 0, truncated: 0 });

const readOnly = (cls) => new Proxy(new cls(), { get(target, key) {
  const value = target[key];
  if (typeof value !== 'function') return value;
  if (/^(crear|actualizar|guardar|reemplazar|eliminar|upsert|marcar)/.test(String(key))) return async (...args) => ({ id: 'dry', ...(typeof args[0] === 'object' ? args[0] : {}), ...(typeof args[1] === 'object' ? args[1] : {}) });
  return value.bind(target);
} });
const repo = (name) => require(`../src/interface-adapters/repositories/${name}`);

async function runMockups(model, slugs) {
  const MockupIaService = require('../src/infrastructure/services/MockupIaService');
  const GenerarMockups = require('../src/core/use-cases/GenerarMockups');
  const rows = [];
  for (const slug of slugs) {
    const acc = fresh();
    class Bench extends MockupIaService {
      constructor() { super(); this.provider = 'bench'; this.models = { bench: ['bench'] }; this.openrouterApiKey = 'x'; this.esperasAltaDemanda = []; }
      async _solicitar(_proveedor, _modelo, prompt) {
        return call(model, { prompt, system: 'Responde exclusivamente con un objeto JSON válido, sin texto adicional ni bloques de código.' }, acc);
      }
    }
    const useCase = new GenerarMockups({
      proyectoRepository: new (repo('MongoProyectoRepository'))(), requerimientoRepository: new (repo('MongoRequerimientoRepository'))(),
      diagramaRepository: new (repo('MongoDiagramaRepository'))(), disenoRepository: readOnly(repo('MongoDisenoRepository')), mockupIaService: new Bench()
    });
    const row = { pantalla: slug };
    try {
      const result = await useCase.ejecutar({ proyectoId: projectId, pantallas: [slug] });
      const mockup = (result.mockups || []).find((item) => item.nombre_pantalla === slug) || (result.mockups || [])[0];
      if (!mockup) throw new Error('sin mockup: ' + (result.advertencias || []).slice(-2).join(' | '));
      const html = mockup.preview_code || '';
      const main = /<main class="icase-content">([\s\S]*?)<\/main>/.exec(html);
      const content = main ? main[1] : html;
      const warnings = mockup.advertencias_validacion || [];
      fs.mkdirSync(path.join(out, 'mockups', model.label.replace(/\W+/g, '-')), { recursive: true });
      fs.writeFileSync(path.join(out, 'mockups', model.label.replace(/\W+/g, '-'), `${slug}.html`), html);
      Object.assign(row, {
        estado: mockup.estado_calidad, errores: (mockup.errores_validacion || []).length, avisos: warnings.length,
        sin_enlace: warnings.filter((item) => item.startsWith('sin enlace')).length,
        campos_faltantes: warnings.filter((item) => /no tiene control para/.test(item)).length,
        campos_inventados: warnings.filter((item) => /no existe en la operación/.test(item)).length,
        enlaces_validos: (mockup.enlaces || []).filter((item) => item.estado === 'valido').length,
        rf: (mockup.rf_trazabilidad || []).length, caracteres: content.length,
        tablas: (content.match(/<table/g) || []).length, formularios: (content.match(/<form/g) || []).length,
        reparaciones: (mockup.ajustes_sanitizacion || []).filter((item) => /Reparación automática/.test(item)).length,
        reintentos: (result.advertencias || []).filter((item) => /primer intento inválido/.test(item)).length
      });
    } catch (error) { row.fallo = String(error.message).slice(0, 160); }
    Object.assign(row, { llamadas: acc.calls, tokens_in: acc.in, tokens_out: acc.out, segundos: Math.round(acc.ms / 1000), costo_usd: Number(cost(model, acc).toFixed(4)) });
    console.log(model.label, slug, JSON.stringify(row));
    rows.push(row);
  }
  return rows;
}

async function runAnalysis(model, cases) {
  const ModelosIaService = require('../src/infrastructure/services/ModelosIaService');
  const plainText = (value) => String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const fixtures = require('../tests/fixtures/requirements-evaluation.json').filter((item) => !cases.length || cases.includes(item.id));
  // Caso real: el insumo del proyecto de restaurante; el «objetivo» de cada RF aprobado se da por cubierto si el análisis nombra la mayoría de sus palabras clave.
  if (!cases.length || cases.includes('restaurante-real')) {
    const project = await new (repo('MongoProyectoRepository'))().obtenerPorId(projectId);
    const rf = (await new (repo('MongoRequerimientoRepository'))().listarPorProyecto(projectId)).filter((item) => item.aprobado && String(item.tipo).toUpperCase() === 'RF');
    fixtures.push({ id: 'restaurante-real', input: project.insumo_bruto, objectives: rf.map((item) => ({ id: item.identificador, terms: [[...new Set(plainText(item.nombre).split(/[^a-z0-9]+/).filter((word) => word.length >= 5).map((word) => word.slice(0, 6)))]], loose: true })) });
  }
  const rows = [];
  for (const fixture of fixtures) {
    const acc = fresh();
    class Bench extends ModelosIaService {
      async generarConBedrock(prompt) {
        return this.limpiarYParsearJson(await call(model, { prompt, system: 'Eres un orquestador experto en ingeniería de software y arquitectura. Responde exclusivamente con un objeto JSON válido según la plantilla solicitada, sin texto adicional ni bloques de código.', maxTokens: 16000, temperature: 0.2 }, acc));
      }
    }
    const service = new Bench({ env: { ...process.env, REQUIREMENTS_RESILIENT_ENABLED: 'false' } });
    const row = { caso: fixture.id };
    try {
      const result = await service.procesar({ objetivo: 'requisitos', provider: 'bedrock', initialAnalysisOnly: true, insumo_bruto: `[Fuente enriquecida]\nArchivo: ${fixture.id}.txt\n[Contenido extraído]\n${fixture.input}` });
      fs.mkdirSync(path.join(out, 'analisis', model.label.replace(/\W+/g, '-')), { recursive: true });
      fs.writeFileSync(path.join(out, 'analisis', model.label.replace(/\W+/g, '-'), `${fixture.id}.json`), JSON.stringify(result, null, 2));
      const plain = (value) => String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const analysis = result.analisis_inicial || result.analisis || result;
      const corpus = plain(JSON.stringify(analysis));
      const found = fixture.objectives.filter((objective) => objective.loose
        ? objective.terms[0].filter((term) => corpus.includes(term)).length >= Math.max(1, Math.ceil(objective.terms[0].length * 0.6))
        : objective.terms.every((group) => group.some((term) => corpus.includes(term))));
      const lists = Object.fromEntries(Object.entries(analysis).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length]));
      Object.assign(row, { objetivos: `${found.length}/${fixture.objectives.length}`, faltan: fixture.objectives.filter((item) => !found.includes(item)).map((item) => item.id).join(',') || '-', listas: JSON.stringify(lists) });
    } catch (error) { row.fallo = String(error.message).slice(0, 160); }
    Object.assign(row, { llamadas: acc.calls, tokens_in: acc.in, tokens_out: acc.out, segundos: Math.round(acc.ms / 1000), costo_usd: Number(cost(model, acc).toFixed(4)) });
    console.log(model.label, fixture.id, JSON.stringify(row));
    rows.push(row);
  }
  return rows;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const slugs = arg('screens', 'inicio-de-sesion-web,cobros,formulario-de-cierre-de-caja,comandas,registrar-pedido-web,reportes-de-ventas').split(',');
  const cases = (arg('cases', '') || '').split(',').filter(Boolean);
  const results = {};
  for (const name of names) {
    const model = MODELS[name];
    results[name] = task === 'mockups' ? await runMockups(model, slugs) : await runAnalysis(model, cases);
    fs.writeFileSync(path.join(out, `${task}-${name}.json`), JSON.stringify(results[name], null, 2));
  }
  await mongoose.disconnect();
})().catch((error) => { console.error('ERROR:', error.message); process.exit(1); });
