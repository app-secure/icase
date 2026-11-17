const esbuild = require('esbuild');
const FrontendScaffoldGenerator = require('../src/infrastructure/services/FrontendScaffoldGenerator');
const ApplicationContractBuilder = require('../src/infrastructure/services/ApplicationContractBuilder');
const ApplicationSpecService = require('../src/infrastructure/services/ApplicationSpecService');
const DomainModelExtractor = require('../src/infrastructure/services/DomainModelExtractor');

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
Empleado "1" --> "0..*" Mesa
@enduml`;

const dominio = { tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false, codigo_plantuml: PLANTUML };
const rf = [
  { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Gestión de empleados', descripcion: 'Empleado', actores: ['Mesero'] },
  { aprobado: true, tipo: 'RF', identificador: 'RF-04', nombre: 'Consulta de mesas asignadas', descripcion: 'El mesero consulta sus mesas.', actores: ['Mesero'] }
];
const operaciones = [
  { nombre: 'listarMesasAsignadas', rf: 'RF-04', tipo: 'consulta', entidad: 'Mesa', estado_decision: 'confirmado', origen: 'ia', filtros: [{ campo: 'empleado_id', operador: '==', origen: 'sesion', valor: 'usuario.id' }], entradas: [], salida: ['numero', 'estado'] },
  { nombre: 'ocuparMesa', rf: 'RF-04', tipo: 'transicion', entidad: 'Mesa', estado_decision: 'confirmado', origen: 'ia', filtros: [], entradas: [], salida: [], transicion: { campo: 'estado', de: ['LIBRE'], a: 'OCUPADA' } },
  { nombre: 'registrarMesa', rf: 'RF-04', tipo: 'crear', entidad: 'Mesa', estado_decision: 'confirmado', origen: 'ia', filtros: [], entradas: ['numero', 'estado', 'empleado_id'], salida: [] },
  { nombre: 'pendienteSinConfirmar', rf: 'RF-04', tipo: 'eliminar', entidad: 'Mesa', estado_decision: 'pendiente', origen: 'ia', filtros: [], entradas: [], salida: [] }
];
const pantallas = [
  { id: 'mesas-asignadas', componentes: [
    { tipo: 'tarjetas', operacion: 'listarMesasAsignadas', campos: ['numero', 'estado'], acciones: [{ etiqueta: 'Ocupar', operacion: 'ocuparMesa' }, { etiqueta: 'Nueva mesa', operacion: 'registrarMesa' }, { etiqueta: 'Borrar', operacion: 'pendienteSinConfirmar' }] },
    { tipo: 'formulario', operacion: 'registrarMesa', campos: ['numero', 'estado'], acciones: [] }
  ] }
];

const mockupHtml = '<body><main><h1>Mesas</h1><p>Mesa 01 Libre Carlos Pérez</p><button data-accion="RF-04.consultar">Actualizar</button></main></body>';

const generar = async ({ conSpec = true } = {}) => {
  const decision = { version: 1, operaciones, pantallas };
  const especificacion = ApplicationSpecService.confirmada(decision);
  const contrato = new ApplicationContractBuilder().build({
    proyecto: { nombre: 'Demo' }, requerimientos: rf, domainModel: new DomainModelExtractor().fromDiagrams([dominio]), spec: especificacion
  });
  const acciones = contrato.operations.flatMap((operation) => operation.actions || []);
  const diseno = {
    manifiesto_navegacion: [{ pantalla_id: 'mesas-asignadas', slug: 'mesas-asignadas', nombre: 'Mesas asignadas', ruta: '/mesas', rf_trazabilidad: ['RF-04'] }],
    mockups: [{ pantalla_id: 'mesas-asignadas', nombre_pantalla: 'mesas-asignadas', nombre_visible: 'Mesas asignadas', rf_trazabilidad: ['RF-04'], preview_code: mockupHtml }],
    sistema_diseno: {}
  };
  const { archivos } = await new FrontendScaffoldGenerator().generar({
    proyecto: { nombre: 'Demo' }, versionesOrigen: {},
    insumos: { decisiones: { stack_tecnologico: { plataformas: ['web'] } }, diseno, requerimientos: rf, ...(conSpec ? { especificacion, acciones } : {}) }
  });
  return { archivos, file: (ruta) => archivos.find((item) => item.ruta === ruta)?.contenido, acciones };
};

describe('frontend generado desde la especificación', () => {
  test('la pantalla con componentes aprobados usa operaciones con nombre, no el HTML del mockup', async () => {
    const { file } = await generar();
    const page = file('frontend/src/pages/mesas-asignadas.jsx');
    expect(page).toContain("import { SpecBlock } from '../SpecComponents'");
    expect(page).toContain('/api/actions/listar-mesas-asignadas');
    expect(page).toContain('/api/actions/ocupar-mesa/:id');
    expect(page).not.toContain('Carlos Pérez');
    expect(page).not.toContain('Gestión de Datos (API)');
    expect(file('frontend/mockups-reference/mesas-asignadas.html')).toContain('Carlos Pérez'); // la referencia visual se conserva
  });

  test('los botones hacia operaciones no confirmadas no llegan a la pantalla', async () => {
    const { file } = await generar();
    const page = file('frontend/src/pages/mesas-asignadas.jsx');
    expect(page).not.toContain('pendienteSinConfirmar');
    expect(page).not.toContain('Borrar');
  });

  test('las operaciones traen el tipo de cada campo y la referencia a su almacén', async () => {
    const { acciones } = await generar();
    const crear = acciones.find((action) => action.name === 'registrarMesa');
    expect(crear.fields.estado).toMatchObject({ enum: ['LIBRE', 'OCUPADA'] });
    expect(crear.fields.empleado_id.referencia).toBe('rf-01');
    expect(crear.fields.numero.type).toBe('integer');
  });

  test('emite los componentes, estilos, opciones de referencia y el manifiesto', async () => {
    const { file } = await generar();
    expect(file('frontend/src/SpecComponents.jsx')).toContain('export function SpecBlock');
    expect(file('frontend/src/spec.css')).toContain('.spec-page');
    expect(file('frontend/src/ReferenceOptions.jsx')).toBeDefined();
    const manifest = JSON.parse(file('frontend/icase.manifest.json'));
    expect(manifest.pantallas[0]).toMatchObject({ origen: 'especificacion', especificacion: { componentes: 2 } });
  });

  test('el JSX generado compila', async () => {
    const { archivos } = await generar();
    for (const archivo of archivos.filter((item) => item.ruta.startsWith('frontend/src/') && /\.jsx$/.test(item.ruta))) {
      expect(() => esbuild.transformSync(archivo.contenido, { loader: 'jsx' })).not.toThrow();
    }
  });

  test('sin especificación la pantalla sigue saliendo del mockup', async () => {
    const { file } = await generar({ conSpec: false });
    expect(file('frontend/src/pages/mesas-asignadas.jsx')).toContain('Gestión de Datos (API)');
    expect(file('frontend/src/SpecComponents.jsx')).toBeUndefined();
  });
});
