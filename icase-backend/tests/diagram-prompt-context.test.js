const { selectAnalysis, diagramDirectives } = require('../src/infrastructure/services/DiagramPromptContext');
const { contextOf } = require('../src/core/services/RequirementAnalysisContext');
const fs = require('fs');
const path = require('path');

test('incluye contexto clasificado sin evidencia ni metadatos de auditoría', () => {
  const analysis = contextOf({ inventario: [{ id: 'N1', tipo: 'contexto', necesidad: 'Tabletas para operadores', estado: 'confirmado', evidencias: ['privado'] }] }, { includeContext: true });
  expect(analysis.contexto[0].necesidad).toContain('Tabletas');
  expect(JSON.stringify(analysis)).not.toContain('privado');
});

test('navegación omite detalles de infraestructura sin perder restricciones, exclusiones ni dudas', () => {
  const analysis = { contexto: [{ id: 'a', necesidad: 'Backup en servidor' }, { id: 'b', necesidad: 'Tabletas para operadores' }],
    restricciones_tecnicas: [{ id: 'c', necesidad: 'Backend NestJS en servidor' }],
    decisiones: [{ id: 'd', necesidad: 'Sin réplicas', estado: 'fuera_de_alcance' }], preguntas_pendientes: [{ id: 'e', necesidad: '¿Frecuencia de backup?' }] };
  const selected = selectAnalysis(analysis, 'arbol_navegacion');
  expect(selected.contexto.map(item => item.id)).toEqual(['b']);
  expect(selected.restricciones_tecnicas).toHaveLength(1);
  expect(selected.decisiones[0].estado).toBe('fuera_de_alcance');
  expect(selected.preguntas_pendientes).toHaveLength(1);
  expect(selectAnalysis(analysis, 'arquitectura_sistema').contexto).toHaveLength(2);
});

test('las instrucciones de cada diagrama no incluyen reglas exclusivas de otras vistas', () => {
  const text = fs.readFileSync(path.join(__dirname, '../src/infrastructure/prompts/disenador_arquitectura.md'), 'utf8');
  const software = diagramDirectives(text, 'arquitectura_software');
  expect(software).toContain('C4_Container');
  expect(software).not.toContain('C4_Deployment');
  expect(software).not.toContain('@startwbs');
  expect(software).toContain('STACK TECNOLÓGICO');
  expect(diagramDirectives(text, 'arbol_navegacion')).not.toContain('classAttributeIconSize');
});

test('más de veinte clases de diseño no se rechazan por tamaño', () => {
  const Validator = require('../src/infrastructure/services/PlantUMLValidatorService');
  const code = '@startuml\npackage Aplicacion {\nclass EntradaController\nclass OperarUseCase\nclass DatosDTO\ninterface IRegistroRepository\nclass SqlRegistroRepository\n' +
    Array.from({ length: 21 }, (_, i) => `class Entidad${i}`).join('\n') +
    '\nEntradaController --> OperarUseCase\nSqlRegistroRepository ..|> IRegistroRepository\n}\n@enduml';
  const result = new Validator().validar(code, { tipo: 'clases_diseno' });
  expect(result.errores.join(' ')).not.toMatch(/entre 3 y 20/);
  expect(result.advertencias.join(' ')).toContain('Diagrama extenso');
});
