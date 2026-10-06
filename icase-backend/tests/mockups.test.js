const GenerarMockups = require('../src/core/use-cases/GenerarMockups');
const ActualizarMockupManual = require('../src/core/use-cases/ActualizarMockupManual');
const MockupValidatorService = require('../src/infrastructure/services/MockupValidatorService');
const MockupController = require('../src/interface-adapters/controllers/MockupController');
const MockupIaService = require('../src/infrastructure/services/MockupIaService');

describe('Módulo de Mockups - Casos de Uso y Servicios', () => {
  test('MockupIaService debe clasificar errores y abrir circuito para modelos retirados', () => {
    const service = new MockupIaService();
    const error = { response: { status: 404, data: { error: { message: 'model no longer available' } } } };
    const clasificacion = service._clasificarError(error);

    expect(clasificacion.tipo).toBe('modelo_no_disponible');
    service._registrarFallo('gemini:modelo-retirado', clasificacion);
    expect(service._circuitoDisponible('gemini:modelo-retirado')).toBe(false);
  });

  test('MockupIaService debe omitir Groq cuando el prompt supera su presupuesto', async () => {
    const service = new MockupIaService();
    service.models.groq = ['modelo-prueba'];
    service.groqApiKey = 'test-key';
    service._solicitar = jest.fn();

    const resultado = await service._intentarProveedor('groq', 'x'.repeat(16000), 4000);

    expect(resultado.texto).toBeNull();
    expect(resultado.advertencias[0]).toContain('Groq omitido');
    expect(service._solicitar).not.toHaveBeenCalled();
  });

  test('MockupController debe persistir el resultado y finalizar un trabajo asíncrono', async () => {
    const trabajoRepository = {
      actualizar: jest.fn().mockResolvedValue({})
    };
    const generarMockupsUseCase = {
      ejecutar: jest.fn().mockImplementation(async ({ onProgress }) => {
        await onProgress({ progreso: 50, mensaje: 'Lote procesado' });
        return {
          mockups: [{ nombre_pantalla: 'inicio' }],
          proveedorUsado: 'gemini',
          advertencias: []
        };
      })
    };
    const controller = new MockupController({
      generarMockupsUseCase,
      actualizarMockupManualUseCase: {},
      disenoRepository: {},
      trabajoGeneracionRepository: trabajoRepository
    });

    await controller._ejecutarTrabajo('job-1', {
      proyectoId: 'proj-1', pantallas: [], insumoAdicional: '', requerimientosLocales: null
    });

    expect(trabajoRepository.actualizar).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ estado: 'completado', progreso: 100, total_generados: 1 }),
      true
    );
  });

  test('GenerarMockups debe bloquear la generación antes de aprobar diagramas', async () => {
    const mockupIaService = { generarMockups: jest.fn() };
    const useCase = new GenerarMockups({
      proyectoRepository: {
        obtenerPorId: jest.fn().mockResolvedValue({
          id: 'proj-1', nombre: 'Test', estado_fase: 'diseno_pendiente'
        })
      },
      requerimientoRepository: {},
      diagramaRepository: {},
      disenoRepository: {},
      mockupIaService
    });

    await expect(useCase.ejecutar({ proyectoId: 'proj-1' }))
      .rejects.toThrow('Debes aprobar los cuatro diagramas');
    expect(mockupIaService.generarMockups).not.toHaveBeenCalled();
  });

  test('MockupValidatorService debe permitir Tailwind CDN y detectar scripts maliciosos', () => {
    const validator = new MockupValidatorService();
    const htmlConTailwind = '<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body><div class="p-4 bg-blue-500">Hola</div></body></html>';
    const sanitizado = validator.sanitizar(htmlConTailwind);

    expect(sanitizado.html).toContain('cdn.tailwindcss.com');
    expect(validator.listo(sanitizado.html)).toBe(true);

    const htmlMalicioso = '<!DOCTYPE html><html><head><script>alert("hack")</script></head><body><button onclick="evil()">Click</button></body></html>';
    const sanitizadoMalicioso = validator.sanitizar(htmlMalicioso);

    expect(sanitizadoMalicioso.html).not.toContain('alert');
    expect(sanitizadoMalicioso.html).not.toContain('onclick');
    expect(sanitizadoMalicioso.advertencias.length).toBeGreaterThan(0);
  });

  test('GenerarMockups debe funcionar tanto con listarPorProyecto como con obtenerPorProyecto', async () => {
    const mockProyectoRepo = {
      obtenerPorId: jest.fn().mockResolvedValue({ id: 'proj-1', nombre: 'Test Proj' })
    };

    // Simulamos un repo que solo tiene obtenerPorProyecto (el caso del error del usuario)
    const mockReqRepoSoloObtener = {
      obtenerPorProyecto: jest.fn().mockResolvedValue([
        { identificador: 'RF-01', nombre: 'Login', tipo: 'RF', prioridad: 'Alta', descripcion: 'Autenticación' }
      ])
    };

    const mockDiagRepo = {
      listarPorProyecto: jest.fn().mockResolvedValue([])
    };

    const mockDisenoRepo = {
      obtenerPorProyecto: jest.fn().mockResolvedValue({ mockups: [] }),
      guardarOActualizar: jest.fn().mockImplementation((id, data) => Promise.resolve({ id, ...data }))
    };

    const mockIaService = {
      generarMockups: jest.fn().mockResolvedValue({
        mockups: [
          {
            nombre_pantalla: 'login',
            tipo: 'login',
            descripcion: 'Pantalla de acceso',
            preview_code: '<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body><div>Login</div></body></html>'
          }
        ],
        proveedorUsado: 'gemini',
        advertencias: []
      })
    };

    const useCase = new GenerarMockups({
      proyectoRepository: mockProyectoRepo,
      requerimientoRepository: mockReqRepoSoloObtener,
      diagramaRepository: mockDiagRepo,
      disenoRepository: mockDisenoRepo,
      mockupIaService: mockIaService
    });

    const resultado = await useCase.ejecutar({ proyectoId: 'proj-1' });

    expect(mockReqRepoSoloObtener.obtenerPorProyecto).toHaveBeenCalledWith('proj-1');
    expect(mockDisenoRepo.guardarOActualizar).toHaveBeenCalled();
    expect(resultado.mockups).toHaveLength(1);
    expect(resultado.mockups[0].nombre_pantalla).toBe('login');
    expect(resultado.mockups[0].estado).toBe('generado');
    expect(resultado.proveedorUsado).toBe('gemini');
  });

  test('GenerarMockups debe funcionar con listarPorProyecto', async () => {
    const mockProyectoRepo = {
      obtenerPorId: jest.fn().mockResolvedValue({ id: 'proj-1', nombre: 'Test Proj' })
    };

    const mockReqRepoListar = {
      listarPorProyecto: jest.fn().mockResolvedValue([
        { identificador: 'RF-01', nombre: 'Login', tipo: 'RF', prioridad: 'Alta', descripcion: 'Autenticación' }
      ])
    };

    const mockDiagRepo = {
      listarPorProyecto: jest.fn().mockResolvedValue([])
    };

    const mockDisenoRepo = {
      obtenerPorProyecto: jest.fn().mockResolvedValue({ mockups: [] }),
      guardarOActualizar: jest.fn().mockImplementation((id, data) => Promise.resolve({ id, ...data }))
    };

    const mockIaService = {
      generarMockups: jest.fn().mockResolvedValue({
        mockups: [
          {
            nombre_pantalla: 'dashboard',
            tipo: 'dashboard',
            descripcion: 'Panel principal',
            preview_code: '<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body><div>Dashboard</div></body></html>'
          }
        ],
        proveedorUsado: 'groq',
        advertencias: []
      })
    };

    const useCase = new GenerarMockups({
      proyectoRepository: mockProyectoRepo,
      requerimientoRepository: mockReqRepoListar,
      diagramaRepository: mockDiagRepo,
      disenoRepository: mockDisenoRepo,
      mockupIaService: mockIaService
    });

    const resultado = await useCase.ejecutar({ proyectoId: 'proj-1' });

    expect(mockReqRepoListar.listarPorProyecto).toHaveBeenCalledWith('proj-1');
    expect(resultado.mockups).toHaveLength(1);
    expect(resultado.mockups[0].nombre_pantalla).toBe('dashboard');
  });

  test('ActualizarMockupManual debe validar y actualizar el mockup', async () => {
    const mockDisenoRepo = {
      obtenerPorProyecto: jest.fn().mockResolvedValue({
        mockups: [
          {
            nombre_pantalla: 'login',
            version: 1,
            preview_code: '<!DOCTYPE html><html><body>Original</body></html>'
          }
        ]
      }),
      guardarOActualizar: jest.fn().mockImplementation((id, data) => Promise.resolve({ id, ...data }))
    };

    const useCase = new ActualizarMockupManual({ disenoRepository: mockDisenoRepo });
    const actualizado = await useCase.ejecutar({
      proyectoId: 'proj-1',
      nombrePantalla: 'login',
      previewCode: '<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body>Modificado</body></html>'
    });

    expect(actualizado.nombre_pantalla).toBe('login');
    expect(actualizado.version).toBe(2);
    expect(actualizado.estado).toBe('editado');
    expect(mockDisenoRepo.guardarOActualizar).toHaveBeenCalled();
  });

  test('GenerarMockups debe derivar las pantallas del Arbol de Navegacion y no de los requerimientos', async () => {
    const useCase = new GenerarMockups({
      proyectoRepository: {},
      requerimientoRepository: {},
      diagramaRepository: {},
      disenoRepository: {},
      mockupIaService: {}
    });

    const arbol = `@startwbs
* SmartMix
** Portal de Acceso
*** Inicio de Sesión
*** Recuperación de Contraseña
** Panel Principal
*** Tablero de Operación (vista general)
** Módulo de Pedidos
*** Listado de Pedidos
*** Detalle de Pedido
*** Formulario de Nuevo Pedido
** Perfil del Usuario
@endwbs`;

    const pantallas = useCase._extraerPantallasDelArbol(arbol);

    expect(pantallas.map(p => p.nombre)).toEqual([
      'Inicio de Sesión',
      'Recuperación de Contraseña',
      'Tablero de Operación',
      'Listado de Pedidos',
      'Detalle de Pedido',
      'Formulario de Nuevo Pedido',
      'Perfil del Usuario'
    ]);

    expect(pantallas[0].slug).toBe('inicio-de-sesion');
    expect(pantallas[0].tipo).toBe('form');
    expect(pantallas[2].tipo).toBe('dashboard');
    expect(pantallas[4].tipo).toBe('detail');
    expect(pantallas[6].ruta).toBe('SmartMix / Perfil del Usuario');

    const pantallaInvalida = useCase._extraerPantallasDelArbol('***\n**\n');
    expect(pantallaInvalida).toEqual([]);
  });

  test('GenerarMockups debe enviar el listado de pantallas del arbol antes que los requerimientos', () => {
    const useCase = new GenerarMockups({
      proyectoRepository: {},
      requerimientoRepository: {},
      diagramaRepository: {},
      disenoRepository: {},
      mockupIaService: {}
    });

    const contexto = useCase._construirContexto(
      [{ identificador: 'RF-01', tipo: 'RF', nombre: 'Registrar pedido', prioridad: 'Alta', descripcion: 'Alta' }],
      [{
        tipo: 'arbol_navegacion',
        codigo_plantuml: '@startwbs\n* SmartMix\n** Portal de Acceso\n*** Inicio de Sesión\n*** Listado de Pedidos\n@endwbs'
      }],
      { nombre: 'SmartMix', descripcion: 'Concreto' }
    );

    expect(contexto).toContain('PANTALLAS A DISEÑAR');
    expect(contexto).toContain('inicio-de-sesion');
    expect(contexto).toContain('listado-de-pedidos');
    expect(contexto.indexOf('PANTALLAS A DISEÑAR')).toBeLessThan(contexto.indexOf('REQUERIMIENTOS FUNCIONALES'));
    expect(contexto).toContain('NO agregan ni quitan pantallas');
  });

  test('GenerarMockups debe recurrir a los requerimientos cuando no hay arbol de navegacion', () => {
    const useCase = new GenerarMockups({
      proyectoRepository: {},
      requerimientoRepository: {},
      diagramaRepository: {},
      disenoRepository: {},
      mockupIaService: {}
    });

    const contexto = useCase._construirContexto(
      [{ identificador: 'RF-01', tipo: 'RF', nombre: 'Login', prioridad: 'Alta', descripcion: 'Autenticación' }],
      [],
      { nombre: 'Test' }
    );

    expect(contexto).toContain('No se pudo derivar el listado de pantallas');
    expect(contexto).toContain('deriva las pantallas de los Requerimientos Funcionales');
  });

  test('GenerarMockups debe generar TODAS las pantallas del arbol dividiendolas en lotes', async () => {
    const pantallasArbol = [];
    for (let i = 1; i <= 11; i++) {
      pantallasArbol.push({ nombre: `Pantalla ${i}`, slug: `pantalla-${i}`, ruta: `Sistema / Módulo ${i}`, modulo: `Módulo ${i}`, tipo: 'list' });
    }
    const codigo = '@startwbs\n* Sistema\n' + pantallasArbol.map((p, i) => `** ${i + 1}\n*** ${p.nombre}`).join('\n') + '\n@endwbs';

    const mockIaService = {
      generarMockups: jest.fn().mockImplementation(({ pantallas }) =>
        Promise.resolve({
          mockups: pantallas.map(slug => ({
            nombre_pantalla: slug,
            tipo: 'list',
            descripcion: 'x',
            preview_code: '<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body>ok</body></html>'
          })),
          proveedorUsado: 'gemini',
          advertencias: []
        })
      )
    };

    const useCase = new GenerarMockups({
      proyectoRepository: { obtenerPorId: jest.fn().mockResolvedValue({ id: 'proj-1', nombre: 'Sistema' }) },
      requerimientoRepository: { listarPorProyecto: jest.fn().mockResolvedValue([]) },
      diagramaRepository: { listarPorProyecto: jest.fn().mockResolvedValue([{ tipo: 'arbol_navegacion', codigo_plantuml: codigo }]) },
      disenoRepository: {
        obtenerPorProyecto: jest.fn().mockResolvedValue({ mockups: [] }),
        guardarOActualizar: jest.fn().mockResolvedValue({})
      },
      mockupIaService: mockIaService
    });

    const resultado = await useCase.ejecutar({ proyectoId: 'proj-1' });

    expect(pantallasArbol).toHaveLength(11);
    expect(mockIaService.generarMockups).toHaveBeenCalledTimes(11);
    expect(mockIaService.generarMockups.mock.calls[0][0].contextoProyecto).toContain('pantalla-1');
    expect(mockIaService.generarMockups.mock.calls[0][0].contextoProyecto).not.toContain('pantalla-2 |');
    expect(resultado.mockups).toHaveLength(11);
    expect(resultado.mockups.map(m => m.nombre_pantalla)).toEqual(
      Array.from({ length: 11 }, (_, i) => `pantalla-${i + 1}`)
    );
    expect(resultado.advertencias).toEqual([]);
  });

  test('GenerarMockups debe continuar aunque un lote falle', async () => {
    const codigo = '@startwbs\n* Sistema\n** Módulo\n*** Pantalla A\n*** Pantalla B\n*** Pantalla C\n*** Pantalla D\n*** Pantalla E\n@endwbs';

    let numeroIntento = 0;
    const mockIaService = {
      generarMockups: jest.fn().mockImplementation(({ pantallas }) => {
        numeroIntento += 1;
        if (numeroIntento === 1) return Promise.reject(new Error('timeout del proveedor'));
        return Promise.resolve({
          mockups: pantallas.map(nombre => ({
            nombre_pantalla: nombre,
            tipo: 'list',
            descripcion: 'x',
            preview_code: '<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body>ok</body></html>'
          })),
          proveedorUsado: 'groq',
          advertencias: []
        });
      })
    };

    const useCase = new GenerarMockups({
      proyectoRepository: { obtenerPorId: jest.fn().mockResolvedValue({ id: 'proj-1', nombre: 'Sistema' }) },
      requerimientoRepository: { listarPorProyecto: jest.fn().mockResolvedValue([]) },
      diagramaRepository: { listarPorProyecto: jest.fn().mockResolvedValue([{ tipo: 'arbol_navegacion', codigo_plantuml: codigo }]) },
      disenoRepository: {
        obtenerPorProyecto: jest.fn().mockResolvedValue({ mockups: [] }),
        guardarOActualizar: jest.fn().mockResolvedValue({})
      },
      mockupIaService: mockIaService
    });

    const resultado = await useCase.ejecutar({ proyectoId: 'proj-1' });

    expect(resultado.mockups.map(m => m.nombre_pantalla)).toEqual(['pantalla-b', 'pantalla-c', 'pantalla-d', 'pantalla-e']);
    expect(resultado.proveedorUsado).toBe('groq');
    expect(resultado.advertencias[0]).toContain('Lote 1/5 falló');
  });

  test('GenerarMockups debe quitar la numeracion completa del nombre de la pantalla', () => {
    const useCase = new GenerarMockups({
      proyectoRepository: {}, requerimientoRepository: {}, diagramaRepository: {}, disenoRepository: {}, mockupIaService: {}
    });

    const pantallas = useCase._extraerPantallasDelArbol(
      '@startwbs\n* AuthPortal\n** 1. Acceso y Control\n*** 1.1 Pantalla Login (Credenciales / SSO)\n*** 1.2 Recuperación de Contraseña\n** 2. Operativos\n*** 2.1 Panel Principal /home\n@endwbs'
    );

    expect(pantallas.map(p => p.nombre)).toEqual([
      'Pantalla Login',
      'Recuperación de Contraseña',
      'Panel Principal /home'
    ]);
    expect(pantallas.map(p => p.slug)).toEqual(['pantalla-login', 'recuperacion-de-contrasena', 'panel-principal-home']);
  });

  test('GenerarMockups debe tratar los componentes de interfaz como parte de su pantalla', () => {
    const useCase = new GenerarMockups({
      proyectoRepository: {}, requerimientoRepository: {}, diagramaRepository: {}, disenoRepository: {}, mockupIaService: {}
    });

    const pantallas = useCase._extraerPantallasDelArbol(
      '@startwbs\n* Sistema\n** Acceso\n*** Botón Modo Invitado\n*** Pantalla de Login\n** Calculadora\n*** Display Digital\n*** Teclado Básico\n*** Teclado Científico\n** Catálogos\n*** Catálogo de Menú Digital\n*** Menú Digital\n@endwbs'
    );

    expect(pantallas.map(p => p.nombre)).toEqual(['Pantalla de Login', 'Calculadora', 'Catálogo de Menú Digital', 'Menú Digital']);

    expect(pantallas[0].componentes).toEqual(['Botón Modo Invitado']);
    expect(pantallas[1].componentes).toEqual(['Display Digital', 'Teclado Básico', 'Teclado Científico']);
    expect(pantallas[2].componentes).toEqual([]);
  });

  test('GenerarMockups debe resolver la ruta completa en arboles de varios niveles', () => {
    const useCase = new GenerarMockups({
      proyectoRepository: {}, requerimientoRepository: {}, diagramaRepository: {}, disenoRepository: {}, mockupIaService: {}
    });

    const pantallas = useCase._extraerPantallasDelArbol(
      '@startwbs\n* Sistema\n** Ventas\n*** Pedidos\n**** Detalle de Pedido\n**** Formulario de Nuevo Pedido\n@endwbs'
    );

    expect(pantallas.map(p => p.nombre)).toEqual(['Detalle de Pedido', 'Formulario de Nuevo Pedido']);
    expect(pantallas[0].ruta).toBe('Sistema / Ventas / Pedidos / Detalle de Pedido');
    expect(pantallas[0].modulo).toBe('Pedidos');
  });

  test('GenerarMockups no debe repetir slugs cuando dos pantallas tienen el mismo nombre', () => {
    const useCase = new GenerarMockups({
      proyectoRepository: {}, requerimientoRepository: {}, diagramaRepository: {}, disenoRepository: {}, mockupIaService: {}
    });

    const pantallas = useCase._extraerPantallasDelArbol(
      '@startwbs\n* Sistema\n** Ventas\n*** Reportes\n** Compras\n*** Reportes\n@endwbs'
    );

    expect(pantallas.map(p => p.slug)).toEqual(['reportes', 'compras-reportes']);
  });

  test('GenerarMockups debe ignorar el mermaid de relleno del arbol de navegacion', () => {
    const useCase = new GenerarMockups({
      proyectoRepository: {}, requerimientoRepository: {}, diagramaRepository: {}, disenoRepository: {}, mockupIaService: {}
    });

    const relleno = 'graph TD\n    A[Inicio] --> B[Ejecución de Módulo]\n    B --> C[Fin]';

    expect(useCase._pantallasDelProyecto([{ tipo: 'arbol_navegacion', codigo_mermaid: relleno }]).pantallas).toEqual([]);
    expect(
      useCase._pantallasDelProyecto([{ tipo: 'arbol_navegacion', codigo_mermaid: relleno, codigo_plantuml: '@startwbs\n* Sistema\n** Ventas\n*** Reportes\n@endwbs' }]).pantallas
    ).toHaveLength(1);
  });

  test('GenerarMockups debe conservar plataformas y roles del arbol', () => {
    const useCase = new GenerarMockups({
      proyectoRepository: {}, requerimientoRepository: {}, diagramaRepository: {}, disenoRepository: {}, mockupIaService: {}
    });
    const pantallas = useCase._extraerPantallasDelArbol(
      '@startwbs\n* GourmetFlow\n** Flujo de Cliente (Móvil)\n*** Menú Digital\n** Flujo de Mesero (Tablet)\n*** Listado de Comandas\n** Cocina KDS (Web)\n*** Monitor de Comandas\n@endwbs'
    );

    expect(pantallas.map(p => p.plataforma)).toEqual(['mobile', 'tablet', 'web']);
    expect(pantallas[0].roles).toContain('Cliente');
    expect(pantallas[1].roles).toContain('Mesero');
    expect(pantallas[2].shell).toBe('kds-web');
  });

  test('GenerarMockups debe recuperar flujos cliente y mesero desde los actores de requisitos', () => {
    const useCase = new GenerarMockups({
      proyectoRepository: {}, requerimientoRepository: {}, diagramaRepository: {}, disenoRepository: {}, mockupIaService: {}
    });
    const base = useCase._extraerPantallasDelArbol(
      '@startwbs\n* GourmetFlow\n** Módulo de Reservas\n*** Formulario de Nueva Reserva\n** Módulo de Salón\n*** Formulario de Nueva Comanda\n** Cocina KDS\n*** Monitor de Comandas\n@endwbs'
    );
    const enriquecidas = useCase._enriquecerPlataformas(base, [
      { nombre: 'Reservar mesa', descripcion: 'El cliente crea una reserva', actores: ['Cliente'] },
      { nombre: 'Crear comanda', descripcion: 'El camarero registra pedidos', actores: ['Camarero'] }
    ]);

    expect(enriquecidas[0]).toEqual(expect.objectContaining({ plataforma: 'mobile', shell: 'cliente-mobile', roles: ['Cliente'] }));
    expect(enriquecidas[1]).toEqual(expect.objectContaining({ plataforma: 'tablet', shell: 'mesero-tablet', roles: ['Mesero'] }));
    expect(enriquecidas[2].plataforma).toBe('web');
  });

  test('MockupValidatorService debe rechazar rutas locales y HTML sin estilos', () => {
    const validator = new MockupValidatorService();
    const resultado = validator.validar('<!DOCTYPE html><html><body><img src="C:\\\\Users\\\\foto.png"></body></html>');
    expect(resultado.valido).toBe(false);
    expect(resultado.errores.join(' ')).toMatch(/rutas|estilos/i);
  });

  test('MockupValidatorService debe materializar la paleta en el HTML generado', () => {
    const validator = new MockupValidatorService();
    const html = '<!DOCTYPE html><html><head></head><body><button style="background:#0b57d0" class="bg-blue-600">Guardar</button></body></html>';
    const aplicado = validator.aplicarSistemaDiseno(html, {
      colores: {
        primario: '#c2410c', primario_oscuro: '#9a3412', secundario: '#334155',
        fondo: '#fff7ed', superficie: '#ffffff', texto: '#1c1917',
        exito: '#15803d', alerta: '#ca8a04', error: '#dc2626'
      }
    });

    expect(aplicado).toContain('background:#c2410c');
    expect(aplicado).toContain('--icase-primary:#c2410c');
    expect(aplicado).toContain('id="icase-design-system"');
  });
});
