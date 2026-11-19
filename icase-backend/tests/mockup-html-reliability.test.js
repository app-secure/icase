jest.mock('axios', () => ({ post: jest.fn() }));
const axios = require('axios');
const Validator = require('../src/infrastructure/services/MockupValidatorService');
const AI = require('../src/infrastructure/services/MockupIaService');
const Generate = require('../src/core/use-cases/GenerarMockups');
const html = '<!DOCTYPE html><html><head><style>body{color:black}</style></head><body><button>Guardar</button></body></html>';
describe('fiabilidad del HTML de mockups', () => {
  const validator = new Validator();
  test.each(['<' + html, '<' + html + '>', '```html\n' + html + '\n```', '\uFEFF' + html])('normaliza únicamente el contorno: %s', code => {
    const result = validator.sanitizar(code);
    expect(validator.validar(result.html).valido).toBe(true);
    expect(result.html).toContain('<button>Guardar</button>');
    expect(validator.sanitizar(result.html).html).toBe(result.html);
  });
  test.each([html.replace('</body>', ''), html.replace('</html>', ''), html.replace('</head>', ''), html.slice(0, -30)])('no fabrica los cierres de una respuesta incompleta', code => {
    expect(validator.validar(validator.sanitizar(code).html).valido).toBe(false);
  });
  test('conserva la sanitización de contenido inseguro', () => {
    const result = validator.sanitizar('<' + html.replace('<button>', '<script>alert(1)</script><button onclick="alert(1)">'));
    expect(result.html).not.toContain('alert(1)');
    expect(validator.validar(result.html).valido).toBe(true);
  });
  test('normaliza antes de decidir un reintento y registra el ajuste', async () => {
    const ai = { generarMockups: jest.fn().mockResolvedValue({ mockups: [{ nombre_pantalla: 'inicio', preview_code: '<' + html + '>' }] }) };
    const useCase = new Generate({
      proyectoRepository: { obtenerPorId: async () => ({ nombre: 'Prueba', estado_fase: 'diagramas_aprobados' }) },
      requerimientoRepository: { listarPorProyecto: async () => [] },
      diagramaRepository: { listarPorProyecto: async () => [{ tipo: 'arbol_navegacion', codigo_plantuml: '@startwbs\n* Prueba\n** Inicio\n@endwbs' }] },
      disenoRepository: { obtenerPorProyecto: async () => null, guardarOActualizar: async () => ({}) },
      mockupIaService: ai
    });
    const result = await useCase.ejecutar({ proyectoId: 'prueba', pantallas: ['inicio'] });
    expect(ai.generarMockups).toHaveBeenCalledTimes(1);
    expect(result.mockups[0].errores_validacion).toEqual([]);
    expect(result.mockups[0].ajustes_sanitizacion.join(' ')).toContain('Delimitadores');
  });
  test.each(['gemini', 'groq'])('rechaza truncamiento declarado por %s aun con texto parcial', async provider => {
    const ai = new AI(); ai.geminiApiKey = 'test'; ai.groqApiKey = 'test';
    axios.post.mockResolvedValueOnce({ data: provider === 'gemini' ? { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: html }] } }] } : { choices: [{ finish_reason: 'length', message: { content: html } }] } });
    await expect(ai._solicitar(provider, 'test', 'test')).rejects.toMatchObject({ code: 'MOCKUP_OUTPUT_TRUNCATED' });
  });
  test('concatena partes textuales Gemini sin incluir razonamiento', async () => {
    const ai = new AI(); ai.geminiApiKey = 'test';
    axios.post.mockResolvedValueOnce({ data: { candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'privado' }, { text: 'uno' }, { text: 'dos' }] } }] } });
    expect(await ai._solicitar('gemini', 'test', 'test')).toBe('unodos');
  });
});
