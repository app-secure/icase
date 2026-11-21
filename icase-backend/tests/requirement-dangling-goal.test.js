const fs = require('node:fs');
const path = require('node:path');
const Coverage = require('../src/infrastructure/services/RequirementCoverageService');

const input = fs.readFileSync(path.join(__dirname, '../../docs/pruebas/ventas/entrevista_tienda_ventas.txt'), 'utf8');
const inventory = [
  { id: 'N-09', objetivo_id: 'O-09', tipo: 'RF', estado: 'confirmado', necesidad: 'Consultar las ventas registradas por el vendedor.', evidencia: 'Solo ve las ventas que él mismo registró.' },
  { id: 'N-04', tipo: 'regla_negocio', estado: 'confirmado', objetivos_relacionados: ['O-04'], necesidad: 'El vendedor solo ve las ventas que él mismo registró.', evidencia: 'Solo ve las ventas que él mismo registró.' },
  { id: 'N-03', tipo: 'regla_negocio', estado: 'confirmado', objetivos_relacionados: ['O-01', 'O-09'], necesidad: 'Existen dos roles en el sistema: administrador y vendedor.', evidencia: 'Entonces habrá dos roles: administrador y vendedor.' }
];

test('una regla con evidencia válida no se rechaza por citar un objetivo inexistente', () => {
  const report = new Coverage().inspectInventory(structuredClone(inventory), input, true);
  expect(report.invalid.map(item => item.id)).toEqual([]);
  const rule = report.valid.find(item => item.id === 'N-04');
  expect(rule.objetivos_relacionados).toEqual(['O-09']);
  expect(report.valid.find(item => item.id === 'N-03').objetivos_relacionados).toEqual(['O-09']);
});
