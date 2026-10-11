const ModelosIaService = require('../src/infrastructure/services/ModelosIaService');
const PlantUMLValidatorService = require('../src/infrastructure/services/PlantUMLValidatorService');
const MarkdownCompilerService = require('../src/infrastructure/services/MarkdownCompilerService');
const { DIAGRAM_TYPE_VALUES, DIAGRAM_DEFINITIONS } = require('../src/core/constants/DiagramTypes');

const enabled = process.env.RUN_REAL_AI_E2E === 'true';
const describeReal = enabled ? describe : describe.skip;
const fixtures = [
  'Una clínica necesita registrar pacientes, reservar citas y permitir al médico actualizar el diagnóstico. Requiere una web React, API NestJS y PostgreSQL.',
  'Una tienda necesita catálogo, carrito, pago y seguimiento del pedido para clientes; administración debe gestionar inventario. Usará una aplicación web y una API.'
];

describeReal('flujo real requisitos -> diagramas -> documento exportable', () => {
  jest.setTimeout(Number(process.env.REAL_AI_E2E_TIMEOUT_MS || 900000));
  const providers = [
    process.env.GEMINI_API_KEY ? 'gemini' : null,
    process.env.OPENAI_API_KEY ? 'openai' : null
  ].filter(Boolean);

  test.each(providers.length ? providers : [['sin_proveedor']])('proveedor %s conserva trazabilidad integral', async (provider) => {
    if (provider === 'sin_proveedor') throw new Error('Configura GEMINI_API_KEY u OPENAI_API_KEY para ejecutar RUN_REAL_AI_E2E=true.');
    const ai = new ModelosIaService();
    const validator = new PlantUMLValidatorService();
    const compiler = new MarkdownCompilerService();

    for (const [fixtureIndex, input] of fixtures.entries()) {
      const analysis = await ai.procesar({
        proyecto_id: `real-${provider}-${fixtureIndex}`,
        nombre_proyecto: `Prueba real ${fixtureIndex + 1}`,
        insumo_bruto: input,
        provider,
        objetivo: 'requisitos',
        contexto_proyecto: {}
      });
      const requirements = (analysis.requerimientos || []).map((item) => ({ ...item, aprobado: true }));
      expect(requirements.some((item) => item.tipo === 'RF')).toBe(true);

      const diagrams = [];
      for (const type of DIAGRAM_TYPE_VALUES) {
        const dependencies = DIAGRAM_DEFINITIONS[type].dependencies;
        const result = await ai.procesar({
          proyecto_id: `real-${provider}-${fixtureIndex}`,
          nombre_proyecto: analysis.nombre_proyecto,
          insumo_bruto: input,
          provider,
          objetivo: 'diagramas',
          tipo_diagrama: type,
          contexto_proyecto: {
            requerimientos_aprobados: requirements,
            diagramas_aprobados: diagrams.filter((item) => dependencies.includes(item.tipo))
          }
        });
        const diagram = (result.diagramas || []).find((item) => item.tipo === type);
        expect(diagram).toBeTruthy();
        const quality = validator.validar(diagram.codigo_plantuml, {
          tipo: type,
          requisitos: requirements,
          rnfList: requirements.filter((item) => item.tipo === 'RNF'),
          diagramasDependencia: diagrams
        });
        expect(quality.errores).toEqual([]);
        diagrams.push({ ...diagram, aprobado: true, estado: 'aprobado', version: 1 });
      }

      const markdown = compiler.compilar({
        proyecto: { nombre: analysis.nombre_proyecto, estado_fase: 'mockups_aprobados' },
        requerimientos: requirements,
        diagramas: diagrams,
        diseno: { mockups: [] }
      });
      expect(markdown).toContain('DOCUMENTACIÓN DE ESPECIFICACIÓN');
      expect(markdown.length).toBeGreaterThan(2000);
    }
  });
});
