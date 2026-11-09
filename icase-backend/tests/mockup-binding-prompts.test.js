const fs = require('node:fs');
const path = require('node:path');
const GenerarMockups = require('../src/core/use-cases/GenerarMockups');
const MockupBindingService = require('../src/infrastructure/services/MockupBindingService');
const MockupIaService = require('../src/infrastructure/services/MockupIaService');

const prompts = path.join(__dirname, '../src/infrastructure/prompts');
const read = (name) => fs.readFileSync(path.join(prompts, name), 'utf8');
const requerimientos = [
  { identificador: 'RF-01', nombre: 'Gestionar salas', tipo: 'RF', aprobado: true, descripcion: 'Registrar salas' },
  { identificador: 'RF-02', nombre: 'Consultar reportes', tipo: 'RF', aprobado: true, descripcion: 'Ver reportes' },
  { identificador: 'RNF-01', nombre: 'Rendimiento', tipo: 'RNF', aprobado: true }
];
const diagram = {
  tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false,
  codigo_plantuml: '@startuml\nclass Sala {\n  String nombre\n  Integer capacidad\n}\n@enduml'
};

describe('el prompt de mockups pide los enlaces data-accion', () => {
  test.each(['disenador_mockups_compacto.md', 'disenador_mockups.md'])('%s explica el contrato de enlaces', (file) => {
    const text = read(file);
    expect(text).toContain('data-accion="RF-xx.verbo"');
    expect(text).toContain('data-accion="ui"');
    expect(text).toContain('OPERACIONES DISPONIBLES');
  });

  test('el prompt completo lo incluye en el ejemplo de formulario y en la lista de comprobación', () => {
    const text = read('disenador_mockups.md');
    expect(text).toMatch(/<button type="submit"[^>]*data-accion="RF-xx\.crear"/);
    expect(text.slice(text.indexOf('## Checklist antes de responder'))).toContain('data-accion');
  });

  test('el prompt inline de Groq también lo menciona', () => {
    const prompt = new MockupIaService()._construirPromptCompactoGroq('contexto', ['salas'], '');
    expect(prompt).toContain('data-accion');
  });
});

describe('contexto de operaciones disponibles', () => {
  const service = new MockupBindingService();

  test('lista cada RF con los campos reales de su entidad y sin campos de solo lectura', () => {
    const contrato = service.contrato({ requerimientos, diagramas: [diagram] });
    const text = service.describirOperaciones({ requerimientos, contrato, max: 20 });
    expect(text).toContain('[RF-01]');
    expect(text).toContain('nombre, capacidad');
    expect(text).not.toContain('RNF-01');
    expect(text).not.toMatch(/\bid\b/);
  });

  test('un RF sin entidad en el modelo indica que no hay campos definidos en lugar de inventarlos', () => {
    const contrato = service.contrato({ requerimientos, diagramas: [diagram] });
    expect(service.describirOperaciones({ requerimientos, contrato, max: 20 })).toMatch(/\[RF-02\][^\n]*sin campos definidos/);
  });

  test('respeta el máximo de RF', () => {
    const contrato = service.contrato({ requerimientos, diagramas: [diagram] });
    expect(service.describirOperaciones({ requerimientos, contrato, max: 1 }).split('\n').filter((line) => line.startsWith('- [')).length).toBe(1);
  });

  test('sin contrato devuelve cadena vacía', () => {
    expect(service.describirOperaciones({ requerimientos, contrato: null, max: 20 })).toBe('');
  });

  test('el contexto del prompt incluye el bloque antes de los requerimientos funcionales', () => {
    const context = new GenerarMockups({})._construirContexto(requerimientos, [diagram], { nombre: 'Salas' });
    expect(context).toContain('OPERACIONES DISPONIBLES');
    expect(context.indexOf('OPERACIONES DISPONIBLES')).toBeLessThan(context.indexOf('REQUERIMIENTOS FUNCIONALES'));
    expect(context).toContain('nombre, capacidad');
  });
});
