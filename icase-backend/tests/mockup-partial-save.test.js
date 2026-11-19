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
  // Estas pruebas describen el modo de una pantalla a la vez; el modo en paralelo se prueba más abajo.
  beforeAll(() => { process.env.MOCKUP_CONCURRENCY = '1'; });
  afterAll(() => { delete process.env.MOCKUP_CONCURRENCY; });

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

describe('generación en paralelo', () => {
  const arbolGrande = ['@startwbs', '* Sistema', '** Aplicación Web Interna', '*** Módulo', ...Array.from({ length: 8 }, (_, i) => `**** Pantalla de listado ${i + 1}`), '@endwbs'].join(String.fromCharCode(10));
  const armarGrande = (generarMockups) => {
    const { casoUso, guardados, disenoRepository } = armar(generarMockups);
    casoUso.diagramaRepository.listarPorProyecto = async () => [{ tipo: 'arbol_navegacion', aprobado: true, codigo_plantuml: arbolGrande }];
    return { casoUso, guardados, disenoRepository, slugs: () => casoUso._extraerPantallasDelArbol(arbolGrande).map((p) => p.slug) };
  };
  const respuesta = (pantallas) => ({ mockups: [{ nombre_pantalla: pantallas[0], tipo: 'otro', preview_code: html(pantallas[0]) }], proveedorUsado: 'x', advertencias: [] });
  afterEach(() => { delete process.env.MOCKUP_CONCURRENCY; });

  test('con concurrencia 3 hay como máximo 3 pantallas a la vez, salen todas y tarda bastante menos que de una en una', async () => {
    let activas = 0; let maximo = 0;
    const ia = jest.fn(async ({ pantallas }) => {
      activas += 1; maximo = Math.max(maximo, activas);
      await new Promise((resolve) => setTimeout(resolve, 60));
      activas -= 1;
      return respuesta(pantallas);
    });
    const medir = async (concurrencia) => {
      process.env.MOCKUP_CONCURRENCY = String(concurrencia);
      maximo = 0;
      const { casoUso, slugs } = armarGrande(ia);
      const inicio = Date.now();
      const resultado = await casoUso.ejecutar({ proyectoId: 'p', pantallas: slugs() });
      return { ms: Date.now() - inicio, maximo, total: resultado.mockups.length };
    };
    const serie = await medir(1);
    const paralelo = await medir(3);
    expect(serie.maximo).toBe(1);
    expect(paralelo.maximo).toBe(3);
    expect(paralelo.total).toBe(8);
    expect(paralelo.ms).toBeLessThan(serie.ms * 0.7);
  });

  test('un fallo en una pantalla no detiene a las demás y queda constancia', async () => {
    process.env.MOCKUP_CONCURRENCY = '4';
    const ia = jest.fn(async ({ pantallas }) => {
      if (pantallas[0].endsWith('-3')) throw new Error('límite de cuota');
      await new Promise((resolve) => setTimeout(resolve, 10));
      return respuesta(pantallas);
    });
    const { casoUso, slugs } = armarGrande(ia);
    const resultado = await casoUso.ejecutar({ proyectoId: 'p', pantallas: slugs() });
    expect(resultado.mockups).toHaveLength(7);
    expect(resultado.advertencias.join(' ')).toMatch(/falló: límite de cuota/);
  });

  test('los guardados parciales no se solapan y el último contiene todo lo generado', async () => {
    process.env.MOCKUP_CONCURRENCY = '4';
    const ia = jest.fn(async ({ pantallas }) => { await new Promise((resolve) => setTimeout(resolve, 5)); return respuesta(pantallas); });
    const { casoUso, guardados, disenoRepository, slugs } = armarGrande(ia);
    let simultaneos = 0; let maximo = 0;
    const original = disenoRepository.guardarOActualizar.getMockImplementation();
    disenoRepository.guardarOActualizar.mockImplementation(async (...args) => { simultaneos += 1; maximo = Math.max(maximo, simultaneos); await new Promise((resolve) => setTimeout(resolve, 15)); simultaneos -= 1; return original(...args); });
    await casoUso.ejecutar({ proyectoId: 'p', pantallas: slugs() });
    expect(maximo).toBe(1);
    expect(guardados.at(-1)).toHaveLength(8);
    expect(guardados.length).toBeLessThan(8 + 1); // se unifican: no uno por pantalla
  });

  test('una edición (con instrucción del usuario) va de una en una aunque haya concurrencia', async () => {
    process.env.MOCKUP_CONCURRENCY = '4';
    let activas = 0; let maximo = 0;
    const ia = jest.fn(async ({ pantallas }) => { activas += 1; maximo = Math.max(maximo, activas); await new Promise((resolve) => setTimeout(resolve, 10)); activas -= 1; return respuesta(pantallas); });
    const { casoUso, slugs } = armarGrande(ia);
    await casoUso.ejecutar({ proyectoId: 'p', pantallas: slugs().slice(0, 3), insumoAdicional: 'Cambia el título' });
    expect(maximo).toBe(1);
  });
});
