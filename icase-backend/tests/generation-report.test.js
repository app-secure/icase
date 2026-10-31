const GenerationReportService = require('../src/core/services/GenerationReportService');
const BackendScaffoldGenerator = require('../src/infrastructure/services/BackendScaffoldGenerator');
const ArtifactVerificationService = require('../src/core/services/ArtifactVerificationService');

const service = new GenerationReportService();
const rf = (identificador, nombre, descripcion = '', extra = {}) => ({ aprobado: true, tipo: 'RF', identificador, nombre, descripcion, ...extra });

const contrato = {
  entities: [{ key: 'reserva', name: 'Reserva' }, { key: 'mesa', name: 'Mesa' }, { key: 'cliente', name: 'Cliente' }],
  operations: [
    { id: 'RF-01', entity: 'reserva', rules: [{ id: 'R1' }] },
    { id: 'RF-02', entity: 'mesa', rules: [] },
    { id: 'RF-03', entity: null, rules: [] },
    { id: 'RF-04', entity: null, rules: [] }
  ]
};

describe('informe de generación', () => {
  test('clasifica cada requisito como completo, solo datos o no soportado', () => {
    const report = service.build({
      proyecto: { nombre: 'Gourmet' },
      requisitos: [
        rf('RF-01', 'Gestionar reservas', 'El cliente reserva una mesa para una fecha'),
        rf('RF-02', 'Generar reporte de ocupación de mesas'),
        rf('RF-03', 'Enviar recordatorio de la reserva por correo'),
        rf('RF-04', 'Gestionar proveedores')
      ],
      contrato
    });
    const level = (id) => report.requisitos.find((item) => item.id === id);
    expect(level('RF-01')).toMatchObject({ nivel: 'completo', entidad: 'Reserva', reglas: 1, capacidades: [] });
    expect(level('RF-02')).toMatchObject({ nivel: 'solo_datos', entidad: 'Mesa' });
    expect(level('RF-02').capacidades.map((item) => item.id)).toEqual(['reportes']);
    expect(level('RF-03')).toMatchObject({ nivel: 'no_soportado', entidad: null });
    expect(level('RF-04')).toMatchObject({ nivel: 'solo_datos', entidad: null });
    expect(report.resumen).toEqual({ total: 4, completo: 1, solo_datos: 2, no_soportado: 1 });
  });

  test('cita la evidencia y dice qué ocurre en su lugar', () => {
    const report = service.build({ requisitos: [rf('RF-03', 'Seguimiento', 'Permite subir una foto del comprobante')], contrato });
    const [capability] = report.requisitos[0].capacidades;
    expect(capability).toMatchObject({ id: 'archivos' });
    expect(capability.evidencia).toMatch(/descripción: «subir»/);
    expect(capability.alternativa).toMatch(/No hay subida ni descarga/);
  });

  test.each([
    ['tiempo_real', 'Ver el estado del pedido en tiempo real'],
    ['archivos', 'Adjuntar el documento de identidad'],
    ['reportes', 'Exportar las ventas a Excel'],
    ['calculos', 'Calcular el total de la venta'],
    ['notificaciones', 'Notificar al cliente cuando su mesa esté lista'],
    ['notificaciones', 'Enviar confirmación de la reserva por correo electrónico'],
    ['notificaciones', 'El sistema avisa al cliente por SMS'],
    ['pagos', 'Cobrar con tarjeta de crédito mediante Stripe'],
    ['ubicacion', 'Mostrar la ubicación en un mapa'],
    ['integraciones', 'Iniciar sesión con Google mediante OAuth'],
    ['dispositivos', 'Leer el código QR de la entrada'],
    ['cuentas', 'Recuperar la contraseña olvidada']
  ])('detecta la capacidad %s', (id, nombre) => {
    const report = service.build({ requisitos: [rf('RF-03', nombre)], contrato });
    expect(report.requisitos[0].capacidades.map((item) => item.id)).toContain(id);
    expect(report.requisitos[0].nivel).toBe('no_soportado');
  });

  test.each([
    'Gestionar clientes',
    'Registrar el pago de una reserva',
    'Consultar el correo electrónico del cliente',
    'Administrar usuarios y roles',
    'Registrar la capacidad de cada mesa',
    'Gestionar el inventario de productos',
    'Enviar la lista de precios al proveedor'
  ])('no marca como no soportado un CRUD corriente: %s', (nombre) => {
    const report = service.build({ requisitos: [rf('RF-01', nombre)], contrato });
    expect(report.requisitos[0]).toMatchObject({ nivel: 'completo', capacidades: [] });
  });

  test('agrupa las capacidades y añade la del stack aunque ningún requisito la pida', () => {
    const report = service.build({
      requisitos: [rf('RF-01', 'Gestionar reservas'), rf('RF-03', 'Enviar correo de confirmación'), rf('RF-04', 'Enviar SMS de aviso')],
      contrato, stack: { tiempo_real: 'Socket.IO' }
    });
    const grouped = Object.fromEntries(report.capacidades_no_generadas.map((item) => [item.id, item]));
    expect(grouped.notificaciones.requisitos).toEqual(['RF-03', 'RF-04']);
    expect(grouped.tiempo_real).toMatchObject({ requisitos: [], stack: 'Socket.IO' });
    expect(service.toMarkdown(report)).toMatch(/Tiempo real\*\* — en el stack \(Socket\.IO\)/);
  });

  test('avisa de entidades sin requisito, app móvil y requisitos no funcionales', () => {
    const report = service.build({
      requisitos: [rf('RF-01', 'Gestionar reservas'), { aprobado: true, tipo: 'RNF', identificador: 'RNF-01', nombre: 'Responder en menos de 2 s' }],
      contrato, plataformas: ['web', 'móvil']
    });
    expect(report.entidades_sin_requisito).toEqual(['Cliente']);
    expect(report.notas.join(' ')).toMatch(/Expo.*sin firmar/);
    expect(report.notas.join(' ')).toMatch(/1 requisito no funcional:/);
  });

  test('sin modelo de dominio nada es completo y lo dice', () => {
    const report = service.build({ requisitos: [rf('RF-01', 'Gestionar reservas')], contrato: { entities: [], operations: [{ id: 'RF-01', entity: null }] } });
    expect(report.requisitos[0].nivel).toBe('solo_datos');
    expect(report.requisitos[0].motivos[0]).toMatch(/No hay un diagrama de clases de dominio aprobado/);
  });

  test('el Markdown resume niveles, tabla y límites generales', () => {
    const markdown = service.toMarkdown(service.build({ proyecto: { nombre: 'Gourmet' }, requisitos: [rf('RF-01', 'Gestionar reservas'), rf('RF-03', 'Enviar correo')], contrato }));
    expect(markdown).toMatch(/^# Informe de generación — Gourmet/);
    expect(markdown).toMatch(/\| RF-01 \| Gestionar reservas \| Completo \| Reserva \| 1 \|/);
    expect(markdown).toMatch(/\| RF-03 \| Enviar correo \| No soportado \| — \| 0 \|/);
    expect(markdown).toMatch(/Las listas devuelven todos los registros/);
  });
});

describe('el informe viaja con el backend generado', () => {
  const PLANTUML = '@startuml\nclass Reserva {\n  +String id\n  +int comensales\n}\nclass Mesa {\n  +String id\n  +int capacidad\n}\n@enduml';
  const generate = (stack) => new BackendScaffoldGenerator().generar({
    proyecto: { nombre: 'Gourmet Flow' },
    insumos: {
      decisiones: { stack_tecnologico: stack, alcance_plataforma: { plataformas: ['web', 'móvil'] } },
      diagramaDominio: { codigo_plantuml: PLANTUML },
      requerimientos: [
        rf('RF-01', 'Gestionar reservas', 'Registrar la reserva de una mesa'),
        rf('RF-02', 'Gestionar mesas'),
        rf('RF-03', 'Enviar confirmación por correo electrónico')
      ]
    },
    versionesOrigen: {}
  });
  const file = (result, ruta) => result.archivos.find((item) => item.ruta === ruta);

  test.each([
    ['Express', { backend: 'Node.js + Express', base_datos: 'PostgreSQL' }],
    ['NestJS', { backend: 'Node.js + NestJS', base_datos: 'PostgreSQL' }],
    ['Spring Boot', { backend: 'Java + Spring Boot', base_datos: 'PostgreSQL' }]
  ])('%s incluye el informe en JSON y Markdown y lo resume en las advertencias', async (_name, stack) => {
    const result = await generate(stack);
    const report = JSON.parse(file(result, 'backend/GENERATION-REPORT.json').contenido);
    expect(report.resumen).toEqual({ total: 3, completo: 2, solo_datos: 0, no_soportado: 1 });
    expect(report.requisitos.map((item) => [item.id, item.nivel])).toEqual([['RF-01', 'completo'], ['RF-02', 'completo'], ['RF-03', 'no_soportado']]);
    expect(report.notas.join(' ')).toMatch(/Expo/);
    expect(file(result, 'backend/GENERATION-REPORT.md').contenido).toMatch(/RF-03 · Enviar confirmación por correo electrónico \(No soportado\)/);
    expect(result.advertencias.join('\n')).toMatch(/Informe de generación: 2 requisitos completos, 0 solo con datos y 1 no soportados/);
    expect(result.archivos.every((item) => item.huella.length === 64)).toBe(true);
  });

  test('el artefacto con informe sigue pasando la verificación estructural', async () => {
    const result = await generate({ backend: 'Node.js + Express', base_datos: 'PostgreSQL' });
    const verification = new ArtifactVerificationService().verificar({ tipo: 'codigo_backend', ...result, estado: 'en_revision' });
    expect(verification.errores).toEqual([]);
    expect(verification.estado).toBe('apta_estructuralmente');
  });

  test('el informe es determinista', async () => {
    const stack = { backend: 'Node.js + Express', base_datos: 'MongoDB' };
    const [first, second] = [await generate(stack), await generate(stack)];
    expect(file(first, 'backend/GENERATION-REPORT.json').huella).toBe(file(second, 'backend/GENERATION-REPORT.json').huella);
  });
});

describe('vista previa del informe antes de generar', () => {
  const GestionarArtefactosCodigo = require('../src/core/use-cases/GestionarArtefactosCodigo');
  const CodeGenerationWorkflowService = require('../src/core/services/CodeGenerationWorkflowService');
  const PLAN_STAGES = ['alcance_plataforma', 'stack_tecnologico', 'arquitectura_codigo', 'estructura_carpetas', 'reglas_negocio', 'control_acceso'];
  const build = (approved = PLAN_STAGES) => {
    const plan = { proyecto_id: 'p1', version: 1, etapas: new CodeGenerationWorkflowService().crearEtapasIniciales().map((item) => approved.includes(item.etapa)
      ? { ...item, estado: 'aprobada', version: 1, propuesta: item.etapa === 'stack_tecnologico' ? { backend: 'Node.js + Express', base_datos: 'PostgreSQL' } : {} }
      : item) };
    const artifacts = { obtenerUltimo: jest.fn(), crear: jest.fn() };
    const plans = { obtenerPorProyecto: jest.fn(async () => plan), guardar: jest.fn() };
    const useCase = new GestionarArtefactosCodigo({
      proyectoRepository: { obtenerPorId: jest.fn(async () => ({ id: 'p1', nombre: 'Demo' })) },
      requerimientoRepository: { listarPorProyecto: jest.fn(async () => [rf('RF-01', 'Gestionar reservas'), rf('RF-02', 'Subir foto del local')]) },
      diagramaRepository: { listarPorProyecto: jest.fn(async () => []) },
      planCodificacionRepository: plans, artefactoRepository: artifacts, backendGenerator: new BackendScaffoldGenerator()
    });
    return { useCase, artifacts, plans };
  };

  test('calcula el informe sin guardar artefactos ni tocar el plan', async () => {
    const { useCase, artifacts, plans } = build();
    const report = await useCase.informeGeneracion('p1');
    expect(report.resumen.total).toBe(2);
    expect(report.requisitos.find((item) => item.id === 'RF-02').capacidades.map((item) => item.id)).toEqual(['archivos']);
    expect(artifacts.crear).not.toHaveBeenCalled();
    expect(plans.guardar).not.toHaveBeenCalled();
  });

  test('exige las mismas etapas aprobadas que la generación', async () => {
    const { useCase } = build(['alcance_plataforma']);
    await expect(useCase.informeGeneracion('p1')).rejects.toThrow(/Primero debes aprobar/);
  });
});
