const Generate = require('../src/core/use-cases/GenerarMockups');
const html = content => `<!DOCTYPE html><html><head><style>body{color:black}</style></head><body><main>${content}</main></body></html>`;
const rf = [{ identificador: 'RF-01', tipo: 'RF', aprobado: true, nombre: 'Validación de código QR', descripcion: 'El operador debe escanear el código QR.', actores: ['Operador'], prioridad: 'Media' }];
const screen = { nombre_pantalla: 'qr', roles: ['Operador'], rf_trazabilidad: ['RF-01'], version: 3, preview_code: html('<h1>Código QR</h1><input placeholder="Código"><button>Validar</button>') };
function fixture(existing = [screen], candidate = null) {
  const repo = { obtenerPorProyecto: jest.fn(async () => ({ mockups: existing, updatedAt: new Date('2026-01-01') })), guardarOActualizar: jest.fn(async () => ({})), guardarSiNoCambio: jest.fn(async () => ({})) };
  const ai = { generarMockups: jest.fn(async () => ({ mockups: candidate ? [candidate] : [] })) };
  const project = { obtenerPorId: async () => ({ nombre: 'Prueba', estado_fase: 'mockups_aprobados' }), actualizarEstadoFase: jest.fn() };
  const useCase = new Generate({ proyectoRepository: project, requerimientoRepository: { listarPorProyecto: async () => rf }, diagramaRepository: { listarPorProyecto: async () => [{ tipo: 'arbol_navegacion', codigo_plantuml: '@startwbs\n* Prueba\n** QR\n** Inicio\n@endwbs' }] }, disenoRepository: repo, mockupIaService: ai });
  return { useCase, repo, ai, project };
}
describe('reparación controlada de mockups', () => {
  test('corrige solo la pantalla afectada, conserva otras y guarda historial', async () => {
    const untouched = { nombre_pantalla: 'inicio', version: 7, preview_code: html('<h1>Inicio</h1>') };
    const candidate = { ...screen, preview_code: html('<h1>Código QR</h1><input placeholder="Código"><button>Validar</button><button>Escanear QR</button>') };
    const { useCase, repo, ai, project } = fixture([untouched, screen], candidate);
    const result = await useCase.ejecutar({ proyectoId: 'p', soloReparar: true });
    expect(ai.generarMockups).toHaveBeenCalledTimes(1);
    expect(ai.generarMockups.mock.calls[0][0].pantallas).toEqual(['qr']);
    expect(ai.generarMockups.mock.calls[0][0].insumoAdicional).toContain(screen.preview_code);
    expect(result.mockups.find(m => m.nombre_pantalla === 'inicio')).toEqual(untouched);
    expect(result.mockups.map(m => m.nombre_pantalla)).toEqual(['inicio', 'qr']);
    const repaired = result.mockups.find(m => m.nombre_pantalla === 'qr');
    expect(repaired.version).toBe(4);
    expect(repaired.historial_versiones).toContainEqual(expect.objectContaining({ version: 3, preview_code: screen.preview_code }));
    expect(repo.guardarSiNoCambio).toHaveBeenCalledWith('p', expect.objectContaining({ aprobado: false }), expect.any(Date));
    expect(project.actualizarEstadoFase).toHaveBeenCalledWith('p', 'mockups_pendientes');
  });
  test.each(['identidad', 'truncado', 'sin mejora', 'pérdida de campo'])('conserva el original si la propuesta falla: %s', async kind => {
    const candidate = { ...screen };
    if (kind === 'identidad') candidate.nombre_pantalla = 'otra';
    if (kind === 'truncado') candidate.preview_code = '<html><body>incompleto';
    if (kind === 'pérdida de campo') candidate.preview_code = html('<h1>Código QR</h1><button>Validar</button><button>Escanear</button>');
    const { useCase, repo, ai } = fixture([screen], candidate);
    const result = await useCase.ejecutar({ proyectoId: 'p', soloReparar: true });
    expect(result.mockups).toEqual([screen]);
    expect(ai.generarMockups).toHaveBeenCalledTimes(1);
    expect(repo.guardarSiNoCambio).not.toHaveBeenCalled();
    expect(repo.guardarOActualizar).not.toHaveBeenCalled();
  });
  test('no genera nada si no existen pendientes y protege ediciones manuales', async () => {
    const { useCase, ai } = fixture([{ ...screen, estado: 'editado' }]);
    const result = await useCase.ejecutar({ proyectoId: 'p', soloReparar: true });
    expect(result.totalProcesados).toBe(0);
    expect(ai.generarMockups).not.toHaveBeenCalled();
  });
  test('descarta toda propuesta ante una escritura concurrente', async () => {
    const candidate = { ...screen, preview_code: html('<h1>Código QR</h1><input placeholder="Código"><button>Validar</button><button>Escanear</button>') };
    const { useCase, repo, project } = fixture([screen], candidate);
    repo.guardarSiNoCambio.mockResolvedValue(null);
    await expect(useCase.ejecutar({ proyectoId: 'p', soloReparar: true })).rejects.toThrow('cambió durante la reparación');
    expect(project.actualizarEstadoFase).not.toHaveBeenCalled();
  });
  test('rechaza cambios de rol y limita el historial conservado', () => {
    const { useCase } = fixture();
    expect(useCase.repairService.accepts(screen, { ...screen, roles: ['Administrador'] }, rf).valido).toBe(false);
    const previous = { ...screen, historial_versiones: Array.from({ length: 10 }, (_, version) => ({ version })) };
    const merged = useCase._mergeMockups([previous], [{ ...screen, preview_code: html('Nuevo') }], ['qr'])[0];
    expect(merged.historial_versiones).toHaveLength(10);
    expect(merged.historial_versiones.at(-1).preview_code).toBe(screen.preview_code);
  });
  test('limita las reparaciones a cinco pantallas sin generar un lote adicional', async () => {
    const existing = Array.from({ length: 6 }, (_, i) => ({ nombre_pantalla: 'p-' + i, preview_code: '<html>truncado', version: 1 }));
    const { useCase, ai } = fixture(existing);
    useCase._pantallasDelProyecto = () => ({ pantallas: existing.map(m => ({ slug: m.nombre_pantalla, nombre: m.nombre_pantalla, ruta: ['Prueba', m.nombre_pantalla], roles: ['Operador'], shell: 'general' })) });
    await useCase.ejecutar({ proyectoId: 'p', soloReparar: true });
    expect(ai.generarMockups).toHaveBeenCalledTimes(5);
  });
});
