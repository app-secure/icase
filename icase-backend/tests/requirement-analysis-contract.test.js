const Coverage = require('../src/infrastructure/services/RequirementCoverageService');
const Requirement = require('../src/core/entities/Requerimiento');
const Model = require('../src/infrastructure/database/schemas/RequerimientoSchema');
const Repository = require('../src/interface-adapters/repositories/MongoRequerimientoRepository');
const Changes = require('../src/core/services/RequirementChangeService');
const Proposal = require('../src/core/services/CodePlanningProposalService');
const ModelosIaService = require('../src/infrastructure/services/ModelosIaService');

const input = 'El operador consulta registros y sus estados. También registra solicitudes. Las contraseñas deben estar protegidas. Usará tabletas. El backend será NestJS. El total se calcula sumando los importes. Falta acordar la frecuencia de respaldo. Si falla se atiende manualmente. Queremos centralizar la operación.';
const need = (id, tipo, necesidad, evidencia, extra = {}) => ({ id, tipo, necesidad, evidencia, estado: 'confirmado', ...extra });
const inventory = [
  need('N-01', 'RF', 'Consultar registros', 'El operador consulta registros y sus estados.', { objetivo_id: 'O-01' }),
  need('N-02', 'RF', 'Mostrar el estado consultado', 'consulta registros y sus estados.', { objetivo_id: 'O-01' }),
  need('N-03', 'RF', 'Registrar solicitudes', 'También registra solicitudes.', { objetivo_id: 'O-02' }),
  need('N-04', 'RNF', 'Protección de contraseñas', 'Las contraseñas deben estar protegidas.', { objetivo_id: 'O-03' }),
  need('N-05', 'restriccion_tecnica', 'Operación en tabletas', 'Usará tabletas.'),
  need('N-06', 'restriccion_tecnica', 'Backend NestJS', 'El backend será NestJS.'),
  need('N-07', 'regla_negocio', 'Sumar importes', 'El total se calcula sumando los importes.'),
  need('N-08', 'pregunta', 'Confirmar frecuencia de respaldo', 'Falta acordar la frecuencia de respaldo.', { estado: 'pendiente' }),
  need('N-09', 'decision', 'Atención manual externa', 'Si falla se atiende manualmente.'),
  need('N-10', 'contexto', 'Centralizar operación', 'Queremos centralizar la operación.')
];
const requirement = (id, refs, tipo = 'RF') => ({ identificador: id, tipo, nombre: 'Objetivo', descripcion: 'El sistema DEBE cumplir el objetivo solicitado.',
  evidencia: inventory.find((item) => item.id === refs[0]).evidencia, necesidades_origen: refs,
  criterios_aceptacion: refs.map((ref) => ({ descripcion: inventory.find((item) => item.id === ref).necesidad, necesidades_origen: [ref] })) });
const requirements = [requirement('RF-01', ['N-01', 'N-02']), requirement('RF-03', ['N-03']), requirement('RNF-04', ['N-04'], 'RNF')];
afterEach(() => jest.restoreAllMocks());

test('separa categorías y consolida evidencias del mismo objetivo sin convertir dispositivos en funciones', async () => {
  const request = jest.fn().mockResolvedValueOnce({ inventario_necesidades: inventory }).mockResolvedValueOnce({ requerimientos: requirements });
  const result = await new Coverage().generate({ input, prompt: input, request });
  expect(request).toHaveBeenCalledTimes(2);
  expect(result.requerimientos).toHaveLength(3);
  expect(result.auditoria_requisitos).toMatchObject({ version: 2, estado: 'cobertura_verificada', restricciones_tecnicas: inventory.slice(4, 6), preguntas_pendientes: [inventory[7]] });
  expect(result.auditoria_requisitos.reglas_negocio).toEqual([inventory[6]]);
  expect(result.auditoria_requisitos.contexto).toEqual([inventory[9]]);
});
test('admite varias referencias del mismo objetivo y rechaza objetivos independientes', () => {
  const service = new Coverage();
  expect(service.problems({ requerimientos: requirements }, inventory, input)).toEqual([]);
  expect(service.problems({ requerimientos: [requirement('RF-01', ['N-01', 'N-03'])] }, inventory, input).join(' ')).toContain('objetivo de negocio');
});
test('los detalles consolidados necesitan criterios; una restricción no cuenta como RF', () => {
  const service = new Coverage();
  const problems = service.problems({ requerimientos: [{ ...requirements[0], criterios_aceptacion: requirements[0].criterios_aceptacion.slice(0, 1) }, requirement('RF-05', ['N-05'])] }, inventory, input).join(' ');
  expect(problems).toContain('falta un criterio de aceptación que cubra N-02');
  expect(problems).toContain('Falta N-02');
  expect(problems).toContain('referencia N-05 inexistente o excluida');
  expect(problems).not.toContain('Falta N-08');
});
test('no acepta un RF como cobertura de una cualidad RNF', () => {
  expect(new Coverage().problems({ requerimientos: [requirement('RF-04', ['N-04'])] }, inventory, input).join(' ')).toContain('Falta N-04');
});
test('un objetivo no puede repetirse como requisitos separados', () => {
  expect(new Coverage().problems({ requerimientos: [requirement('RF-01', ['N-01']), requirement('RF-02', ['N-02'])] }, inventory, input).join(' ')).toContain('objetivo duplicado');
});
test('los lotes adaptativos nunca separan las evidencias de un objetivo', async () => {
  const items = Array.from({ length: 8 }, (_, index) => need(`N-${index}`, 'RF', 'Detalle', 'También registra solicitudes.', { objetivo_id: 'O-unico' }));
  const req = { ...requirements[1], necesidades_origen: items.map((item) => item.id), criterios_aceptacion: items.map((item) => ({ descripcion: 'Detalle', necesidades_origen: [item.id] })) };
  const request = jest.fn().mockResolvedValueOnce({ inventario_necesidades: items }).mockResolvedValueOnce({ requerimientos: [req] });
  const result = await new Coverage().generate({ input, prompt: input, request });
  expect(request).toHaveBeenCalledTimes(2);
  expect(result.auditoria_requisitos.estado).toBe('cobertura_verificada');
});
test('entidad, esquema y repositorio conservan criterios y reglas; documentos antiguos siguen siendo válidos', async () => {
  const entity = new Requirement({ ...requirements[0], proyecto_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', reglas_relacionadas: ['N-07'] });
  const document = new Model(entity);
  expect(document.validateSync()).toBeUndefined();
  expect(document.toJSON().criterios_aceptacion).toEqual(requirements[0].criterios_aceptacion);
  const insert = jest.spyOn(Model, 'insertMany').mockResolvedValue([]);
  await new Repository().crearMuchos([entity]);
  expect(insert.mock.calls[0][0][0]).toMatchObject({ criterios_aceptacion: requirements[0].criterios_aceptacion, reglas_relacionadas: ['N-07'] });
  expect(new Requirement({ nombre: 'Anterior' }).criterios_aceptacion).toEqual([]);
});
test('cambiar un criterio invalida los derivados y el orden no produce diferencias falsas', () => {
  const changes = new Changes({});
  const next = { ...requirements[0], criterios_aceptacion: [...requirements[0].criterios_aceptacion].reverse() };
  expect(changes.changed([requirements[0]], [next])).toBe(false);
  expect(changes.changed([requirements[0]], [{ ...next, criterios_aceptacion: [{ descripcion: 'Cambio', necesidades_origen: ['N-01'] }] }])).toBe(true);
});
test('las decisiones técnicas confirmadas siguen llegando a la planificación del código', () => {
  const service = new Proposal();
  const result = service.generar({ etapa: 'stack_tecnologico', proyecto: { auditoria_requisitos: { restricciones_tecnicas: [inventory[5]] } }, plan: { etapas: [] } });
  expect(JSON.stringify(result.propuesta)).toContain('NestJS');
  expect(result.evidencias).toContainEqual({ tipo: 'restriccion_tecnica', identificador: 'N-06', nombre: 'Backend NestJS' });
});
test('los criterios llegan a los prompts de diagramas junto con decisiones del propio proyecto', async () => {
  const service = new ModelosIaService();
  service.generarConGemini = jest.fn().mockResolvedValue({ diagramas: [] });
  await service.procesar({ objetivo: 'diagramas', provider: 'gemini', insumo_bruto: input, contexto_proyecto: { requerimientos_aprobados: requirements, analisis_requisitos: { restricciones_tecnicas: [inventory[5]], preguntas_pendientes: [inventory[7]] } } });
  const prompt = service.generarConGemini.mock.calls[0][0];
  expect(prompt).toContain('Mostrar el estado consultado');
  expect(prompt).toContain('Backend NestJS');
  expect(prompt).toContain('Confirmar frecuencia de respaldo');
});
