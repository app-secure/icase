const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { transformSync } = require('esbuild');
const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname, '../../icase-frontend/src/utils/projectState.js'), 'utf8'), { format: 'cjs' }).code, sandbox);
const { upsertProject } = sandbox.module.exports;
const a = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Restaurante' };
const b = { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'GourmetFlow' };

test('abrir otro proyecto no reemplaza el que estaba activo', () => {
  const result = upsertProject([a, b], { ...b, currentPhase: 2 }, a.id);
  expect(result).toHaveLength(2);
  expect(result[0]).toEqual(a);
  expect(result[1]).toMatchObject({ ...b, currentPhase: 2 });
});
test('alternar y actualizar repetidamente conserva ambos proyectos', () => {
  let result = [a, b];
  for (let i = 0; i < 20; i++) {
    result = upsertProject(result, { ...a, currentPhase: i }, b.id);
    result = upsertProject(result, { ...b, currentPhase: i }, a.id);
  }
  expect(result.map(p => p.id)).toEqual([a.id, b.id]);
});
test('la persistencia reemplaza exclusivamente al borrador indicado', () => {
  const result = upsertProject([a, { id: 'draft-1', sources: ['source'] }], b, 'draft-1');
  expect(result).toHaveLength(2);
  expect(result[0]).toEqual(a);
  expect(result[1]).toMatchObject({ id: b.id, sources: ['source'] });
});
test('elimina duplicados del mismo ID, sin combinar nombres iguales de distintos IDs', () => {
  const result = upsertProject([a, b, { ...a }], a, b.id);
  expect(result).toHaveLength(2);
  const sameName = upsertProject(result, { ...b, name: a.name }, a.id);
  expect(sameName).toHaveLength(2);
});
