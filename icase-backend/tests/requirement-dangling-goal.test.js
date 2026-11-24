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

test('un criterio puede verificar una regla ligada al RF (reglas_relacionadas), no solo sus necesidades', () => {
  const inv = [
    { id: 'N1', objetivo_id: 'O-01', tipo: 'RF', estado: 'confirmado', necesidad: 'Registrar una venta con productos.' },
    { id: 'N2', tipo: 'regla_negocio', estado: 'confirmado', necesidad: 'Una venta tiene fecha, vendedor y cliente.' }
  ];
  const req = (reglas) => ({ identificador: 'RF-01', tipo: 'RF', nombre: 'Registrar venta', descripcion: 'x', necesidades_origen: ['N1'], reglas_relacionadas: reglas,
    criterios_aceptacion: [{ descripcion: 'Se registra fecha, vendedor y cliente.', necesidades_origen: ['N1', 'N2'] }] });
  const falla = (reglas) => new Coverage().problems({ requerimientos: [req(reglas)] }, inv, '', false).some((text) => /referencias ajenas/.test(text));
  expect(falla(['N2'])).toBe(false);
  expect(falla([])).toBe(true);
});
