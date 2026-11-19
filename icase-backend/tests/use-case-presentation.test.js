const { reviewUseCasePresentation: review } = require('../src/infrastructure/services/UseCasePresentationReview');
const Validator = require('../src/infrastructure/services/PlantUMLValidatorService');
const Modelos = require('../src/infrastructure/services/ModelosIaService');
const AprobarFase = require('../src/core/use-cases/AprobarFase');

const requirements = Array.from({ length: 19 }, (_, i) => ({
  identificador: `RF-${String(i + 1).padStart(2, '0')}`, tipo: 'RF',
  nombre: `Consultar recurso ${i + 1}`, prioridad: 'Alta', aprobado: true, actores: ['Operador']
}));
const cases = requirements.map((r, i) => `usecase "Consultar recurso ${i + 1}\\n[${r.identificador}]" as UC${i}`);
const wrap = body => `@startuml\nleft to right direction\nactor "Operador" as A\n${body}\n${cases.map((_, i) => `A --> UC${i}`).join('\n')}\n@enduml`;
const grouped = wrap(`rectangle "Proyecto" {\npackage "Consultas" {\n${cases.slice(0, 10).join('\n')}\n}\npackage "Seguimiento" {\n${cases.slice(10).join('\n')}\n}\n}`);

test('el prompt efectivo pide módulos internos y verbos, sin fijar módulos de un sector', () => {
  const model = new Modelos({ env: {} });
  const prompt = model.construirPrompt({ objetivo: 'diagramas', tipoDiagrama: 'casos_de_uso' });
  expect(prompt).toContain('DENTRO del único límite del sistema');
  expect(prompt).toContain('verbo en infinitivo y un objeto concreto');
  expect(prompt).toContain('ni crees un paquete por RF o por actor');
  expect(prompt).toContain('conserva todos los casos, sus alias, referencias RF');
  expect(prompt).not.toMatch(/Restaurante|Cocina|Cajero/);
  const other = model.construirPrompt({ objetivo: 'diagramas', tipoDiagrama: 'arquitectura_sistema' });
  expect(other).not.toContain('NOMBRES DE ACCIÓN');
});

test('19 casos agrupados conservan cobertura y no generan advertencia de módulos', () => {
  const result = new Validator().validar(grouped, { tipo: 'casos_de_uso', requisitos: requirements });
  expect(result.valido).toBe(true);
  expect(result.metricas).toMatchObject({ casos_uso: 19, rf_cubiertos: 19, modulos_casos_uso: 2 });
  expect(result.advertencias.join(' ')).not.toMatch(/vista es extensa|Nombres por revisar|fuera del límite/);
});

test('el diagrama plano se conserva válido con una advertencia, sin reducir cobertura', () => {
  const flat = wrap(`rectangle "Proyecto" {\n${cases.join('\n')}\n}`);
  const result = new Validator().validar(flat, { tipo: 'casos_de_uso', requisitos: requirements });
  expect(result.valido).toBe(true);
  expect(result.metricas.rf_cubiertos).toBe(19);
  expect(result.advertencias.join(' ')).toContain('dentro del límite del sistema');
});

test('dos paquetes vacíos o fuera del sistema no acreditan agrupación interna', () => {
  const flat = `rectangle "Proyecto" {\n${cases.join('\n')}\n}\npackage "Vacío 1" {}\npackage "Vacío 2" {}`;
  expect(review(wrap(flat), 19).metricas.modulos_casos_uso).toBe(0);
  expect(review(wrap(flat), 19).advertencias.join(' ')).toContain('vista es extensa');
});

test('detecta casos sin agrupar aunque existan dos módulos internos', () => {
  const result = review(grouped.replace(cases[0], '').replace('\n@enduml', `\n${cases[0]}\n@enduml`), 19);
  expect(result.advertencias.join(' ')).toContain('fuera del límite');
  expect(result.advertencias.join(' ')).toContain('vista es extensa');
});

test('nombres nominales producen observaciones sin renombrar ni invalidar', () => {
  const code = grouped.replace('Consultar recurso 1\\n', 'Gestión de recursos\\n');
  const result = new Validator().validar(code, { tipo: 'casos_de_uso', requisitos: requirements });
  expect(result.valido).toBe(true);
  expect(result.metricas.rf_cubiertos).toBe(19);
  expect(result.advertencias.join(' ')).toContain('Gestión de recursos');
  expect(result.advertencias.join(' ')).toContain('señal orientativa');
  expect(code).toContain('Gestión de recursos\\n[RF-01]');
});

test('admite infinitivos, alias inversos y diagramas pequeños sin exigir módulos', () => {
  const code = '@startuml\nactor Usuario\nrectangle Proyecto {\nusecase UC1 as "Cerrar caja"\nusecase "Gestionar usuarios" as UC2\n}\nUsuario --> UC1\nUsuario --> UC2\n@enduml';
  expect(review(code, 2).advertencias).toEqual([]);
  expect(review(code.replace('Cerrar caja', 'Cierre de caja'), 2).advertencias.join(' ')).toContain('Cierre de caja');
});

test('no interpreta bloques dentro de etiquetas o comentarios como módulos', () => {
  const code = grouped.replace('package "Consultas"', 'package "Consultas {package}"')
    .replace('@startuml', '@startuml\n\' package Falso { usecase "Gestión falsa" }\n/\' package Otro {} \'/');
  expect(review(code, 19).metricas.modulos_casos_uso).toBe(2);
  expect(review(code, 19).advertencias).toEqual([]);
});

test('acepta un paquete raíz heredado como límite del sistema', () => {
  expect(review(grouped.replace('rectangle "Proyecto"', 'package "Proyecto"'), 19).advertencias).toEqual([]);
});

test('la aprobación conserva código y cobertura aunque haya advertencias de presentación', async () => {
  const code = wrap(`rectangle "Proyecto" {\n${cases.join('\n')}\n}`)
    .replace('Consultar recurso 1\\n', 'Gestión de recursos\\n');
  const diagram = { id: 'd', tipo: 'casos_de_uso', codigo_plantuml: code, version: 1, estado: 'pendiente_revision' };
  const diagrams = {
    listarPorProyecto: jest.fn(async () => [diagram]),
    actualizar: jest.fn(async (id, changes) => ({ ...diagram, ...changes, id }))
  };
  const useCase = new AprobarFase({
    proyectoRepository: {
      obtenerPorId: jest.fn(async () => ({ id: 'p', estado_fase: 'analisis_aprobado' })),
      actualizarEstadoFase: jest.fn(async (id, estado_fase) => ({ id, estado_fase }))
    },
    requerimientoRepository: { listarPorProyecto: jest.fn(async () => requirements) },
    diagramaRepository: diagrams, plantumlValidatorService: new Validator()
  });
  const result = await useCase.ejecutar({ proyectoId: 'p', fase: 'diagrama', tipoDiagrama: 'casos_de_uso' });
  expect(result.diagrama).toMatchObject({ aprobado: true, codigo_plantuml: code, estado_calidad: 'advertencia' });
  expect(result.diagrama.metricas_validacion.rf_cubiertos).toBe(19);
  expect(result.diagrama.advertencias_validacion.join(' ')).toContain('Gestión de recursos');
});
