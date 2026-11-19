const MockupScreenRole = require('../src/core/services/MockupScreenRole');
const MockupContentLint = require('../src/infrastructure/services/MockupContentLint');

const tree = [
  { slug: 'registrar-pedido-web', nombre: 'Registrar Pedido', tipo: 'list', rf_trazabilidad: ['RF-15'] },
  { slug: 'formulario-de-pedido', nombre: 'Formulario de Pedido', tipo: 'form', rf_trazabilidad: ['RF-15', 'RF-17'] },
  { slug: 'cobros', nombre: 'Cobros', tipo: 'list', rf_trazabilidad: ['RF-16'] },
  { slug: 'formulario-de-cobro', nombre: 'Formulario de Cobro', tipo: 'form', rf_trazabilidad: ['RF-16'] },
  { slug: 'registrar-cobro-rapido', nombre: 'Registrar Merma', tipo: 'list', rf_trazabilidad: ['RF-30'] }
];
const role = (slug) => MockupScreenRole.of(tree.find((item) => item.slug === slug), tree);

describe('papel de cada pantalla', () => {
  test('«Registrar pedido» junto a «Formulario de pedido» es el listado de entrada, y apunta a su formulario', () => {
    expect(role('registrar-pedido-web')).toEqual({ tipo: 'list', formularioHermano: 'Formulario de Pedido' });
    expect(role('formulario-de-pedido')).toEqual({ tipo: 'form', formularioHermano: null });
  });

  test('un listado con formulario hermano lo conoce; sin hermano, un nombre con verbo es un formulario', () => {
    expect(role('cobros')).toEqual({ tipo: 'list', formularioHermano: 'Formulario de Cobro' });
    expect(role('registrar-cobro-rapido')).toEqual({ tipo: 'form', formularioHermano: null });
  });
});

describe('linter: una pantalla hace una sola cosa', () => {
  const lint = (body, papel) => new MockupContentLint().revisar(`<html><body><main>${body}</main></body></html>`, [], { papel });
  const form = '<form data-accion="RF-15.crear"><input name="a"><input name="b"><select name="c"></select><button>Guardar</button></form>';
  const table = '<table><tbody><tr><td>1</td></tr><tr><td>2</td></tr><tr><td>3</td></tr></tbody></table>';

  test('un formulario con listado se rechaza con el motivo', () => {
    expect(lint(form + table, { tipo: 'form', formularioHermano: null }).some((item) => /pantalla de formulario y trae una tabla/.test(item))).toBe(true);
    expect(lint(form, { tipo: 'form', formularioHermano: null })).toEqual([]);
  });

  test('un listado con formulario hermano que repite el formulario completo se rechaza; sin hermano o con filtros, no', () => {
    expect(lint(form + table, { tipo: 'list', formularioHermano: 'Formulario de Pedido' }).some((item) => /Formulario de Pedido/.test(item))).toBe(true);
    expect(lint(form + table, { tipo: 'list', formularioHermano: null })).toEqual([]);
    const filtro = '<form data-accion="RF-15.consultar"><select name="mesa_id"></select><button>Buscar</button></form>';
    expect(lint(filtro + table, { tipo: 'list', formularioHermano: 'Formulario de Pedido' })).toEqual([]);
  });
});
