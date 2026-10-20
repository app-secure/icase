const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');
const ApplicationContractBuilder = require('../src/infrastructure/services/ApplicationContractBuilder');
const BackendScaffoldGenerator = require('../src/infrastructure/services/BackendScaffoldGenerator');
const ArtifactVerificationService = require('../src/core/services/ArtifactVerificationService');

const PLANTUML = `@startuml
skinparam classAttributeIconSize 0
left to right direction
enum EstadoReserva {
  PENDIENTE
  CONFIRMADA
  CANCELADA
}
class Cliente {
  +String id
  +String nombre
  +String email
  +validar(): boolean
}
class Mesa {
  +String id
  +int capacidad
  +boolean disponible
}
class Reserva {
  +String id
  +DateTime fecha
  +EstadoReserva estado
  +int comensales
}
class Pedido {
  -id: String
  -total: float
  -notas: String?
}
class OrdenCompra {
  +String id
}
Cliente "1" --> "0..*" Reserva : realiza
Mesa "1" -- "0..*" Reserva
Reserva "1" *-- "1..*" Pedido
Cliente "1" o-- "*" OrdenCompra
@enduml`;

const rf = (identificador, nombre, descripcion = '') => ({ aprobado: true, tipo: 'RF', identificador, nombre, descripcion });

describe('DomainModelExtractor', () => {
  const model = new DomainModelExtractor().extract(PLANTUML);
  const entity = (name) => model.entities.find((item) => item.name === name);

  test('extrae entidades, tipos y omite métodos y enumeraciones como entidades', () => {
    expect(model.entities.map((item) => item.name)).toEqual(['Cliente', 'Mesa', 'Reserva', 'Pedido', 'OrdenCompra']);
    expect(model.enums).toEqual(['EstadoReserva']);
    const { properties } = entity('Reserva').schema;
    expect(properties.fecha).toEqual({ type: 'string', format: 'date-time' });
    expect(properties.comensales).toEqual({ type: 'integer' });
    expect(properties.estado).toEqual({ type: 'string', enum: ['PENDIENTE', 'CONFIRMADA', 'CANCELADA'] });
    expect(properties.id.readOnly).toBe(true);
    expect(entity('Cliente').schema.properties.validar).toBeUndefined();
  });

  test('acepta la notación nombre: tipo y tipos opcionales', () => {
    const pedido = entity('Pedido');
    expect(pedido.schema.properties.total).toEqual({ type: 'number' });
    expect(pedido.attributes.find((item) => item.name === 'notas').nullable).toBe(true);
  });

  test('coloca la clave foránea en el lado "muchos"', () => {
    expect(entity('Reserva').references.map((item) => item.field)).toEqual(expect.arrayContaining(['cliente_id', 'mesa_id']));
    expect(entity('Pedido').references.map((item) => item.field)).toEqual(['reserva_id']);
    expect(entity('OrdenCompra').references.map((item) => item.field)).toEqual(['cliente_id']);
    expect(entity('Reserva').schema.properties.cliente_id['x-references']).toBe('Cliente');
  });

  test('no declara campos obligatorios que el diagrama no expresa', () => {
    for (const item of model.entities) expect(item.schema.required).toEqual([]);
  });

  test('un diagrama vacío o inválido produce un modelo vacío', () => {
    expect(new DomainModelExtractor().extract('').entities).toEqual([]);
    expect(new DomainModelExtractor().extract('@startuml\nnote "x"\n@enduml').entities).toEqual([]);
  });
});

describe('contrato con modelo de dominio', () => {
  const model = new DomainModelExtractor().extract(PLANTUML);
  const requirements = [
    rf('RF-01', 'Reserva de mesas'),
    rf('RF-02', 'Gestión de clientes'),
    rf('RF-03', 'Registrar pedidos en sala'),
    rf('RF-04', 'Compra de órdenes de compra'),
    rf('RF-05', 'Visualización de reportes globales')
  ];
  const contract = new ApplicationContractBuilder().build({ proyecto: { nombre: 'Demo' }, requerimientos: requirements, domainModel: model });
  const operation = (id) => contract.operations.find((item) => item.id === id);

  test('asocia cada RF a la entidad cuyo nombre aparece en él, con plurales y acentos', () => {
    expect(operation('RF-01').entity).toBe('reserva');
    expect(operation('RF-01').relatedEntities).toEqual(['mesa']);
    expect(operation('RF-02').entity).toBe('cliente');
    expect(operation('RF-03').entity).toBe('pedido');
    expect(operation('RF-04').entity).toBe('ordencompra');
  });

  test('el esquema de la operación es el de su entidad; sin entidad queda genérico y se advierte', () => {
    expect(operation('RF-02').schema.properties.nombre).toEqual({ type: 'string' });
    expect(operation('RF-05').entity).toBeNull();
    expect(operation('RF-05').schema).toEqual({ type: 'object', additionalProperties: true });
    expect(contract.warnings).toEqual([expect.stringContaining('RF-05')]);
    expect(contract.model).toEqual({ source: 'clases_dominio', entities: 5, unmapped: ['Mesa'] });
  });

  test('sin modelo de dominio el contrato conserva el comportamiento genérico anterior', () => {
    const plain = new ApplicationContractBuilder().build({ proyecto: { nombre: 'Demo' }, requerimientos: requirements });
    expect(plain.model.source).toBe('none');
    expect(plain.entities).toEqual([]);
    expect(plain.warnings).toEqual([]);
    expect(plain.operations.every((item) => item.entity === null && item.schema.additionalProperties === true)).toBe(true);
  });

  test('el manifiesto del backend incluye entidades y sigue siendo estructuralmente válido', async () => {
    const result = await new BackendScaffoldGenerator().generar({
      proyecto: { nombre: 'Demo' },
      insumos: { decisiones: { stack_tecnologico: { backend: 'Express', base_datos: 'PostgreSQL' } }, requerimientos: requirements, diagramaDominio: { codigo_plantuml: PLANTUML } },
      versionesOrigen: {}
    });
    const manifest = JSON.parse(result.archivos.find((item) => item.ruta === 'backend/icase.manifest.json').contenido);
    expect(manifest.entities).toHaveLength(5);
    expect(manifest.operations).toHaveLength(5);
    expect(result.advertencias.join(' ')).toContain('sin RF asociado: Mesa');
    expect(new ArtifactVerificationService().verificar({ tipo: 'codigo_backend', archivos: result.archivos }).estado).toBe('apta_estructuralmente');
  });
});

describe('generarBackend con diagrama de dominio', () => {
  const GestionarArtefactosCodigo = require('../src/core/use-cases/GestionarArtefactosCodigo');
  const CodeGenerationWorkflowService = require('../src/core/services/CodeGenerationWorkflowService');
  const plan = () => ({
    proyecto_id: 'p1', version: 1,
    etapas: new CodeGenerationWorkflowService().crearEtapasIniciales().map((item) =>
      ['alcance_plataforma', 'stack_tecnologico', 'arquitectura_codigo', 'estructura_carpetas', 'reglas_negocio', 'control_acceso'].includes(item.etapa)
        ? { ...item, estado: 'aprobada', version: 1, propuesta: item.etapa === 'stack_tecnologico' ? { backend: 'Node.js + Express', base_datos: 'PostgreSQL' } : {} }
        : item)
  });
  const build = (diagramas) => {
    let latest = null;
    const currentPlan = plan();
    const artifacts = { obtenerUltimo: jest.fn(async () => latest), crear: jest.fn(async (data) => { latest = { id: 'a1', ...data }; return latest; }) };
    return new GestionarArtefactosCodigo({
      proyectoRepository: { obtenerPorId: async () => ({ id: 'p1', nombre: 'Demo' }) },
      requerimientoRepository: { listarPorProyecto: async () => [rf('RF-01', 'Gestión de clientes')] },
      diagramaRepository: { listarPorProyecto: async () => diagramas },
      planCodificacionRepository: { obtenerPorProyecto: async () => currentPlan, guardar: async (_id, data) => Object.assign(currentPlan, data) },
      artefactoRepository: artifacts,
      backendGenerator: new BackendScaffoldGenerator()
    });
  };
  const approved = { tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false, version: 3, codigo_plantuml: PLANTUML };
  const manifestOf = ({ artefacto }) => JSON.parse(artefacto.archivos.find((item) => item.ruta === 'backend/icase.manifest.json').contenido);

  test('usa el diagrama de dominio aprobado y registra su versión de origen', async () => {
    const result = await build([approved]).generarBackend('p1');
    expect(manifestOf(result).operations[0].entity).toBe('cliente');
    expect(result.artefacto.versiones_origen.clases_dominio).toBe(3);
  });

  test('ignora diagramas no aprobados o desactualizados', async () => {
    for (const diagrama of [{ ...approved, aprobado: false, estado: 'pendiente_revision' }, { ...approved, desactualizado: true }]) {
      const result = await build([diagrama]).generarBackend('p1');
      expect(manifestOf(result).model.source).toBe('none');
    }
  });

  test('un cambio en el diagrama genera una huella distinta', async () => {
    const [withModel, without] = [await build([approved]).generarBackend('p1'), await build([]).generarBackend('p1')];
    expect(withModel.artefacto.huella_entrada).not.toBe(without.artefacto.huella_entrada);
  });
});
