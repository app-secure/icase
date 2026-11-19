const BedrockClient = require('../src/infrastructure/services/BedrockClient');
const MockupIaService = require('../src/infrastructure/services/MockupIaService');
const ModelosIaService = require('../src/infrastructure/services/ModelosIaService');
const AiModelConfig = require('../src/infrastructure/services/AiModelConfig');

const respuesta = (texto, stopReason = 'end_turn') => ({ data: { output: { message: { role: 'assistant', content: [{ text: texto }] } }, stopReason, usage: { inputTokens: 10, outputTokens: 5 } } });
const cliente = (post, env = {}) => new BedrockClient({ env: { BEDROCK_API_KEY: 'ABSKtest', BEDROCK_REGION: 'us-east-2', ...env }, transport: { post } });

describe('BedrockClient (API Converse)', () => {
  test('llama a Converse en la región configurada con la clave de API como token Bearer', async () => {
    const post = jest.fn(async () => respuesta('{"ok":true}'));
    const resultado = await cliente(post).converse({ modelId: 'us.anthropic.modelo-1', prompt: 'hola', system: 'solo JSON', maxTokens: 500, temperature: 0.1 });
    const [url, cuerpo, opciones] = post.mock.calls[0];
    expect(url).toBe('https://bedrock-runtime.us-east-2.amazonaws.com/model/us.anthropic.modelo-1/converse');
    expect(cuerpo).toEqual({ messages: [{ role: 'user', content: [{ text: 'hola' }] }], inferenceConfig: { maxTokens: 500, temperature: 0.1 }, system: [{ text: 'solo JSON' }] });
    expect(opciones.headers.Authorization).toBe('Bearer ABSKtest');
    expect(resultado).toMatchObject({ text: '{"ok":true}', stopReason: 'end_turn', truncated: false });
  });

  test('codifica el identificador del modelo en la URL y solo lee el texto de la respuesta', async () => {
    const post = jest.fn(async () => ({ data: { output: { message: { content: [{ reasoningContent: { reasoningText: { text: 'pienso…' } } }, { text: 'respuesta' }] } }, stopReason: 'end_turn' } }));
    const resultado = await cliente(post).converse({ modelId: 'arn:aws:bedrock:us-east-2:123:inference-profile/x', prompt: 'p' });
    expect(post.mock.calls[0][0]).toContain('/model/arn%3Aaws%3Abedrock%3Aus-east-2%3A123%3Ainference-profile%2Fx/converse');
    expect(resultado.text).toBe('respuesta');
  });

  test('detecta la salida truncada', async () => {
    const resultado = await cliente(jest.fn(async () => respuesta('{"a":', 'max_tokens'))).converse({ modelId: 'm', prompt: 'p' });
    expect(resultado.truncated).toBe(true);
  });

  test('sin clave o sin modelo falla con un mensaje claro y no llama a la red', async () => {
    const post = jest.fn();
    await expect(new BedrockClient({ env: {}, transport: { post } }).converse({ modelId: 'm', prompt: 'p' })).rejects.toThrow(/BEDROCK_API_KEY/);
    await expect(cliente(post).converse({ prompt: 'p' })).rejects.toThrow(/identificador del modelo/);
    expect(post).not.toHaveBeenCalled();
  });

  test('rechaza una región inválida y acepta AWS_BEARER_TOKEN_BEDROCK', () => {
    expect(() => cliente(jest.fn(), { BEDROCK_REGION: 'us-east-2.evil.com/' }).url('m')).toThrow(/región/);
    expect(new BedrockClient({ env: { AWS_BEARER_TOKEN_BEDROCK: 'tok' } }).configured).toBe(true);
    expect(new BedrockClient({ env: {} }).configured).toBe(false);
  });

  test('lee el mensaje de error de Bedrock, que viene en «message»', () => {
    expect(BedrockClient.messageOf({ response: { data: { message: 'Too many requests' } } })).toBe('Too many requests');
    expect(BedrockClient.messageOf({ message: 'x' })).toBe('x');
  });
});

describe('Bedrock como proveedor de mockups', () => {
  const servicio = (post, env = {}) => {
    Object.assign(process.env, { BEDROCK_API_KEY: 'ABSKtest', BEDROCK_MODELS: 'us.modelo-a', ...env });
    const instancia = new MockupIaService();
    instancia.bedrock = cliente(post);
    return instancia;
  };
  afterAll(() => { delete process.env.BEDROCK_API_KEY; delete process.env.BEDROCK_MODELS; });

  test('se puede poner primero en el orden de proveedores y usa los modelos configurados', async () => {
    process.env.AI_PROVIDER_ORDER = 'bedrock,openrouter';
    expect(AiModelConfig.providerOrder()).toEqual(['bedrock', 'openrouter']);
    delete process.env.AI_PROVIDER_ORDER;
    expect(servicio(jest.fn()).models.bedrock).toEqual(['us.modelo-a']);
  });

  test('genera con Converse y entrega el texto de la respuesta', async () => {
    const post = jest.fn(async () => respuesta('{"mockups":[]}'));
    const resultado = await servicio(post)._intentarProveedor('bedrock', 'prompt', 10);
    expect(resultado).toMatchObject({ texto: '{"mockups":[]}', modelo: 'us.modelo-a' });
    expect(post.mock.calls[0][1].inferenceConfig.maxTokens).toBe(16000);
  });

  test('sin clave el proveedor se omite con un aviso', async () => {
    const instancia = servicio(jest.fn());
    instancia.bedrock = new BedrockClient({ env: {}, transport: { post: jest.fn() } });
    const resultado = await instancia._intentarProveedor('bedrock', 'prompt', 10);
    expect(resultado.texto).toBeNull();
    expect(resultado.advertencias[0]).toMatch(/sin credencial|no tiene credencial/);
  });

  test('una salida truncada, la saturación y la cuota se clasifican como en los demás proveedores', async () => {
    const instancia = servicio(jest.fn(async () => respuesta('{"x":', 'max_tokens')));
    expect((await instancia._intentarProveedor('bedrock', 'p', 10)).advertencias).toEqual(['bedrock:us.modelo-a: salida_truncada']);
    const error = (status, message) => Object.assign(new Error('x'), { response: { status, data: { message } } });
    expect(instancia._clasificarError(error(429, 'Too many requests, please wait')).tipo).toBe('cuota');
    expect(instancia._clasificarError(error(503, 'Service unavailable')).tipo).toBe('alta_demanda');
    expect(instancia._clasificarError(error(400, 'The provided model identifier is invalid.')).tipo).toBe('modelo_no_disponible');
    expect(instancia._clasificarError(error(403, 'You don\'t have access to the model')).tipo).toBe('autenticacion');
  });
});

describe('Bedrock como proveedor de análisis y diagramas', () => {
  const servicio = (post, env = {}) => {
    Object.assign(process.env, { BEDROCK_MODELS: 'us.modelo-a', ...env });
    const instancia = new ModelosIaService({ env: {} });
    instancia.bedrock = cliente(post);
    return instancia;
  };
  afterAll(() => { delete process.env.BEDROCK_MODELS; });

  test('devuelve el JSON de la respuesta, también si viene envuelto en un bloque de código', async () => {
    const instancia = servicio(jest.fn(async () => respuesta('```json\n{"titulo":"x"}\n```')));
    expect(await instancia.generarConBedrock('prompt')).toEqual({ titulo: 'x' });
    expect(await instancia._ejecutarProveedor('bedrock', 'prompt', null)).toEqual({ titulo: 'x' });
  });

  test('generarJson lo usa cuando es el primero del orden', async () => {
    const instancia = servicio(jest.fn(async () => respuesta('{"reglas":[]}')));
    instancia.providerOrder = ['bedrock'];
    expect(await instancia.generarJson('p')).toEqual({ reglas: [] });
  });

  test('una respuesta truncada falla de forma explícita cuando se pide solo Bedrock y sigue con otro proveedor en modo automático', async () => {
    const instancia = servicio(jest.fn(async () => respuesta('{"a":', 'max_tokens')));
    await expect(instancia.generarConBedrock('p', null, { allowFallback: false })).rejects.toThrow(/Bedrock/);
    expect(await instancia.generarConBedrock('p', null, { allowFallback: true })).toBeNull();
  });

  test('sin modelos configurados lo explica en lugar de adivinar un identificador', async () => {
    const instancia = servicio(jest.fn(), { BEDROCK_MODELS: '' });
    instancia.models.bedrock = [];
    await expect(instancia.generarConBedrock('p', null, { allowFallback: false })).rejects.toThrow(/BEDROCK_MODELS/);
    expect(await instancia.generarConBedrock('p', null, { allowFallback: true })).toBeNull();
  });
});
