const ApplicationSpecService = require('../src/infrastructure/services/ApplicationSpecService');
const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');

const PLANTUML = `@startuml
class Plato {
  +String id
  +String nombre
  +float precio
  +boolean disponible
}
@enduml`;
const dominio = { tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false, codigo_plantuml: PLANTUML };
const rf = [
  { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Menú digital', descripcion: 'El cliente ve el menú.', actores: ['Cliente'] },
  { aprobado: true, tipo: 'RF', identificador: 'RF-07', nombre: 'Disponibilidad de platos', descripcion: 'La cocina marca platos agotados.', actores: ['Cocinero'] }
];
const modelo = new DomainModelExtractor().fromDiagrams([dominio]);
const pantallas = [
  { pantalla_id: 'menu', roles: ['Cliente'], rf_trazabilidad: ['RF-01'] },
  { pantalla_id: 'disponibilidad', roles: ['Personal de Cocina'], rf_trazabilidad: ['RF-07'] }
];
const operaciones = [
  { nombre: 'listarMenuDigital', rf: 'RF-01', tipo: 'consulta', entidad: 'Plato', actores: ['Cliente'], estado_decision: 'confirmado', origen: 'ia', filtros: [], salida: ['nombre', 'precio'] },
  { nombre: 'actualizarPlato', rf: 'RF-07', tipo: 'actualizar', entidad: 'Plato', actores: ['Cocinero'], estado_decision: 'confirmado', origen: 'derivado', entradas: ['disponible'] }
];
const guardada = {
  operaciones,
  pantallas: [
    { id: 'menu', componentes: [{ tipo: 'tabla', operacion: 'listarMenuDigital', campos: ['nombre', 'precio'], acciones: [{ etiqueta: 'Editar', operacion: 'actualizarPlato' }] }] },
    { id: 'disponibilidad', componentes: [{ tipo: 'tabla', operacion: 'listarMenuDigital', campos: ['nombre', 'disponible'], acciones: [] }] }
  ]
};

describe('lista propia para la pantalla del rol que edita', () => {
  const resultado = new ApplicationSpecService({}).validar(guardada, { modelo, rf, pantallas });

  test('la pantalla de la cocina deja de leer la lista del cliente y gana la suya, con «Editar»', () => {
    expect(resultado.errores).toEqual([]);
    const lista = resultado.operaciones.find((op) => op.nombre === 'listarPlatoGestion');
    expect(lista).toMatchObject({ tipo: 'consulta', rf: 'RF-07', actores: ['Cocinero'], estado_decision: 'confirmado', origen: 'derivado' });
    const pantalla = resultado.pantallas.find((item) => item.id === 'disponibilidad');
    expect(pantalla.componentes[0]).toMatchObject({ operacion: 'listarPlatoGestion', acciones: [{ etiqueta: 'Editar', operacion: 'actualizarPlato' }] });
  });

  test('el «Editar» que estaba en la pantalla del cliente se retira', () => {
    const menu = resultado.pantallas.find((item) => item.id === 'menu');
    expect(menu.componentes[0].acciones).toEqual([]);
  });

  test('es idempotente: revalidar el resultado no añade otra lista', () => {
    const otra = new ApplicationSpecService({}).validar({ operaciones: resultado.operaciones, pantallas: resultado.pantallas }, { modelo, rf, pantallas });
    expect(otra.operaciones.filter((op) => op.nombre.startsWith('listarPlatoGestion'))).toHaveLength(1);
  });

  test('al generar (sin árbol de pantallas) no se añade nada', () => {
    const sin = new ApplicationSpecService({}).validar(guardada, { modelo, rf, cablear: false });
    expect(sin.operaciones.map((op) => op.nombre)).toEqual(['listarMenuDigital', 'actualizarPlato']);
  });
});
