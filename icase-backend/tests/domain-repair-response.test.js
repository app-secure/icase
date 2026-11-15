const Procesar = require('../src/core/use-cases/ProcesarConIA');
const Modelos = require('../src/infrastructure/services/ModelosIaService');
const Validator = require('../src/infrastructure/services/PlantUMLValidatorService');
const code = '@startuml\nclass Cuenta {\n+String nombre\n}\nclass Movimiento {\n+float importe\n}\nclass Documento {\n+String referencia\n}\nCuenta "1" -- "0..*" Movimiento\nMovimiento -- Documento\n@enduml';
function setup(first, second) {
  const stored = [{ id: 'uc', tipo: 'casos_de_uso', version: 1, aprobado: true, estado: 'aprobado' }];
  const project = { id: 'p', nombre: 'Prueba', estado_fase: 'analisis_aprobado', insumo_bruto: 'Registrar movimientos' };
  const ai = { procesar: jest.fn().mockResolvedValueOnce(first).mockResolvedValue(second) };
  const repository = {
    listarPorProyecto: jest.fn(async () => [...stored]),
    crearMuchos: jest.fn(async items => { stored.push(...items); return items; }),
    actualizar: jest.fn(), eliminarPorProyecto: jest.fn()
  };
  return { ai, repository, stored, service: new Procesar({
    proyectoRepository: { obtenerPorId: jest.fn(async () => project), actualizar: jest.fn(async (_id, update) => ({ ...project, ...update })) },
    requerimientoRepository: { listarPorProyecto: jest.fn(async () => []) },
    diagramaRepository: repository, estandarRepository: { obtenerEstandares: jest.fn(async () => []) },
    aiOrchestratorService: ai, plantumlValidatorService: new Validator()
  }) };
}
test.each([
  { diagramas: [] },
  { diagramas: [{ tipo: 'clases_dominio', codigo_plantuml: '' }] },
  { diagramas: [{ tipo: 'clases_dominio', codigo_plantuml: '@startuml\nclass Unica\n@enduml' }] }
])('una reparación vacía o inválida no destruye el dominio válido', async repair => {
  const fixture = setup({ diagramas: [{ tipo: 'clases_dominio', codigo_plantuml: code }] }, repair);
  await fixture.service.ejecutar({ proyectoId: 'p', objetivo: 'diagramas', tipoDiagrama: 'clases_dominio' });
  expect(fixture.ai.procesar).toHaveBeenCalledTimes(2);
  const saved = fixture.stored.find(d => d.tipo === 'clases_dominio');
  expect(saved.codigo_plantuml).toBe(code);
  expect(saved.aprobado).toBe(false);
  expect(saved.estado_calidad).toBe('advertencia');
  expect(fixture.repository.eliminarPorProyecto).not.toHaveBeenCalled();
});
test('si nunca hubo un diagrama válido se explica la ausencia sin guardar un sustituto', async () => {
  const fixture = setup({ diagramas: [] }, { diagramas: [] });
  await expect(fixture.service.ejecutar({ proyectoId: 'p', objetivo: 'diagramas', tipoDiagrama: 'clases_dominio' })).rejects.toThrow('La respuesta no contiene diagramas.');
  expect(fixture.repository.crearMuchos).not.toHaveBeenCalled();
});
test.each(['diagramas', 'diagrama', 'raiz'])('normaliza un objeto singular en %s sin fabricar clases', field => {
  const diagram = { tipo: 'clases_dominio', codigo_plantuml: code };
  const result = new Modelos({ env: {} }).normalizarResultado(field === 'raiz' ? diagram : { [field]: diagram }, 'diagramas', 'clases_dominio');
  expect(result.diagramas).toHaveLength(1);
  expect(result.diagramas[0].codigo_plantuml).toBe(code);
});
