const MockupTraceabilityService = require('../src/infrastructure/services/MockupTraceabilityService');
const AprobarFase = require('../src/core/use-cases/AprobarFase');

describe('trazabilidad árbol de navegación, mockups y requisitos', () => {
  const service = new MockupTraceabilityService();
  const requirements = [
    { identificador: 'RF-01', tipo: 'RF', nombre: 'Consultar menú', prioridad: 'Alta', actores: ['Cliente'], aprobado: true },
    { identificador: 'RF-02', tipo: 'RF', nombre: 'Crear reserva de mesa', prioridad: 'Alta', actores: ['Cliente'], aprobado: true },
    { identificador: 'RF-03', tipo: 'RF', nombre: 'Procesar pago', prioridad: 'Media', actores: ['Cajero'], aprobado: true }
  ];
  const screens = [
    { pantalla_id: 'menu', slug: 'menu', nombre: 'Menú disponible', ruta: 'Cliente / Menú', obligatoria: true },
    { pantalla_id: 'reserva', slug: 'reserva', nombre: 'Formulario de reserva', ruta: 'Cliente / Reservas / Nueva reserva', obligatoria: true }
  ];

  test('asocia requisitos funcionales a cada pantalla del manifiesto', () => {
    const manifest = service.buildManifest(screens, requirements);

    expect(manifest[0].rf_trazabilidad).toContain('RF-01');
    expect(manifest[1].rf_trazabilidad).toContain('RF-02');
    expect(manifest[0].rf_trazabilidad).not.toContain('RF-03');
  });

  test('elimina referencias inventadas y conserva trazabilidad con evidencia', () => {
    const manifest = service.buildManifest(screens, requirements);
    const trace = service.enrichMockup({
      nombre_pantalla: 'reserva',
      acciones_principales: ['Confirmar reserva de mesa'],
      rf_trazabilidad: ['RF-02', 'RF-99']
    }, manifest[1], requirements);

    expect(trace).toContain('RF-02');
    expect(trace).not.toContain('RF-99');
  });

  test('detecta pantallas faltantes, mockups huérfanos y RF altos sin cobertura', () => {
    const manifest = service.buildManifest(screens, requirements);
    const result = service.validate({
      manifest,
      requirements,
      mockups: [
        { pantalla_id: 'menu', nombre_pantalla: 'menu', nombre_visible: 'Menú disponible', rf_trazabilidad: ['RF-01'] },
        { pantalla_id: 'inventada', nombre_pantalla: 'inventada', nombre_visible: 'Pantalla inventada', rf_trazabilidad: ['RF-99'] }
      ]
    });

    expect(result.valido).toBe(false);
    expect(result.errores.join(' ')).toContain('Formulario de reserva');
    expect(result.errores.join(' ')).toContain('Pantalla inventada');
    expect(result.errores.join(' ')).toContain('RF-02');
    expect(result.metricas.cobertura_rf_altos_porcentaje).toBe(50);
  });

  test('acepta cobertura completa con evidencia visible', () => {
    const manifest = service.buildManifest(screens, requirements);
    const mockups = [
      { pantalla_id: 'menu', nombre_pantalla: 'menu', nombre_visible: 'Menú disponible', roles: ['Cliente'], acciones_principales: ['Consultar menú'], rf_trazabilidad: ['RF-01'] },
      { pantalla_id: 'reserva', nombre_pantalla: 'reserva', nombre_visible: 'Formulario de reserva', roles: ['Cliente'], campos_formulario: [{ nombre: 'Mesa' }], acciones_principales: ['Crear reserva de mesa'], rf_trazabilidad: ['RF-02'] }
    ];
    const result = service.validate({ manifest, mockups, requirements });

    expect(result.valido).toBe(true);
    expect(result.metricas.cobertura_rf_altos_porcentaje).toBe(100);
  });

  test('detecta campos, acciones, roles y estados importantes ausentes por RF', () => {
    const requirement = [{
      identificador: 'RF-10', tipo: 'RF', nombre: 'Actualizar estado del pedido',
      descripcion: 'El cocinero debe actualizar el estado del pedido en tiempo real.',
      prioridad: 'Alta', actores: ['Cocinero'], aprobado: true
    }];
    const manifest = service.buildManifest([
      { pantalla_id: 'pedido', nombre: 'Pedido', obligatoria: true, rf_trazabilidad: ['RF-10'] }
    ], requirement);
    const result = service.validate({
      manifest,
      requirements: requirement,
      mockups: [{ pantalla_id: 'pedido', nombre_pantalla: 'pedido', rf_trazabilidad: ['RF-10'] }]
    });

    expect(result.valido).toBe(false);
    expect(result.errores.join(' ')).toContain('roles');
    expect(result.errores.join(' ')).toContain('campos de entrada');
    expect(result.errores.join(' ')).toContain('acciones');
    expect(result.errores.join(' ')).toContain('estados');
  });

  test('AprobarFase bloquea mockups con cobertura incompleta', async () => {
    const manifest = service.buildManifest(screens, requirements);
    const guardarOActualizar = jest.fn().mockResolvedValue(true);
    const useCase = new AprobarFase({
      proyectoRepository: {
        obtenerPorId: jest.fn().mockResolvedValue({ id: 'p1', estado_fase: 'mockups_pendientes' }),
        actualizarEstadoFase: jest.fn()
      },
      requerimientoRepository: { listarPorProyecto: jest.fn().mockResolvedValue(requirements) },
      diagramaRepository: {},
      disenoRepository: {
        obtenerPorProyecto: jest.fn().mockResolvedValue({
          manifiesto_navegacion: manifest,
          mockups: [{ pantalla_id: 'menu', nombre_pantalla: 'menu', nombre_visible: 'Menú disponible', estado_calidad: 'valido', rf_trazabilidad: ['RF-01'] }]
        }),
        guardarOActualizar
      },
      mockupTraceabilityService: service
    });

    await expect(useCase.ejecutar({ proyectoId: 'p1', fase: 'mockups' }))
      .rejects.toThrow('inconsistencias de trazabilidad');
    expect(guardarOActualizar).toHaveBeenCalledWith('p1', expect.objectContaining({ trazabilidad_mockups: expect.any(Object) }));
  });
});
