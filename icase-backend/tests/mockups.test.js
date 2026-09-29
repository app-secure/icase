const GenerarMockups = require('../src/core/use-cases/GenerarMockups');
const ActualizarMockupManual = require('../src/core/use-cases/ActualizarMockupManual');
const MockupValidatorService = require('../src/infrastructure/services/MockupValidatorService');

describe('Módulo de Mockups - Casos de Uso y Servicios', () => {
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
});
