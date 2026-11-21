const MockupBindingValidator = require('../src/infrastructure/services/MockupBindingValidator');

const contrato = { operations: [
  { id: 'RF-07', methods: ['GET', 'POST', 'PATCH'], schema: { properties: { nombre: {}, tipo_documento: {}, numero_documento: {}, correo: {}, telefono: {} } } },
  { id: 'RF-04', methods: ['GET'], schema: { properties: { fecha: {} } } },
  { id: 'RF-01', methods: ['GET', 'POST'], schema: { properties: { cliente_id: {}, medio_pago: {} } } }
] };
const requerimientos = ['RF-01', 'RF-04', 'RF-07'].map((identificador) => ({ tipo: 'RF', identificador, aprobado: true }));
const html = `<main><h1>Registro de cliente</h1><form data-accion="ui">
<input name="nombre"><select name="tipo_documento"><option>DNI</option></select><input name="numero_documento"><input name="correo"><input name="telefono">
<button type="button" data-accion="ui">Cancelar</button><button type="submit" data-accion="ui">Registrar</button></form></main>`;

test('un formulario de alta en «ui» se liga a la operación que comparte más campos', () => {
  const result = new MockupBindingValidator().enlazarFormularioPrincipal(html, { verbo: 'crear', rfs: ['RF-01', 'RF-04', 'RF-07'], requerimientos, contrato });
  expect(result.enlazado).toBe('RF-07.crear');
  expect(result.html).toMatch(/<form data-accion="RF-07\.crear"/);
  expect(result.html).toMatch(/data-accion="RF-07\.crear">Registrar/);
  expect(result.html).toMatch(/data-accion="ui">Cancelar/);
});

test('sin operación con ese método o sin campos en común no se adivina', () => {
  expect(new MockupBindingValidator().enlazarFormularioPrincipal(html, { verbo: 'crear', rfs: ['RF-04'], requerimientos, contrato }).enlazado).toBeNull();
});

test('un formulario ya enlazado no se toca', () => {
  const bound = html.replace('<form data-accion="ui">', '<form data-accion="RF-07.crear">');
  expect(new MockupBindingValidator().enlazarFormularioPrincipal(bound, { verbo: 'crear', rfs: ['RF-07'], requerimientos, contrato }).enlazado).toBeNull();
});
