const MockupBindingValidator = require('../src/infrastructure/services/MockupBindingValidator');

const html = `<html><body><main>
<form data-accion="RF-08.crear"><input name="monto"><button type="submit" data-accion="RF-08.crear">Cerrar</button></form>
<button>Registrar</button>
<button class="x">Guardar</button>
<button hidden>Oculto</button>
</main></body></html>`;
const rfs = [{ identificador: 'RF-08', tipo: 'RF', aprobado: true }];

describe('marcar controles sin enlace como solo interfaz', () => {
  test('añade data-accion="ui" solo a los botones sin enlace y deja de haber advertencias', () => {
    const validator = new MockupBindingValidator();
    expect(validator.validar({ html, requerimientos: rfs }).advertencias).toEqual(['sin enlace: Registrar', 'sin enlace: Guardar']);
    const { html: nuevo, marcados } = validator.marcarSinEnlace(html);
    expect(marcados).toEqual(['Registrar', 'Guardar']);
    expect(nuevo).toContain('<button data-accion="ui">Registrar</button>');
    expect(nuevo).toContain('<button data-accion="ui" class="x">Guardar</button>');
    expect(nuevo).toContain('<button hidden>Oculto</button>');
    const despues = validator.validar({ html: nuevo, requerimientos: rfs });
    expect(despues.advertencias).toEqual([]);
    expect(despues.enlaces.filter((item) => item.estado === 'ui')).toHaveLength(2);
  });

  test('con una lista de controles solo marca esos', () => {
    const { html: nuevo, marcados } = new MockupBindingValidator().marcarSinEnlace(html, { controles: ['guardar'] });
    expect(marcados).toEqual(['Guardar']);
    expect(nuevo).toContain('<button>Registrar</button>');
  });
});

describe('enlazar controles sin enlace a la operación de la pantalla', () => {
  const pagina = `<html><body><main><h1>Cierre de caja</h1>
<form><input name="fondoInicial"><input name="efectivoContado"><textarea name="observaciones"></textarea><button type="submit">Registrar</button></form>
</main></body></html>`;
  const contrato = { operations: [{ id: 'RF-08', methods: ['GET', 'POST'], schema: { properties: { fondoInicial: {}, efectivoContado: {}, observaciones: {} } } }] };
  const rf08 = [{ identificador: 'RF-08', tipo: 'RF', aprobado: true }];

  test('«Registrar» en el formulario de cierre de caja se enlaza a RF-08.crear', () => {
    const validator = new MockupBindingValidator();
    const { html: nuevo, enlazados, pendientes } = validator.enlazarSinEnlace(pagina, { rfs: ['RF-08'], requerimientos: rf08, contrato });
    expect(enlazados).toEqual(['Registrar → RF-08.crear']);
    expect(pendientes).toEqual([]);
    expect(nuevo).toContain('<button data-accion="RF-08.crear" type="submit">Registrar</button>');
    const despues = validator.validar({ html: nuevo, requerimientos: rf08, contrato });
    expect(despues.advertencias).toEqual([]);
    expect(despues.enlaces[0]).toMatchObject({ estado: 'valido', rf: 'RF-08', verbo: 'crear', campos: ['fondoInicial', 'efectivoContado', 'observaciones'] });
  });

  test('con dos requisitos y campos que no coinciden con ninguno, no adivina', () => {
    const otros = [...rf08, { identificador: 'RF-09', tipo: 'RF', aprobado: true }];
    const resultado = new MockupBindingValidator().enlazarSinEnlace(pagina.replace(/name="\w+"/g, 'name="otro"'), { rfs: ['RF-08', 'RF-09'], requerimientos: otros, contrato: { operations: [{ id: 'RF-08', schema: { properties: { a: {} } } }, { id: 'RF-09', schema: { properties: { b: {} } } }] } });
    expect(resultado.enlazados).toEqual([]);
    expect(resultado.pendientes).toEqual(['Registrar']);
  });
});
