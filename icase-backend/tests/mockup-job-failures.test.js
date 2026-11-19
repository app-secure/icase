const MockupController = require('../src/interface-adapters/controllers/MockupController');
const MockupIaService = require('../src/infrastructure/services/MockupIaService');

const avisosReales = [
  'Prompt estimado: 7412 tokens de entrada',
  'openrouter:nvidia/nemotron-3.5-super-vl:free: salida_truncada',
  'gemini:gemini-3.5-flash-lite: alta_demanda',
  'gemini:gemini-3.8-flash: alta_demanda',
  'groq:openai/gpt-oss-120b: cuota'
];

const trabajo = (resultado, payload = { pantallas: ['a', 'b'] }) => {
  const actualizar = jest.fn(async () => ({}));
  const controller = new MockupController({
    generarMockupsUseCase: { ejecutar: jest.fn(async () => resultado) },
    trabajoGeneracionRepository: { actualizar }
  });
  return { actualizar, ejecutar: () => controller._ejecutarTrabajo('t1', payload) };
};

describe('resultado de un trabajo de generación de mockups', () => {
  test('cero pantallas generadas es un fallo y explica por proveedor qué pasó', async () => {
    const { actualizar, ejecutar } = trabajo({ totalProcesados: 0, mockups: [], advertencias: avisosReales });
    await ejecutar();
    const final = actualizar.mock.calls.at(-1)[1];
    expect(final).toMatchObject({ estado: 'fallido', mensaje: 'No se generó ninguna pantalla', total_generados: 0 });
    expect(final.error).toContain('openrouter: la respuesta se cortó por el límite de salida');
    expect(final.error).toContain('gemini: el modelo está saturado por demanda');
    expect(final.error).toContain('groq: se alcanzó el límite de uso');
    expect(final.error).toContain('Reintenta en unos minutos');
  });

  test('una generación parcial se completa y dice cuántas faltan', async () => {
    const { actualizar, ejecutar } = trabajo({ totalProcesados: 1, mockups: [{}], advertencias: [] });
    await ejecutar();
    expect(actualizar.mock.calls.at(-1)[1]).toMatchObject({ estado: 'completado', mensaje: 'Se generaron 1 de 2 pantallas', total_generados: 1 });
  });

  test('una generación completa y una reparación sin cambios conservan su comportamiento', async () => {
    const completa = trabajo({ totalProcesados: 2, mockups: [{}, {}], advertencias: [] });
    await completa.ejecutar();
    expect(completa.actualizar.mock.calls.at(-1)[1]).toMatchObject({ estado: 'completado', mensaje: 'Generación completada' });
    const reparacion = trabajo({ totalProcesados: 0, mockups: [], advertencias: [] }, { pantallas: ['a'], soloReparar: true });
    await reparacion.ejecutar();
    expect(reparacion.actualizar.mock.calls.at(-1)[1].estado).toBe('completado');
  });

  test('sin avisos reconocibles el mensaje sigue siendo útil', () => {
    expect(MockupController.explicarFalloIa([])).toBe('Ningún proveedor de IA pudo generar las pantallas. Reintenta en unos minutos o genera de una en una.');
  });
});

describe('alta demanda del proveedor', () => {
  const servicio = (comportamientos) => {
    process.env.MOCKUP_HIGH_DEMAND_WAITS_MS = '1,1';
    const instancia = new MockupIaService();
    instancia.geminiApiKey = 'x';
    instancia.models.gemini = ['modelo-a'];
    instancia._solicitar = jest.fn(async () => {
      const siguiente = comportamientos.shift();
      if (siguiente instanceof Error) throw siguiente;
      return siguiente;
    });
    return instancia;
  };
  const alta = () => Object.assign(new Error('x'), { response: { status: 503, data: { error: { message: 'This model is currently experiencing high demand.' } } } });
  afterAll(() => { delete process.env.MOCKUP_HIGH_DEMAND_WAITS_MS; });

  test('reintenta el mismo modelo tras una espera y usa su respuesta', async () => {
    const instancia = servicio([alta(), '{"mockups":[]}']);
    const resultado = await instancia._intentarProveedor('gemini', 'prompt', 10);
    expect(resultado.texto).toBe('{"mockups":[]}');
    expect(instancia._solicitar).toHaveBeenCalledTimes(2);
    expect(resultado.advertencias).toEqual([]);
  });

  test('si sigue saturado tras los reintentos pasa al siguiente y deja constancia', async () => {
    const instancia = servicio([alta(), alta(), alta()]);
    const resultado = await instancia._intentarProveedor('gemini', 'prompt', 10);
    expect(resultado.texto).toBeNull();
    expect(instancia._solicitar).toHaveBeenCalledTimes(3);
    expect(resultado.advertencias).toEqual(['gemini:modelo-a: alta_demanda']);
  });

  test('otros errores no se reintentan', async () => {
    const instancia = servicio([Object.assign(new Error('x'), { code: 'MOCKUP_OUTPUT_TRUNCATED' })]);
    await instancia._intentarProveedor('gemini', 'prompt', 10);
    expect(instancia._solicitar).toHaveBeenCalledTimes(1);
  });
});
