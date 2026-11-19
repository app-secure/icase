const GenerarMockups = require('../src/core/use-cases/GenerarMockups');
const ActualizarMockupManual = require('../src/core/use-cases/ActualizarMockupManual');
const MockupBindingService = require('../src/infrastructure/services/MockupBindingService');
const DisenoModel = require('../src/infrastructure/database/schemas/DisenoSchema');

const requerimientos = [{ identificador: 'RF-01', nombre: 'Gestionar salas', tipo: 'RF', aprobado: true, descripcion: 'Registrar salas' }];
const html = (body) => `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body><main>${body}</main></body></html>`;
const bound = html('<form><input name="nombre"><button data-accion="RF-01.crear">Crear sala</button></form><button>Otro</button>');
const legacy = html('<form><input name="nombre"><button>Crear sala</button></form>');
const diagram = {
  tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false,
  codigo_plantuml: '@startuml\nclass Sala {\n  String nombre\n}\n@enduml'
};

async function generate(previewCode) {
  const guardarOActualizar = jest.fn().mockImplementation((id, data) => Promise.resolve({ id, ...data }));
  const useCase = new GenerarMockups({
    proyectoRepository: { obtenerPorId: async () => ({ id: 'p1', nombre: 'Demo' }) },
    requerimientoRepository: { listarPorProyecto: async () => requerimientos },
    diagramaRepository: { listarPorProyecto: async () => [] },
    disenoRepository: { obtenerPorProyecto: async () => ({ mockups: [] }), guardarOActualizar },
    mockupIaService: { generarMockups: async () => ({ mockups: [{ nombre_pantalla: 'salas', tipo: 'form', descripcion: 'Salas', preview_code: previewCode }], proveedorUsado: 'gemini', advertencias: [] }) }
  });
  await useCase.ejecutar({ proyectoId: 'p1' });
  return guardarOActualizar.mock.calls[0][1].mockups[0];
}

describe('enlaces de mockups: generación', () => {
  test('un mockup con enlaces guarda `enlaces` y avisa de los controles sin enlace', async () => {
    const mockup = await generate(bound);
    expect(mockup.enlaces).toEqual([expect.objectContaining({ rf: 'RF-01', verbo: 'crear', estado: 'valido' })]);
    expect(mockup.advertencias_validacion).toContain('sin enlace: Otro');
  });

  test('un mockup que no declara ningún enlace no cambia: sin enlaces y sin avisos nuevos', async () => {
    const mockup = await generate(legacy);
    expect(mockup.enlaces).toEqual([]);
    expect(mockup.advertencias_validacion.join(' ')).not.toContain('sin enlace');
  });

  test('un enlace inválido se guarda como inválido y no cambia estado_calidad a inválido', async () => {
    const mockup = await generate(html('<button data-accion="RF-99.crear">Crear</button>'));
    expect(mockup.enlaces[0].estado).toBe('invalido');
    expect(mockup.advertencias_validacion.join(' ')).toContain('RF-99');
    expect(mockup.errores_validacion.join(' ')).not.toContain('RF-99');
  });

  test('un mockup guardado antes de este cambio no gana una clave `enlaces` (la huella del frontend no cambia)', () => {
    const legacyDoc = new DisenoModel({ proyecto_id: '507f1f77bcf86cd799439011', mockups: [{ nombre_pantalla: 'salas', preview_code: '<html></html>' }] });
    expect(legacyDoc.toJSON().mockups[0]).not.toHaveProperty('enlaces');
  });

  test('el esquema persiste `enlaces` de forma aditiva', () => {
    const path = DisenoModel.schema.path('mockups').schema.path('enlaces');
    expect(path).toBeTruthy();
    expect(DisenoModel.schema.path('mockups').schema.path('estado_calidad').enumValues).toEqual(['valido', 'advertencia', 'invalido']);
  });
});

describe('enlaces de mockups: edición manual', () => {
  const build = (extra = {}) => {
    const guardarOActualizar = jest.fn().mockResolvedValue({});
    const useCase = new ActualizarMockupManual({
      disenoRepository: { obtenerPorProyecto: async () => ({ mockups: [{ nombre_pantalla: 'salas', version: 1, preview_code: legacy, enlaces: [] }] }), guardarOActualizar },
      ...extra
    });
    return { useCase, guardarOActualizar };
  };

  test('con repositorios de requisitos y diagramas valida y guarda los enlaces del HTML editado', async () => {
    const { useCase, guardarOActualizar } = build({
      requerimientoRepository: { listarPorProyecto: async () => requerimientos },
      diagramaRepository: { listarPorProyecto: async () => [diagram] }
    });
    const updated = await useCase.ejecutar({ proyectoId: 'p1', nombrePantalla: 'salas', previewCode: html('<form><input name="nombre"><input name="buscar"><button data-accion="RF-01.crear">Crear</button></form>') });
    expect(updated.enlaces).toEqual([expect.objectContaining({ estado: 'valido', campos_desconocidos: ['buscar'] })]);
    expect(updated.advertencias_validacion.join(' ')).toContain('buscar');
    expect(guardarOActualizar.mock.calls[0][1].mockups[0].enlaces).toHaveLength(1);
  });

  test('comportamiento previo: sin repositorios adicionales no valida enlaces y no falla', async () => {
    const { useCase } = build();
    const updated = await useCase.ejecutar({ proyectoId: 'p1', nombrePantalla: 'salas', previewCode: bound });
    expect(updated.version).toBe(2);
    expect(updated.estado).toBe('editado');
    expect(updated.enlaces).toEqual([]);
  });
});

describe('MockupBindingService', () => {
  const service = new MockupBindingService();

  test('el contrato sale del diagrama de dominio aprobado y detecta campos inexistentes', () => {
    const contrato = service.contrato({ proyecto: { nombre: 'Demo' }, requerimientos, diagramas: [diagram] });
    const result = service.evaluar({ html: html('<form><input name="nombre"><input name="capacidad"><button data-accion="RF-01.crear">Crear</button></form>'), requerimientos, contrato });
    expect(result.enlaces[0].campos_desconocidos).toEqual(['capacidad']);
  });

  test('sin diagrama aprobado no se advierten los campos (esquema genérico)', () => {
    const contrato = service.contrato({ proyecto: { nombre: 'Demo' }, requerimientos, diagramas: [] });
    const result = service.evaluar({ html: html('<form><input name="lo_que_sea"><button data-accion="RF-01.crear">Crear</button></form>'), requerimientos, contrato });
    expect(result.advertencias).toEqual([]);
  });

  test('si no se puede construir el contrato devuelve null y evaluar sigue funcionando', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(service.contrato({ proyecto: null, requerimientos: null, diagramas: null })).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect(service.evaluar({ html: bound, requerimientos, contrato: null }).enlaces).toHaveLength(1);
  });
});
