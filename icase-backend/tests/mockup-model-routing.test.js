const MockupComplexity = require('../src/core/services/MockupComplexity');
const MockupIaService = require('../src/infrastructure/services/MockupIaService');

describe('complejidad de una pantalla', () => {
  test.each([
    [{ slug: 'inicio-de-sesion-web' }, 'simple'],
    [{ nombre: 'Recuperación de Contraseña' }, 'simple'],
    [{ slug: 'formulario-de-cierre-de-caja', rfs: ['RF-08'] }, 'simple'],
    [{ slug: 'detalle-de-comanda' }, 'simple'],
    [{ slug: 'comandas' }, 'densa'],
    [{ slug: 'cobros' }, 'densa'],
    [{ slug: 'reportes-de-ventas' }, 'densa'],
    [{ slug: 'registrar-pedido-web' }, 'densa'],
    [{ slug: 'mis-reservas' }, 'densa'],
    [{ slug: 'formulario-de-pedido', rfs: ['RF-15', 'RF-17'] }, 'densa'],
    [{ slug: 'pantalla-rara' }, 'simple']
  ])('%j → %s', (input, expected) => expect(MockupComplexity.of(input)).toBe(expected));
});

describe('reparto de modelos por complejidad', () => {
  const run = async (env, options) => {
    const previous = { ...process.env };
    Object.assign(process.env, env);
    try {
      const service = new MockupIaService();
      service.provider = 'bedrock';
      service.models = { ...service.models, bedrock: ['general'] };
      service.bedrock = { configured: true };
      const used = [];
      service._solicitar = async (_proveedor, modelo) => { used.push(modelo); return '{"mockups":[]}'; };
      await service._intentarProveedor('bedrock', 'p', 10, options);
      return used;
    } finally { for (const key of Object.keys(env)) { if (key in previous) process.env[key] = previous[key]; else delete process.env[key]; } }
  };
  const env = { BEDROCK_MOCKUP_MODELS_SIMPLE: 'haiku', BEDROCK_MOCKUP_MODELS_DENSE: 'sonnet' };

  test('una pantalla simple usa el modelo barato y una densa el fuerte', async () => {
    expect(await run(env, { complejidad: 'simple' })).toEqual(['haiku']);
    expect(await run(env, { complejidad: 'densa' })).toEqual(['sonnet']);
  });

  test('una edición por chat siempre usa el modelo de las pantallas densas', async () => {
    expect(await run(env, { complejidad: 'simple', modoEdicion: true })).toEqual(['sonnet']);
  });

  test('sin reparto configurado, o sin complejidad, se usa la lista general', async () => {
    expect(await run({}, { complejidad: 'densa' })).toEqual(['general']);
    expect(await run(env, {})).toEqual(['general']);
  });
});
