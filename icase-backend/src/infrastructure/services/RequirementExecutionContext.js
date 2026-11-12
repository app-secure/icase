const { AsyncLocalStorage } = require('node:async_hooks');
const crypto = require('node:crypto');
const contexts = new AsyncLocalStorage();
const hash = data => crypto.createHash('sha256').update(typeof data === 'string' ? data : JSON.stringify(data)).digest('hex');
function checkpointValid(stage, data, input) {
  // JSON válido no basta: Coverage/SemanticReview deben confirmar evidencia,
  // clasificación, cobertura y conservación antes de habilitar su recuperación.
  return false;
}
module.exports = {
  hash, current: () => contexts.getStore(),
  run: (context, operation) => contexts.run(context, operation),
  setInput(input) { const ctx = contexts.getStore(); if (ctx) ctx.input = input; },
  async request(stage, prompt, operation) {
    const ctx = contexts.getStore();
    if (!ctx) return operation();
    const key = hash({ version: 'requirements-stages-v7-grounded-summary', ...(ctx.cacheNamespace ? { namespace: ctx.cacheNamespace } : {}), stage, prompt });
    ctx.stageKeys ||= {};
    ctx.stageKeys[stage] = key;
    const cached = ctx.checkpoints[key];
    if (cached?.validated) {
      await ctx.progress({ etapa: stage, recuperada: true });
      return structuredClone(cached.data);
    }
    await ctx.assertCurrent();
    await ctx.progress({ etapa: stage, recuperada: false });
    const result = await operation();
    if (result) {
      ctx.checkpoints[key] = { stage, data: result, validated: checkpointValid(stage, result, ctx.input || ''), provider: ctx.lastProvider || null, date: new Date().toISOString() };
      await ctx.save();
    }
    return result;
  },
  async confirm(stage) {
    const ctx = contexts.getStore(); const entry = ctx?.checkpoints[ctx.stageKeys?.[stage]];
    if (entry) { entry.validated = true; await ctx.save(); }
  },
  async validated(stage, data) {
    const ctx = contexts.getStore(); const key = ctx?.stageKeys?.[stage];
    if (key && ctx.checkpoints[key]) { ctx.checkpoints[key] = { ...ctx.checkpoints[key], data, validated: true }; await ctx.save(); }
  },
  async commit(operation) { const ctx = contexts.getStore(); return ctx ? ctx.commit(operation) : operation(); }
};
