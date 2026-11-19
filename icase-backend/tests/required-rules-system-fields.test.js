const BackendScaffoldGenerator = require('../src/infrastructure/services/BackendScaffoldGenerator');
const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');

const PLANTUML = `@startuml
enum EstadoReserva {
  PENDIENTE
  CONFIRMADA
}
class Usuario {
  +String id
  +String correo
  +String passwordHash
}
class Reserva {
  +String id
  +String codigoQr
  +EstadoReserva estado
  +String fechaHoraLiberacion
  +String mesa
}
class Pedido {
  +String id
  +float total
  +String mesa
}
@enduml`;
const modelo = new DomainModelExtractor().extract(PLANTUML);
const regla = (entidad, campo) => ({ id: `DOM-${entidad.toLowerCase()}-${campo}`, tipo: 'requerido', entidad, campo, rf: ['RF-02'], origen: 'inferido', estado_decision: 'confirmado', mensaje: `${campo} es obligatorio.` });
const rf = [{ identificador: 'RF-02', tipo: 'RF', aprobado: true, nombre: 'Reserva', descripcion: 'x', actores: ['Cliente'] }];
const propuestas = [regla('Reserva', 'codigoQr'), regla('Reserva', 'estado'), regla('Reserva', 'fechaHoraLiberacion'), regla('Reserva', 'mesa'), regla('Pedido', 'total'), regla('Usuario', 'passwordHash')];
const generador = new BackendScaffoldGenerator();

describe('reglas «obligatorio» sobre datos que la operación de alta no aporta', () => {
  const spec = { operaciones: [
    { entidad: 'Reserva', tipo: 'crear', entradas: ['mesa'], autoEntradas: [{ campo: 'codigoQr', valor: 'generado' }, { campo: 'estado', valor: 'inicial', opciones: ['PENDIENTE'] }], sesionEntradas: [] },
    { entidad: 'Pedido', tipo: 'crear', entradas: ['mesa'] },
    { entidad: 'Usuario', tipo: 'crear', entradas: ['correo', 'passwordHash'] }
  ] };

  test('se conservan las que la persona escribe o el servidor completa y se omiten las que se rellenan después', () => {
    const { reglas, omitidas } = generador._reglas(propuestas, modelo, rf, spec);
    const ids = reglas.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(['DOM-reserva-codigoQr', 'DOM-reserva-estado', 'DOM-reserva-mesa', 'DOM-usuario-passwordHash']));
    expect(omitidas).toEqual(['DOM-reserva-fechaHoraLiberacion', 'DOM-pedido-total']);
  });

  test('una regla pedida en un requisito (explícita) nunca se omite', () => {
    const explicita = { ...regla('Pedido', 'total'), origen: 'explicito', id: 'RN-01' };
    const { reglas, omitidas } = generador._reglas([explicita], modelo, rf, spec);
    expect(reglas.map((item) => item.id)).toEqual(['RN-01']);
    expect(omitidas).toEqual([]);
  });

  test('una entidad sin operación de alta en la especificación conserva todas sus reglas', () => {
    const { omitidas } = generador._reglas(propuestas, modelo, rf, null);
    expect(omitidas).toEqual([]);
    expect(generador._reglas(propuestas, modelo, rf, { operaciones: [] }).omitidas).toEqual([]);
  });
});
