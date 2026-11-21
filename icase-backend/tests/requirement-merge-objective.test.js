const { mergeSameObjective } = require('../src/infrastructure/services/RequirementCoverageService');

const batch = [
  { id: 'N006', tipo: 'RF', objetivo_id: 'O004' },
  { id: 'N007', tipo: 'RF', objetivo_id: 'O004' },
  { id: 'N009', tipo: 'RF', objetivo_id: 'O004' },
  { id: 'N013', tipo: 'RF', objetivo_id: 'O009' }
];
const req = (identificador, nombre, ids, actores) => ({ tipo: 'RF', identificador, nombre, descripcion: `${nombre}.`, actores, necesidades_origen: ids,
  criterios_aceptacion: ids.map(id => ({ descripcion: `Criterio ${id}`, necesidades_origen: [id] })) });

test('los requisitos del mismo objetivo se unen en uno y los de otro objetivo se conservan', () => {
  const drafted = [
    req('RF-06', 'Crear productos', ['N006'], ['Administrador']),
    req('RF-07', 'Editar productos', ['N007'], ['Administrador']),
    req('RF-09', 'Consultar catálogo', ['N009'], ['Vendedor', 'Administrador']),
    req('RF-13', 'Anular ventas', ['N013'], ['Administrador'])
  ];
  const result = drafted.reduce((merged, item) => mergeSameObjective(merged, item, batch), []);
  expect(result.map(item => item.identificador)).toEqual(['RF-06', 'RF-13']);
  expect(result[0].necesidades_origen).toEqual(['N006', 'N007', 'N009']);
  expect(result[0].actores).toEqual(['Administrador', 'Vendedor']);
  expect(result[0].criterios_aceptacion).toHaveLength(3);
});

const { nameCoveredNeeds } = require('../src/infrastructure/services/RequirementCoverageService');
const needs = [
  { id: 'N006', tipo: 'RF', objetivo_id: 'O004', necesidad: 'Crear productos con código, nombre y precio, solo por administrador.' },
  { id: 'N007', tipo: 'RF', objetivo_id: 'O004', necesidad: 'Editar productos existentes, solo por administrador.' },
  { id: 'N009', tipo: 'RF', objetivo_id: 'O004', necesidad: 'Consultar catálogo de productos activos.' },
  { id: 'N004', tipo: 'RF', objetivo_id: 'O003', necesidad: 'Permitir al vendedor consultar el histórico de ventas propias.' },
  { id: 'N005', tipo: 'RF', objetivo_id: 'O003', necesidad: 'Permitir al administrador consultar todas las ventas.' }
];

test('un RF que cubre necesidades con verbos distintos se llama «Gestionar <objeto>»', () => {
  expect(nameCoveredNeeds(req('RF-05', 'Crear productos con atributos básicos', ['N006', 'N007', 'N009'], []), needs).nombre).toBe('Gestionar productos');
});

test('con un mismo verbo, o una sola necesidad, el nombre se conserva', () => {
  expect(nameCoveredNeeds(req('RF-04', 'Consultar histórico de ventas', ['N004', 'N005'], []), needs).nombre).toBe('Consultar histórico de ventas');
  expect(nameCoveredNeeds(req('RF-06', 'Crear productos', ['N006'], []), needs).nombre).toBe('Crear productos');
});
