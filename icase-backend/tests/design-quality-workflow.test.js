const Validator = require('../src/infrastructure/services/PlantUMLValidatorService');
const CrossValidator = require('../src/infrastructure/services/CrossDiagramConsistencyValidatorService');
const Approve = require('../src/core/use-cases/AprobarFase');
const Generate = require('../src/core/use-cases/ProcesarConIA');
const fs = require('fs');
const path = require('path');

const design = `@startuml
top to bottom direction
package "Solicitudes" {
class SolicitudController {
 +registrarSolicitud(dto: SolicitudDTO): Solicitud
}
class OperacionService {
 +registrarSolicitud(dto: SolicitudDTO): Solicitud
}
interface ISolicitudRepository
class SqlSolicitudRepository
class Solicitud {
 +id: String
 +fecha: DateTime
}
class SolicitudDTO {
 +fecha: DateTime
}
}
SolicitudController ..> OperacionService
SqlSolicitudRepository ..|> ISolicitudRepository
note top of SolicitudController : RF-01
@enduml`;
const dependencies = [
  { tipo: 'casos_de_uso', codigo_plantuml: '@startuml\nusecase "Registrar solicitud\\n(RF-01)" as UC1\nusecase "Autorizar expediente\\n(RF-02)" as UC2\n@enduml' },
  { tipo: 'clases_dominio', codigo_plantuml: '@startuml\nclass Solicitud {\n+id: String\n+fecha: DateTime\n}\n@enduml' },
  { tipo: 'arquitectura_software', codigo_plantuml: '@startuml\nContainer(api, "API", "Por definir", "Solicitudes")\n@enduml' }
].map((d, index) => ({ ...d, id: `dep${index}`, aprobado: true, estado: 'aprobado', version: 1 }));

test('reconoce operaciones por métodos de aplicación y no bloquea por otra operación incierta', () => {
  const result = new CrossValidator().validar({ tipo: 'clases_diseno', codigo: design, diagramasDependencia: dependencies });
  expect(result.valido).toBe(true);
  expect(result.metricas.casos_uso_realizados_diseno).toBe(1);
  expect(result.advertencias.join(' ')).toContain('Autorizar expediente');
  expect(result.advertencias.join(' ')).toContain('no demuestra una omisión');
});

test('DTO genéricos y atributos perdidos son avisos específicos, no errores léxicos', () => {
  const code = design.replace('+fecha: DateTime\n}', '+estado: String\n}').replace('@enduml', 'class EntradaDTO {\n+datos: String\n}\nclass SalidaDTO {\n+resultado: String\n}\n@enduml');
  const result = new Validator().validar(code, { tipo: 'clases_diseno', diagramasDependencia: dependencies });
  expect(result.valido).toBe(true);
  expect(result.advertencias.join(' ')).toContain('DTO genéricos');
  expect(result.advertencias.join(' ')).toContain('perdió atributos');
});

test('una advertencia solicita reparación pero no impide aprobar el resultado revisado', async () => {
  const validator = new Validator();
  const stored = [...dependencies, { id: 'design', tipo: 'clases_diseno', codigo_plantuml: design, version: 1, aprobado: false, estado: 'pendiente_revision' }];
  const repository = {
    listarPorProyecto: jest.fn(async () => stored),
    actualizar: jest.fn(async (id, changes) => ({ ...stored.find(d => d.id === id), ...changes }))
  };
  const generator = new Generate({ plantumlValidatorService: validator });
  expect(generator._detectarProblemasDiagrama({ diagramas: [stored[3]] }, 'clases_diseno', [], dependencies)).toContain('Autorizar expediente');
  const approval = new Approve({
    proyectoRepository: { obtenerPorId: jest.fn(async () => ({ estado_fase: 'analisis_aprobado' })), actualizarEstadoFase: jest.fn(async () => ({})) },
    requerimientoRepository: { listarPorProyecto: jest.fn(async () => []) },
    diagramaRepository: repository, plantumlValidatorService: validator
  });
  await approval.ejecutar({ proyectoId: 'p', fase: 'diagrama', tipoDiagrama: 'clases_diseno' });
  expect(repository.actualizar).toHaveBeenCalledWith('design', expect.objectContaining({ aprobado: true, estado_calidad: 'advertencia' }));
});

test('prompt genérico pide cobertura y distribución compacta sin recortar ni imponer CRUD por entidad', () => {
  const prompt = fs.readFileSync(path.join(__dirname, '../src/infrastructure/prompts/disenador_clases_diseno.md'), 'utf8');
  expect(prompt).toContain('top to bottom direction');
  expect(prompt).toContain('No recortes atributos');
  expect(prompt).toContain('todos los RF');
  expect(prompt).not.toContain('Reservas/QR, Comandas/KDS');
});

test('la omisión completa de una entidad dispara la reparación inicial', () => {
  const origin = [...dependencies.filter(d => d.tipo !== 'clases_dominio'), {
    tipo: 'clases_dominio', aprobado: true, version: 1,
    codigo_plantuml: 'class Solicitud {\n+id: String\n+fecha: DateTime\n}\nclass Expediente {\n+id: String\n}\nSolicitud -- Expediente'
  }];
  const generator = new Generate({ plantumlValidatorService: new Validator() });
  const problems = generator._detectarProblemasDiagrama({ diagramas: [{ tipo: 'clases_diseno', codigo_plantuml: design }] }, 'clases_diseno', [], origin);
  expect(problems).toContain('entidad aprobada Expediente');
  expect(problems).toContain('relación aprobada Solicitud — Expediente');
});

test('un caso de uso sin dependencias pide revisión sin prohibir funciones puras', () => {
  const result = new Validator().validar(design, { tipo: 'clases_diseno', diagramasDependencia: dependencies });
  const isolated = design.replace('class OperacionService', 'class RegistrarSolicitudUseCase').replace('..> OperacionService', '..> RegistrarSolicitudUseCase');
  const checked = new Validator().validar(isolated, { tipo: 'clases_diseno', diagramasDependencia: dependencies });
  expect(result.valido).toBe(true);
  expect(checked.valido).toBe(true);
  expect(checked.advertencias.join(' ')).toContain('RegistrarSolicitudUseCase no declara dependencias');
  expect(checked.advertencias.join(' ')).toContain('si es pura');
});

test.each(['igual', 'pierde operación', 'vacía'])('la reparación %s no descarta el diseño previo válido ni añade reintentos', async variant => {
  const repaired = variant === 'vacía' ? '' : variant === 'pierde operación'
    ? design.replace('+registrarSolicitud(dto: SolicitudDTO): Solicitud', '+otraOperacion(dto: SolicitudDTO): Solicitud') : design;
  const ai = { procesar: jest.fn()
    .mockResolvedValueOnce({ diagramas: [{ tipo: 'clases_diseno', codigo_plantuml: design }] })
    .mockResolvedValueOnce({ diagramas: [{ tipo: 'clases_diseno', codigo_plantuml: repaired }] }) };
  const saved = [];
  const repository = {
    listarPorProyecto: jest.fn(async () => [...dependencies, ...saved]),
    crearMuchos: jest.fn(async data => { saved.push(...data); }), actualizar: jest.fn(), eliminarPorProyecto: jest.fn()
  };
  const generator = new Generate({
    proyectoRepository: { obtenerPorId: jest.fn(async () => ({ nombre: 'Prueba', estado_fase: 'analisis_aprobado', insumo_bruto: 'Solicitudes y expedientes' })), actualizar: jest.fn(async () => ({})) },
    requerimientoRepository: { listarPorProyecto: jest.fn(async () => [{ tipo: 'RF', identificador: 'RF-01', nombre: 'Registrar solicitud', aprobado: true }]) },
    diagramaRepository: repository, estandarRepository: { obtenerEstandares: jest.fn(async () => []) },
    plantumlValidatorService: new Validator(), aiOrchestratorService: ai
  });
  const previous = process.env.AI_DIAGRAM_REPAIR_RETRIES;
  process.env.AI_DIAGRAM_REPAIR_RETRIES = '1';
  try {
    await generator.ejecutar({ proyectoId: 'p', objetivo: 'diagramas', tipoDiagrama: 'clases_diseno' });
    expect(ai.procesar).toHaveBeenCalledTimes(2);
    expect(ai.procesar.mock.calls[1][0].insumo_adicional).toContain('Autorizar expediente');
    expect(saved[0].codigo_plantuml).toBe(design);
    expect(saved[0].estado_calidad).toBe('advertencia');
    expect(repository.eliminarPorProyecto).not.toHaveBeenCalled();
  } finally {
    if (previous === undefined) delete process.env.AI_DIAGRAM_REPAIR_RETRIES;
    else process.env.AI_DIAGRAM_REPAIR_RETRIES = previous;
  }
});
