const Validator = require('../src/infrastructure/services/PlantUMLValidatorService');
const Merger = require('../src/infrastructure/services/UseCaseRepairMerger');
const Procesar = require('../src/core/use-cases/ProcesarConIA');
const Controller = require('../src/interface-adapters/controllers/ProyectoController');
const requirements = Array.from({ length: 23 }, (_, index) => ({ identificador: `RF-${String(index + 1).padStart(2, '0')}`, tipo: 'RF', nombre: `objetivo${index + 1}`, descripcion: `Cumplir objetivo ${index + 1}`, prioridad: 'Alta', aprobado: true, actores: ['Operador'] }));
const code = ids => `@startuml\nleft to right direction\nactor "Operador" as A\nrectangle "Proyecto" {\n${ids.map((id, i) => `usecase "${id}\\n${requirements.find(item => item.identificador === id).nombre}" as UC${i}`).join('\n')}\n}\n${ids.map((_, i) => `A --> UC${i}`).join('\n')}\n@enduml`;
const before = code(requirements.filter(item => item.identificador !== 'RF-11').map(item => item.identificador));
const after = code(requirements.filter(item => !['RF-14', 'RF-23'].includes(item.identificador)).map(item => item.identificador));

test('el alcance permite más de 14 casos sin rebajar cobertura', () => {
  const result = new Validator().validar(code(requirements.map(item => item.identificador)), { tipo: 'casos_de_uso', requisitos: requirements });
  expect(result.valido).toBe(true);
  expect(result.metricas.casos_uso).toBe(23);
  expect(result.metricas.limite_casos_uso).toBe(27);
  expect(result.metricas.rf_cubiertos).toBe(23);
});

test('conserva RF-14 y RF-23 y añade RF-11 pese a aliases reutilizados por la IA', () => {
  const merged = new Merger().merge(before, after, requirements);
  expect(merged).not.toBeNull();
  const result = new Validator().validar(merged, { tipo: 'casos_de_uso', requisitos: requirements });
  expect(result.valido).toBe(true);
  expect(result.metricas.rf_cubiertos).toBe(23);
  for (const original of before.split('\n').filter(line => /^(usecase|A -->)/.test(line))) expect(merged).toContain(original);
  expect(merged).toContain('UC_RECUPERADO');
});

test('no inventa un caso o relación si la reparación tampoco representa la omisión', () => {
  expect(new Merger().merge(before, before, requirements)).toBeNull();
  expect(new Merger().merge(before, after.replace(/^A --> .*$/gm, ''), requirements)).toBeNull();
});

test('el caso de uso persistido supera una reparación que pierde cobertura sin otra llamada de IA', async () => {
  const stored = [];
  const diagramaRepository = { listarPorProyecto: jest.fn(async () => [...stored]), crearMuchos: jest.fn(async data => { stored.push(...data.map((item, index) => ({ ...item, id: `d-${index}` }))); return stored; }), actualizar: jest.fn(), eliminarPorProyecto: jest.fn() };
  const project = { id: 'p', nombre: 'Proyecto', estado_fase: 'analisis_aprobado', insumo_bruto: 'Operación aprobada' };
  const ai = { procesar: jest.fn().mockResolvedValueOnce({ diagramas: [{ tipo: 'casos_de_uso', codigo_plantuml: before }] }).mockResolvedValueOnce({ diagramas: [{ tipo: 'casos_de_uso', codigo_plantuml: after }] }) };
  const useCase = new Procesar({ proyectoRepository: { obtenerPorId: jest.fn(async () => project), actualizar: jest.fn(async (_id, changes) => ({ ...project, ...changes })) }, requerimientoRepository: { listarPorProyecto: jest.fn(async () => requirements) }, diagramaRepository, estandarRepository: { obtenerEstandares: jest.fn(async () => []) }, aiOrchestratorService: ai, plantumlValidatorService: new Validator() });
  await useCase.ejecutar({ proyectoId: 'p', objetivo: 'diagramas', tipoDiagrama: 'casos_de_uso' });
  expect(ai.procesar).toHaveBeenCalledTimes(2);
  expect(new Validator().validar(stored[0].codigo_plantuml, { tipo: 'casos_de_uso', requisitos: requirements }).valido).toBe(true);
});

test('responde 202 antes de iniciar IA y captura rechazo del trabajador en segundo plano', async () => {
  const controller = new Controller({ trabajoGeneracionRepository: { crearORecuperarActivoDiagrama: jest.fn().mockResolvedValue({ creado: true, trabajo: { id: 'job' } }) } });
  controller._ejecutarTrabajoDiagrama = jest.fn().mockRejectedValue(new Error('Fallo de persistencia simulado'));
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await controller.iniciarTrabajoDiagrama({ params: { id: 'p' }, body: { tipo_diagrama: 'casos_de_uso' } }, res);
  expect(res.status).toHaveBeenCalledWith(202);
  expect(controller._ejecutarTrabajoDiagrama).not.toHaveBeenCalled();
  await new Promise(resolve => setImmediate(resolve));
  expect(controller._ejecutarTrabajoDiagrama).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalled();
  log.mockRestore();
});
