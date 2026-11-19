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

describe('clasificación por contenido, no solo por nombre', () => {
  const rf = (identificador, descripcion, extra = {}) => ({ identificador, nombre: descripcion.split('.')[0], descripcion, criterios_aceptacion: [], actores: ['Cajero'], ...extra });

  test('un nombre engañoso se corrige con lo que piden los requisitos', () => {
    const tablero = MockupComplexity.explicar({ nombre: 'Pantalla rara', rfs: ['RF-09'], requisitos: [rf('RF-09', 'El administrador consulta un listado de ventas con filtros por fecha y totales por medio de pago.')] });
    expect(tablero.complejidad).toBe('densa');
    expect(tablero.motivos.join(' ')).toMatch(/vistas de datos/);
    const bienvenida = MockupComplexity.explicar({ nombre: 'Panel de bienvenida', rfs: ['RF-01'], requisitos: [rf('RF-01', 'El usuario ve un saludo.')] });
    expect(bienvenida.puntos).toBe(2); // el nombre sugiere tablero y nada más lo confirma: sigue siendo un caso límite
  });

  test('un formulario de un solo requisito con muchos campos o criterios sube de nivel solo si hay más señales', () => {
    const operaciones = [{ id: 'RF-08', schema: { properties: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`campo${i}`, {}])) } }];
    const corto = MockupComplexity.explicar({ slug: 'formulario-de-cierre-de-caja', rfs: ['RF-08'], requisitos: [rf('RF-08', 'El cajero registra el cierre.')], operaciones });
    expect(corto.complejidad).toBe('simple');
    const largo = MockupComplexity.explicar({ slug: 'formulario-de-cierre-de-caja', rfs: ['RF-08'], requisitos: [rf('RF-08', 'El cajero registra el cierre con un resumen de totales por medio de pago.', { criterios_aceptacion: ['a', 'b', 'c', 'd'], actores: ['Cajero', 'Administrador'] })], operaciones });
    expect(largo.complejidad).toBe('densa');
  });

  test('las líneas de detalle de un pedido hacen densa una pantalla de nombre simple', () => {
    const resultado = MockupComplexity.explicar({ slug: 'detalle-de-pedido', rfs: ['RF-15'], requisitos: [rf('RF-15', 'El mesero registra un pedido con varios platos y su cantidad en cada línea de detalle.')] });
    expect(resultado.complejidad).toBe('densa');
    expect(resultado.motivos.join(' ')).toMatch(/líneas de detalle/);
  });

  test('sin requisitos ni contrato, funciona como antes (solo por nombre)', () => {
    expect(MockupComplexity.of({ slug: 'cobros' })).toBe('densa');
    expect(MockupComplexity.of({ slug: 'inicio-de-sesion-web' })).toBe('simple');
  });
});

describe('límite de peticiones de Bedrock al generar en paralelo', () => {
  test('«Too many requests» es una espera breve y se reintenta; una cuota agotada sigue abriendo el cortacircuitos', () => {
    const service = new MockupIaService();
    const error = (status, message) => ({ response: { status, data: { message } } });
    expect(service._clasificarError(error(429, 'Too many requests, please wait before trying again.')).tipo).toBe('alta_demanda');
    expect(service._clasificarError(error(429, 'Rate limit exceeded: quota exhausted')).tipo).toBe('cuota');
    expect(service.esperasAltaDemanda).toEqual([4000, 10000, 20000]);
  });
});
