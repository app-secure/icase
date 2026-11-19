const GenerarMockups = require('../src/core/use-cases/GenerarMockups');

const arbol = '@startwbs\n* Sistema\n** Aplicación Web Interna\n*** Módulo\n**** Pantalla de cobros\n**** Pantalla de menú\n**** Pantalla de reportes\n@endwbs';
const html = (texto) => `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body><main><h1>${texto}</h1></main></body></html>`;

const armar = (generarMockups) => {
  const guardados = [];
  const disenoRepository = {
    obtenerPorProyecto: jest.fn(async () => ({ mockups: [] })),
    guardarOActualizar: jest.fn(async (id, datos) => { guardados.push(datos.mockups.map((m) => m.nombre_pantalla)); return datos; })
  };
  const casoUso = new GenerarMockups({
    proyectoRepository: { obtenerPorId: async () => ({ id: 'p', nombre: 'Demo' }) },
    requerimientoRepository: { listarPorProyecto: async () => [{ identificador: 'RF-01', nombre: 'Cobrar', tipo: 'RF', prioridad: 'Alta', descripcion: 'Registrar cobros' }] },
    diagramaRepository: { listarPorProyecto: async () => [{ tipo: 'arbol_navegacion', aprobado: true, codigo_plantuml: arbol }] },
    disenoRepository,
    mockupIaService: { generarMockups }
  });
  return { casoUso, guardados, disenoRepository };
};

describe('guardado de mockups lote a lote', () => {
  test('cada lote se guarda al terminar, antes de empezar el siguiente', async () => {
    let guardadosAlLlamar = [];
    let casoUso; let guardados;
    const ia = jest.fn(async ({ pantallas }) => { guardadosAlLlamar.push(guardados.length); return { mockups: [{ nombre_pantalla: pantallas[0], tipo: 'otro', preview_code: html(pantallas[0]) }], proveedorUsado: 'x', advertencias: [] }; });
    ({ casoUso, guardados } = armar(ia));
    const slugs = casoUso._extraerPantallasDelArbol(arbol).map((p) => p.slug);
    const resultado = await casoUso.ejecutar({ proyectoId: 'p', pantallas: slugs });
    // 1.er lote: nada guardado aún; 2.º: ya hay uno; 3.º: ya hay dos.
    expect(guardadosAlLlamar).toEqual([0, 1, 2]);
    expect(guardados.at(-1)).toHaveLength(3);
    expect(resultado.mockups).toHaveLength(3);
  });

  test('si el servidor cae durante un lote posterior, lo generado antes ya está guardado', async () => {
    let llamadas = 0; let guardados;
    const ia = jest.fn(async ({ pantallas }) => {
      llamadas += 1;
      if (llamadas === 3) throw Object.assign(new Error('proceso interrumpido'), { fatal: true });
      return { mockups: [{ nombre_pantalla: pantallas[0], tipo: 'otro', preview_code: html(pantallas[0]) }], proveedorUsado: 'x', advertencias: [] };
    });
    const armado = armar(ia); guardados = armado.guardados;
    const slugs = armado.casoUso._extraerPantallasDelArbol(arbol).map((p) => p.slug);
    const resultado = await armado.casoUso.ejecutar({ proyectoId: 'p', pantallas: slugs });
    expect(guardados.at(-1)).toHaveLength(2);
    expect(resultado.advertencias.join(' ')).toMatch(/Lote 3\/3 falló: proceso interrumpido/);
  });

  test('un fallo al guardar el avance parcial no detiene la generación', async () => {
    const ia = jest.fn(async ({ pantallas }) => ({ mockups: [{ nombre_pantalla: pantallas[0], tipo: 'otro', preview_code: html(pantallas[0]) }], proveedorUsado: 'x', advertencias: [] }));
    const { casoUso, disenoRepository } = armar(ia);
    let intentos = 0;
    disenoRepository.guardarOActualizar.mockImplementation(async (id, datos) => { intentos += 1; if (intentos === 1) throw new Error('Mongo no disponible'); return datos; });
    const slugs = casoUso._extraerPantallasDelArbol(arbol).map((p) => p.slug);
    const resultado = await casoUso.ejecutar({ proyectoId: 'p', pantallas: slugs });
    expect(resultado.mockups).toHaveLength(3);
    expect(resultado.advertencias.join(' ')).toContain('No se pudo guardar el avance parcial tras el lote 1: Mongo no disponible');
  });
});
