const ApplicationSpecService = require('../src/infrastructure/services/ApplicationSpecService');
const ApplicationContractBuilder = require('../src/infrastructure/services/ApplicationContractBuilder');
const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');

const PLANTUML = `@startuml
enum EstadoMesa {
  LIBRE
  OCUPADA
}
enum EstadoPlato {
  DISPONIBLE
  AGOTADO
}
class Usuario {
  +String id
  +String email
}
class Mesa {
  +String id
  +int numero
  +EstadoMesa estado
}
class Plato {
  +String id
  +String nombre
  +EstadoPlato estado
}
Usuario "1" --> "0..*" Mesa
@enduml`;

const dominio = { tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false, codigo_plantuml: PLANTUML };
const rf = [
  { aprobado: true, tipo: 'RF', identificador: 'RF-04', nombre: 'Consulta de mesas asignadas', descripcion: 'El mesero consulta sus mesas.', actores: ['Mesero'] },
  { aprobado: true, tipo: 'RF', identificador: 'RF-07', nombre: 'Actualización de disponibilidad de platos', descripcion: 'Marcar un plato como agotado.', actores: ['Cocinero'] },
  { aprobado: true, tipo: 'RF', identificador: 'RF-10', nombre: 'Autenticación de usuarios', descripcion: 'Inicio de sesión.' }
];

const servicio = (propuesta) => new ApplicationSpecService({ modelosIa: { generarJson: jest.fn(async () => propuesta) } });

describe('ApplicationSpecService', () => {
  const buena = {
    operaciones: [
      { nombre: 'listarMesasAsignadas', rf: 'RF-04', tipo: 'consulta', entidad: 'Mesa', actores: ['Mesero'],
        filtros: [{ campo: 'usuario_id', operador: '==', origen: 'sesion', valor: 'usuario.id' }], salida: ['numero', 'estado'] },
      { nombre: 'marcarPlatoAgotado', rf: 'RF-07', tipo: 'transicion', entidad: 'Plato', transicion: { campo: 'estado', de: ['DISPONIBLE'], a: 'AGOTADO' } }
    ],
    pantallas: [{ id: 'mesas-asignadas', componentes: [{ tipo: 'tarjetas', operacion: 'listarMesasAsignadas', campos: ['numero', 'estado', 'noExiste'], acciones: [{ etiqueta: 'Refrescar', operacion: 'listarMesasAsignadas' }, { etiqueta: 'Fantasma', operacion: 'noDefinida' }] }] }]
  };
  const pantallas = [{ pantalla_id: 'mesas-asignadas', nombre: 'Mesas asignadas', rf_trazabilidad: ['RF-04'] }];

  test('acepta operaciones válidas y filtra por la sesión', async () => {
    const { especificacion } = await servicio(buena).inferir({ requerimientos: rf, diagramas: [dominio], pantallas });
    const op = especificacion.operaciones.find((o) => o.nombre === 'listarMesasAsignadas');
    expect(op).toMatchObject({ rf: 'RF-04', tipo: 'consulta', entidad: 'Mesa', origen: 'ia' });
    expect(op.filtros[0]).toMatchObject({ origen: 'sesion', valor: 'usuario.id' });
    expect(especificacion.operaciones.find((o) => o.nombre === 'marcarPlatoAgotado').transicion.a).toBe('AGOTADO');
  });

  test('descarta campos, botones y operaciones inexistentes', async () => {
    const { especificacion, advertencias } = await servicio(buena).inferir({ requerimientos: rf, diagramas: [dominio], pantallas });
    const componente = especificacion.pantallas[0].componentes[0];
    expect(componente.campos).toEqual(['numero', 'estado']);
    expect(componente.acciones).toEqual([{ etiqueta: 'Refrescar', operacion: 'listarMesasAsignadas' }]);
    expect(advertencias.join(' ')).toMatch(/Fantasma/);
  });

  test('rechaza entidad, RF, filtro y transición inválidos', async () => {
    const mala = { operaciones: [
      { nombre: 'a1x', rf: 'RF-99', tipo: 'consulta', entidad: 'Mesa' },
      { nombre: 'listarX', rf: 'RF-04', tipo: 'consulta', entidad: 'Fantasma' },
      { nombre: 'listarY', rf: 'RF-04', tipo: 'consulta', entidad: 'Mesa', filtros: [{ campo: 'zzz', origen: 'sesion', valor: 'usuario.id' }] },
      { nombre: 'listarZ', rf: 'RF-04', tipo: 'consulta', entidad: 'Mesa', filtros: [{ campo: 'estado', origen: 'sesion', valor: 'usuario.password' }] },
      { nombre: 'cambiarW', rf: 'RF-07', tipo: 'transicion', entidad: 'Plato', transicion: { campo: 'nombre', a: 'X' } },
      { nombre: 'crearV', rf: 'RF-07', tipo: 'crear', entidad: 'Plato' }
    ] };
    const { especificacion, advertencias } = await servicio(mala).inferir({ requerimientos: rf, diagramas: [dominio] });
    expect(especificacion.operaciones.every((o) => o.origen === 'derivado')).toBe(true);
    expect(advertencias.filter((a) => a.startsWith('Se descartó la operación')).length).toBe(6);
  });

  test('deriva una operación básica por RF cuando la IA no responde y omite el acceso', async () => {
    const { especificacion, advertencias } = await servicio(null).inferir({ requerimientos: rf, diagramas: [dominio] });
    expect(especificacion.operaciones.map((o) => o.rf)).toEqual(['RF-04', 'RF-07']);
    expect(especificacion.operaciones[0]).toMatchObject({ tipo: 'consulta', entidad: 'Mesa', origen: 'derivado' });
    expect(advertencias.join(' ')).toMatch(/derivó/);
  });

  test('sin dominio aprobado no hay especificación', async () => {
    const { especificacion, advertencias } = await servicio(buena).inferir({ requerimientos: rf, diagramas: [] });
    expect(especificacion).toBeNull();
    expect(advertencias[0]).toMatch(/diagrama de clases/);
  });

  test('el contrato usa la especificación: acciones con ruta propia y componentes de pantalla', async () => {
    const { especificacion } = await servicio(buena).inferir({ requerimientos: rf, diagramas: [dominio], pantallas });
    const domainModel = new DomainModelExtractor().fromDiagrams([dominio]);
    const contrato = new ApplicationContractBuilder().build({ proyecto: { nombre: 'P' }, requerimientos: rf, domainModel, screens: pantallas.map((p) => ({ ...p, ruta: '/mesas' })), spec: especificacion });
    const rf04 = contrato.operations.find((o) => o.id === 'RF-04');
    expect(rf04.actions[0]).toMatchObject({ name: 'listarMesasAsignadas', method: 'GET', path: '/api/actions/listar-mesas-asignadas' });
    expect(rf04.actions[0].filters[0].valor).toBe('usuario.id');
    expect(contrato.operations.find((o) => o.id === 'RF-07').actions[0]).toMatchObject({ method: 'POST', path: '/api/actions/marcar-plato-agotado/:id' });
    expect(contrato.views[0].components[0].operacion).toBe('listarMesasAsignadas');
    expect(contrato.spec.actions).toBe(2);
  });

  test('sin especificación el contrato no cambia', () => {
    const domainModel = new DomainModelExtractor().fromDiagrams([dominio]);
    const contrato = new ApplicationContractBuilder().build({ proyecto: { nombre: 'P' }, requerimientos: rf, domainModel });
    expect(contrato.spec).toBeUndefined();
    expect(contrato.operations.every((o) => o.actions === undefined)).toBe(true);
  });
});
