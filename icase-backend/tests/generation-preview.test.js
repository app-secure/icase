const GenerationPreviewService = require('../src/infrastructure/services/GenerationPreviewService');
const GestionarPlanCodificacion = require('../src/core/use-cases/GestionarPlanCodificacion');

const PLANTUML = `@startuml
enum EstadoMesa {
  LIBRE
  OCUPADA
}
class Empleado {
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
}
Empleado "1" --> "0..*" Mesa
@enduml`;

const dominio = { tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false, codigo_plantuml: PLANTUML };
const rf = [
  { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Gestión de empleados', descripcion: 'Empleado' },
  { aprobado: true, tipo: 'RF', identificador: 'RF-04', nombre: 'Consulta de mesas asignadas', descripcion: 'El mesero consulta sus mesas.' },
  { aprobado: true, tipo: 'RF', identificador: 'RF-07', nombre: 'Gestión de platos', descripcion: 'Plato' }
];
const operaciones = [
  { nombre: 'listarMesasAsignadas', rf: 'RF-04', tipo: 'consulta', entidad: 'Mesa', estado_decision: 'confirmado', origen: 'ia', filtros: [{ campo: 'empleado_id', operador: '==', origen: 'sesion', valor: 'usuario.id' }], entradas: [], salida: ['numero', 'estado'] },
  { nombre: 'ocuparMesa', rf: 'RF-04', tipo: 'transicion', entidad: 'Mesa', estado_decision: 'confirmado', origen: 'ia', filtros: [], entradas: [], salida: [], transicion: { campo: 'estado', de: ['LIBRE'], a: 'OCUPADA' } },
  { nombre: 'sinConfirmar', rf: 'RF-04', tipo: 'eliminar', entidad: 'Mesa', estado_decision: 'pendiente', origen: 'ia', filtros: [], entradas: [], salida: [] }
];
const pantallasSpec = [{ id: 'mesas-asignadas', componentes: [{ tipo: 'tarjetas', operacion: 'listarMesasAsignadas', campos: ['numero', 'estado'], acciones: [{ etiqueta: 'Ocupar', operacion: 'ocuparMesa' }, { etiqueta: 'Borrar', operacion: 'sinConfirmar' }] }] }];
const diseno = {
  manifiesto_navegacion: [
    { pantalla_id: 'mesas-asignadas', slug: 'mesas-asignadas', nombre: 'Mesas asignadas', ruta: '/mesas', rf_trazabilidad: ['RF-04'] },
    { pantalla_id: 'menu', slug: 'menu', nombre: 'Menú', ruta: '/menu', rf_trazabilidad: ['RF-07'] },
    { pantalla_id: 'vacia', slug: 'vacia', nombre: 'Vacía', ruta: '/vacia', rf_trazabilidad: [] }
  ],
  mockups: [{ pantalla_id: 'menu', rf_trazabilidad: ['RF-07'], preview_code: '<main><form><input name="nombre"><button data-accion="RF-07.crear">Guardar</button></form><button>Pagar</button></main>' }]
};
const decisiones = { stack_tecnologico: { backend: 'Node.js + Express', base_datos: 'PostgreSQL', plataformas: ['web'] }, especificacion_aplicacion: { version: 1, operaciones, pantallas: pantallasSpec } };

describe('vista previa de la generación', () => {
  const vista = new GenerationPreviewService().construir({ proyecto: { nombre: 'Demo' }, requerimientos: rf, diagramas: [dominio], diseno, decisiones });

  test('la pantalla de la especificación lista componentes, endpoints y solo botones confirmados', () => {
    const pantalla = vista.pantallas.find((item) => item.id === 'mesas-asignadas');
    expect(pantalla.origen).toBe('especificacion');
    expect(pantalla.componentes[0]).toMatchObject({ tipo: 'tarjetas', endpoint: 'GET /api/actions/listar-mesas-asignadas', campos: ['numero', 'estado'] });
    expect(pantalla.componentes[0].campos_meta.estado).toBeDefined();
    expect(pantalla.componentes[0].botones).toEqual([{ etiqueta: 'Ocupar', operacion: 'ocuparMesa', tipo: 'transicion', por_fila: true, endpoint: 'POST /api/actions/ocupar-mesa/:id' }]);
  });

  test('una pantalla de mockup informa sus controles sin operación', () => {
    const pantalla = vista.pantallas.find((item) => item.id === 'menu');
    expect(pantalla.origen).toBe('mockup');
    expect(pantalla.controles_sin_operacion).toContain('Pagar');
  });

  test('una pantalla sin mockup ni spec cae a CRUD y se dice', () => {
    expect(vista.pantallas.find((item) => item.id === 'vacia').origen).toBe('crud');
    expect(vista.resumen.pantallas_por_origen).toEqual({ especificacion: 1, mockup: 1, crud: 1 });
  });

  test('lista las operaciones con su endpoint y las pantallas que las usan; ignora las no confirmadas', () => {
    expect(vista.operaciones.map((item) => item.nombre)).toEqual(['listarMesasAsignadas', 'ocuparMesa']);
    expect(vista.operaciones[0]).toMatchObject({ endpoint: 'GET /api/actions/listar-mesas-asignadas', requisito: 'RF-04', pantallas: ['mesas-asignadas'], filtros: 1 });
  });

  test('señala los RF que solo tendrán CRUD genérico', () => {
    expect(vista.rf_sin_cubrir.map((item) => item.id)).toEqual(['RF-01']);
    expect(vista.resumen).toMatchObject({ requisitos: 3, operaciones_negocio: 2, rf_sin_cubrir: 1, controles_sin_operacion: 1 });
  });

  test('describe los contenedores según el stack y las plataformas', () => {
    expect(vista.contenedores.map((item) => item.id)).toEqual(['backend', 'base_datos', 'web']);
    const conMovil = new GenerationPreviewService().construir({ requerimientos: rf, diagramas: [dominio], diseno, decisiones: { ...decisiones, stack_tecnologico: { plataformas: ['web', 'móvil'] } } });
    expect(conMovil.contenedores.map((item) => item.id)).toContain('movil');
  });

  test('sin especificación el motivo lo explica', () => {
    const sinSpec = new GenerationPreviewService().construir({ requerimientos: rf, diagramas: [dominio], diseno, decisiones: { stack_tecnologico: {} } });
    expect(sinSpec.rf_sin_cubrir.find((item) => item.id === 'RF-04').motivo).toMatch(/Sin especificación/);
    expect(sinSpec.pantallas.find((item) => item.id === 'mesas-asignadas').origen).toBe('crud');
  });

  test('el caso de uso arma la vista con las decisiones en revisión', async () => {
    const plan = { etapas: [{ etapa: 'especificacion_aplicacion', estado: 'en_revision', propuesta: decisiones.especificacion_aplicacion }, { etapa: 'stack_tecnologico', estado: 'rechazada', propuesta: { backend: 'X' } }] };
    const useCase = new GestionarPlanCodificacion({
      proyectoRepository: { obtenerPorId: async () => ({ id: 'p1', nombre: 'Demo', estado_fase: 'mockups_aprobados' }) },
      planCodificacionRepository: { obtenerPorProyecto: async () => plan },
      requerimientoRepository: { listarPorProyecto: async () => rf },
      diagramaRepository: { listarPorProyecto: async () => [dominio] },
      disenoRepository: { obtenerPorProyecto: async () => diseno }
    });
    const resultado = await useCase.vistaPrevia('p1');
    expect(resultado.operaciones.length).toBe(2);
    expect(resultado.contenedores[0].tecnologia).toBe('Node.js + Express'); // la etapa rechazada no cuenta
  });
});
