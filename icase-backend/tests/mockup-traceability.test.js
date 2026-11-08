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

  test('el shell común, CSS y referencias declaradas no acreditan cobertura', () => {
    const mockup = {
      nombre_pantalla: 'menu', roles: ['Cliente'], rf_trazabilidad: ['RF-01', 'RF-02', 'RF-03'],
      preview_code: '<style>.reserva-mesa-pago {color:red}</style><nav>Reserva de mesa Procesar pago</nav><aside>Crear reserva</aside><main><h1>Menú disponible</h1><button>Consultar menú</button></main>'
    };
    const inherited = { ...screens[0], modulo: 'Reservas y pagos', flujo: 'Cliente: reserva de mesa', rf_trazabilidad: ['RF-02', 'RF-03'] };
    expect(service.enrichMockup(mockup, inherited, requirements)).toEqual(['RF-01']);
    expect(service.buildManifest([{ nombre: 'Menú', modulo: 'Pago y reservas', flujo: 'reserva mesa' }], requirements)[0].rf_trazabilidad).toEqual(['RF-01']);
  });

  test('no infiere cobertura por metadatos si el HTML no muestra el requisito', () => {
    expect(service.enrichMockup({ nombre_pantalla: 'reserva', acciones_principales: ['Crear reserva de mesa'], preview_code: '<main><h1>Inicio</h1></main>' }, screens[1], requirements)).toEqual([]);
  });

  test('la auditoría avisa si la evidencia local pertenece a otro rol', () => {
    const result = service.validate({ manifest: [{ pantalla_id: 'pago' }], requirements: [requirements[2]], mockups: [{ pantalla_id: 'pago', nombre_pantalla: 'pago', roles: ['Cliente'], rf_trazabilidad: ['RF-03'], preview_code: '<main>Procesar pago <button>Pagar</button></main>' }] });
    expect(result.advertencias.join(' ')).toContain('roles');
  });

  test('funciona en otro dominio sin inferir préstamos desde la navegación del catálogo', () => {
    const library = [
      { identificador: 'RF-20', tipo: 'RF', nombre: 'Consultar catálogo', aprobado: true },
      { identificador: 'RF-21', tipo: 'RF', nombre: 'Renovar préstamo', aprobado: true }
    ];
    expect(service.enrichMockup({ preview_code: '<nav>Renovar préstamo</nav><main><h1>Cat&#225;logo</h1></main>' }, null, library)).toEqual(['RF-20']);
  });

  test('un dato secundario no vincula un RF ajeno al propósito de la pantalla', () => {
    const rf = [{ identificador: 'RF-30', tipo: 'RF', aprobado: true, nombre: 'Consultar facturas pendientes' }];
    expect(service.enrichMockup({ preview_code: '<main><h1>Catálogo de libros</h1><p>Facturas pendientes: 3</p></main>' }, null, rf)).toEqual([]);
  });

  test('generar un código no equivale a validarlo', () => {
    const rf = [{ identificador: 'RF-31', tipo: 'RF', aprobado: true, nombre: 'Validación de código QR' }];
    expect(service.enrichMockup({ preview_code: '<main><h1>Código QR</h1><button>Generar código QR</button></main>' }, null, rf)).toEqual([]);
    expect(service.enrichMockup({ preview_code: '<main><h1>Código QR</h1><button>Validar código QR</button></main>' }, null, rf)).toEqual(['RF-31']);
  });

  test('overflow-hidden no oculta contenido y el encabezado local del catálogo cuenta', () => {
    expect(service.enrichMockup({ preview_code: '<nav>Crear reserva de mesa</nav><main class="overflow-hidden"><header><h1>Menú disponible</h1></header><div>Consultar menú</div></main>' }, null, requirements)).toEqual(['RF-01']);
  });

  test('cuenta títulos de pantalla fuera de main y estados en plural', () => {
    const rf = [{ identificador: 'RF-40', tipo: 'RF', nombre: 'Visualización de pedidos en tiempo real en cocina', descripcion: 'Mostrar pedidos en tiempo real', actores: ['Cocina'], prioridad: 'Alta', aprobado: true }];
    const mockup = { pantalla_id: 'cocina', nombre_pantalla: 'cocina', roles: ['Personal de Cocina'], rf_trazabilidad: ['RF-40'], preview_code: '<header><h1>Panel de Cocina</h1></header><main><h2>Pendientes</h2><p>Pedido 1</p><button>Iniciar preparación</button></main>' };
    expect(service.enrichMockup(mockup, null, rf)).toEqual(['RF-40']);
    expect(service.validate({ manifest: [{ pantalla_id: 'cocina' }], mockups: [mockup], requirements: rf }).valido).toBe(true);
  });

  test('la auditoría no cuenta referencias antiguas sin evidencia local', () => {
    const result = service.validate({ manifest: screens, requirements, mockups: [{ pantalla_id: 'menu', nombre_pantalla: 'menu', rf_trazabilidad: ['RF-01', 'RF-02'], preview_code: '<nav>Reserva de mesa</nav><main>Menú disponible</main>' }] });
    expect(result.metricas.rf_altos_ui_sin_cobertura).toContain('RF-02');
    expect(result.metricas.referencias_sin_evidencia).toContainEqual({ pantalla: 'menu', requisito: 'RF-02' });
    expect(result.advertencias.join(' ')).toContain('no contabilizadas');
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
    expect(result.advertencias.join(' ')).toContain('RF-02');
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

  test('sin mockups informa estado pendiente en vez de un error prematuro', () => {
    const result = service.validate({ manifest: screens, mockups: [], requirements });
    expect(result.valido).toBe(true);
    expect(result.estado).toBe('pendiente');
    expect(result.errores).toEqual([]);
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

    expect(result.valido).toBe(true);
    expect(result.advertencias.join(' ')).toContain('roles');
    expect(result.advertencias.join(' ')).toContain('campos de entrada');
    expect(result.advertencias.join(' ')).toContain('acciones');
    expect(result.advertencias.join(' ')).toContain('estados');
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
