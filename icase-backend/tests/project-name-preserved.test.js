const { esNombreProvisional } = require('../src/core/use-cases/ProcesarConIA');

const fuentes = [{ nombre_archivo: 'entrevista_tienda_ventas.txt' }];

test('el nombre derivado del archivo o genérico es provisional y la IA puede proponer otro', () => {
  expect(esNombreProvisional('Entrevista tienda ventas', fuentes)).toBe(true);
  expect(esNombreProvisional('', fuentes)).toBe(true);
  expect(esNombreProvisional('Gestión y Control Operativo', fuentes)).toBe(true);
});

test('un nombre puesto por el usuario no se reemplaza en cada generación', () => {
  expect(esNombreProvisional('Ventas y facturación', fuentes)).toBe(false);
  expect(esNombreProvisional('Gestión de Ventas', fuentes)).toBe(false);
});
