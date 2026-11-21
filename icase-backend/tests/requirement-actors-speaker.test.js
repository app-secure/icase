const fs = require('node:fs');
const path = require('node:path');
const { normalizeActors } = require('../src/core/services/RequirementActors');

const input = fs.readFileSync(path.join(__dirname, '../../docs/pruebas/ventas/entrevista_tienda_ventas.txt'), 'utf8');
const actor = (nombre, extra = {}) => ({ nombre, origen: 'explicito', estado: 'confirmado', tipo: 'persona', evidencias: [], ...extra });

test('quien habla y además usa el sistema se conserva con el nombre de su rol', () => {
  const actors = normalizeActors([actor('Dueña', { alias: ['Administradora'], descripcion: 'Gestiona productos, usuarios, anula ventas y revisa reportes.' }), actor('Vendedor')], input);
  expect(actors.map(item => item.nombre)).toEqual(['Administradora', 'Vendedor']);
});

test('sin alias, el rol de su descripción permite conservar al actor', () => {
  const actors = normalizeActors([actor('Dueña', { descripcion: 'Como administradora gestiona productos y anula ventas.' })], input);
  expect(actors.map(item => item.nombre)).toEqual(['Administradora']);
});

test('un rótulo de turno sin rol en el sistema se sigue descartando', () => {
  expect(normalizeActors([actor('Analista', { descripcion: 'Conduce la entrevista.' })], input)).toEqual([]);
});
