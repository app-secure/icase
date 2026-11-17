const FunctionalGateService = require('../src/core/services/FunctionalGateService');
const GestionarArtefactosCodigo = require('../src/core/use-cases/GestionarArtefactosCodigo');
const TestSuiteGenerator = require('../src/infrastructure/services/TestSuiteGenerator');

const file = (ruta, valor) => ({ ruta, contenido: typeof valor === 'string' ? valor : JSON.stringify(valor) });
const accion = (name, requisito = 'RF-04') => ({ name, type: 'consulta', method: 'GET', path: `/api/actions/${name}`, capability: 'rf-04', filters: [], output: ['numero'], requisito });

const entrega = ({ spec = true, operations, report = [], pantallas = [], tests = '' } = {}) => [
  file('backend/icase.manifest.json', {
    ...(spec ? { spec: { version: 1, actions: 1 } } : {}),
    operations: operations || [
      { id: 'RF-04', key: 'rf-04', name: 'Consulta de mesas', ...(spec ? { actions: [accion('listarMesas')] } : {}) },
      { id: 'RF-10', key: 'rf-10', name: 'Login', identity: 'login' }
    ]
  }),
  file('backend/GENERATION-REPORT.json', { requisitos: report }),
  file('frontend/icase.manifest.json', { pantallas }),
  file('tests/integration/actions.test.js', tests)
];

const puerta = new FunctionalGateService();
const ids = (resultado) => resultado.pendientes.map((item) => item.id);

describe('puerta de calidad funcional', () => {
  test('una entrega con operaciones probadas y sin cabos sueltos se aprueba', () => {
    const resultado = puerta.evaluar({ archivos: entrega({ tests: "test('listarMesas')", pantallas: [{ id: 'mesas', name: 'Mesas', origen: 'especificacion', especificacion: { operaciones: ['listarMesas'] } }] }) });
    expect(resultado.estado).toBe('aprobada');
    expect(resultado.hallazgos).toEqual([]);
  });

  test('sin especificación aprobada todos los RF son CRUD genérico: bloquea una sola vez', () => {
    const resultado = puerta.evaluar({ archivos: entrega({ spec: false }) });
    expect(ids(resultado)).toEqual(['espec_omitida:aplicacion']);
  });

  test('un RF sin operación confirmada bloquea; el de identidad no cuenta', () => {
    const operations = [{ id: 'RF-04', key: 'rf-04', name: 'Mesas' }, { id: 'RF-10', key: 'rf-10', name: 'Login', identity: 'login' }, { id: 'RF-20', key: 'rf-20', name: 'Soporte', support: true }];
    expect(ids(puerta.evaluar({ archivos: entrega({ operations }) }))).toEqual(['sin_operacion:RF-04']);
  });

  test('solo datos, botones sin operación y operaciones sin prueba bloquean con su ubicación', () => {
    const resultado = puerta.evaluar({ archivos: entrega({
      report: [{ id: 'RF-05', nombre: 'QR', nivel: 'solo_datos', motivos: ['No se genera: cámara.'] }, { id: 'RF-01', nombre: 'Menú', nivel: 'completo' }],
      pantallas: [{ id: 'menu', name: 'Menú', enlaces: { sin_enlace_total: 2, sin_enlace: ['Pagar', 'Imprimir'] } }]
    }) });
    expect(ids(resultado).sort()).toEqual(['botones_sin_operacion:menu', 'operacion_sin_prueba:listarMesas', 'solo_datos:RF-05']);
    expect(resultado.pendientes.every((item) => item.donde)).toBe(true);
    expect(resultado.pendientes.find((item) => item.codigo === 'botones_sin_operacion').mensaje).toContain('Pagar');
  });

  test('una pantalla construida desde la especificación no tiene botones sin operación', () => {
    const resultado = puerta.evaluar({ archivos: entrega({ tests: 'listarMesas', pantallas: [{ id: 'mesas', name: 'Mesas', origen: 'especificacion', enlaces: { sin_enlace_total: 3 }, especificacion: { operaciones: ['listarMesas'] } }] }) });
    expect(resultado.estado).toBe('aprobada');
  });

  test('una operación sin pantalla es solo un aviso', () => {
    const resultado = puerta.evaluar({ archivos: entrega({ tests: 'listarMesas', pantallas: [{ id: 'otra', name: 'Otra' }] }) });
    expect(resultado.estado).toBe('aprobada');
    expect(resultado.hallazgos[0]).toMatchObject({ codigo: 'operacion_sin_pantalla', severidad: 'aviso' });
  });

  test('un bloqueo aceptado explícitamente no frena; una aceptación vieja se descarta', () => {
    const archivos = entrega({ spec: false });
    const aceptado = puerta.evaluar({ archivos, excepciones: ['espec_omitida:aplicacion', 'sin_operacion:RF-99'] });
    expect(aceptado.estado).toBe('aprobada');
    expect(aceptado.excepciones).toEqual(['espec_omitida:aplicacion']);
    expect(puerta.evaluar({ archivos, excepciones: ['sin_operacion:RF-04'] }).estado).toBe('bloqueada');
  });

  test('exigir explica qué corregir y dónde', () => {
    expect(() => puerta.exigir({ archivos: entrega({ spec: false }) })).toThrow(/espec_omitida:aplicacion.*Corrígelo en: Planificación/s);
    expect(() => puerta.exigir({ archivos: [] })).toThrow(/manifiesto del backend/);
  });

});

describe('pruebas de las operaciones de negocio', () => {
  const contrato = { operations: [{ id: 'RF-04', key: 'rf-04', name: 'Mesas', collectionPath: '/api/operations/rf-04', itemPath: '/api/operations/rf-04/:id', methods: ['GET', 'POST', 'PATCH', 'DELETE'], schema: { type: 'object', properties: {} }, actions: [accion('listarMesas')] }], auth: { habilitada: false } };

  test('se genera un archivo con una prueba por operación y ejecutable', () => {
    const generador = new TestSuiteGenerator();
    const texto = generador._actionsIntegrationTest(contrato);
    expect(texto).toContain('exerciseAction(api, operations, action)');
    expect(texto).toContain('async function exerciseAction');
    expect(() => new (require('node:vm').SourceTextModule || Function)(texto.replace(/^import .*$/gm, ''))).not.toThrow();
    expect(generador._hasActions(contrato)).toBe(true);
    expect(generador._hasActions({ operations: [{ id: 'RF-1' }] })).toBe(false);
  });
});

describe('exerciseAction contra un backend simulado', () => {
  const samplePayload = require('../src/infrastructure/services/SamplePayload');
  const target = { id: 'RF-04', key: 'rf-04', collectionPath: '/api/operations/rf-04', itemPath: '/api/operations/rf-04/:id', methods: ['GET', 'POST', 'PATCH', 'DELETE'], rules: [],
    schema: { type: 'object', properties: { id: { type: 'string', readOnly: true }, numero: { type: 'integer' }, estado: { type: 'string', enum: ['LIBRE', 'OCUPADA'] } } } };

  const backend = ({ ocupadaDirecto = false } = {}) => {
    const rows = new Map();
    let next = 1;
    return async (path, method, body) => {
      const item = /^\/api\/operations\/rf-04\/([^/]+)$/.exec(path);
      const act = /^\/api\/actions\/([a-z-]+)(?:\/([^/]+))?$/.exec(path);
      if (path === '/api/operations/rf-04' && method === 'POST') { const id = String(next++); rows.set(id, { ...body }); return { status: 201, data: { id } }; }
      if (item && method === 'PATCH') { const row = rows.get(item[1]); if (!row) return { status: 404, data: {} }; Object.assign(row, body); return { status: 200, data: { id: item[1], ...row } }; }
      if (item && method === 'DELETE') return { status: rows.delete(item[1]) ? 200 : 404, data: {} };
      if (item && method === 'GET') return rows.has(item[1]) ? { status: 200, data: { id: item[1], ...rows.get(item[1]) } } : { status: 404, data: {} };
      if (act && act[1] === 'listar-mesas') return { status: 200, data: [...rows].map(([id, row]) => ({ id, numero: row.numero })) };
      if (act && act[1] === 'ocupar-mesa') {
        const row = rows.get(act[2]);
        if (!row) return { status: 404, data: {} };
        if (row.estado !== 'LIBRE' && !ocupadaDirecto) return { status: 409, data: {} };
        row.estado = 'OCUPADA';
        return { status: 200, data: { id: act[2], ...row } };
      }
      return { status: 404, data: {} };
    };
  };
  const listar = { name: 'listarMesas', type: 'consulta', method: 'GET', path: '/api/actions/listar-mesas', capability: 'rf-04', filters: [], output: ['numero'], inputs: [] };
  const ocupar = { name: 'ocuparMesa', type: 'transicion', method: 'POST', path: '/api/actions/ocupar-mesa/:id', byId: true, capability: 'rf-04', filters: [], output: [], inputs: [], transition: { campo: 'estado', de: ['LIBRE'], a: 'OCUPADA' } };

  test('una consulta y una transición correctas pasan', async () => {
    await expect(samplePayload.exerciseAction(backend(), [target], listar)).resolves.toBeUndefined();
    await expect(samplePayload.exerciseAction(backend(), [target], ocupar)).resolves.toBeUndefined();
  });

  test('detecta una transición que no valida el estado de origen', async () => {
    await expect(samplePayload.exerciseAction(backend({ ocupadaDirecto: true }), [target], ocupar)).rejects.toThrow(/409/);
  });

  test('detecta una consulta que devuelve campos no declarados', async () => {
    const api = async (path, method, body) => (path.startsWith('/api/actions/') ? { status: 200, data: [{ id: '1', numero: 1, secreto: 'x' }] } : backend()(path, method, body));
    await expect(samplePayload.exerciseAction(api, [target], { ...listar, filters: [{ campo: 'x', origen: 'sesion', valor: 'usuario.id' }] })).rejects.toThrow(/secreto/);
  });
});

describe('aceptación explícita de bloqueos', () => {
  const montar = () => {
    let plan = { etapas: [], puerta_funcional: null };
    const artefactos = { codigo_backend: { archivos: entrega({ spec: false }) } };
    const useCase = new GestionarArtefactosCodigo({
      proyectoRepository: {},
      planCodificacionRepository: { obtenerPorProyecto: async () => plan, guardar: jest.fn(async (_id, cambios) => { plan = { ...plan, ...cambios }; return plan; }) },
      artefactoRepository: { obtenerUltimo: async (_id, tipo) => artefactos[tipo] || null }
    });
    return { useCase, plan: () => plan };
  };

  test('la evaluación refleja los bloqueos y, tras aceptarlos, la entrega queda habilitada', async () => {
    const { useCase, plan } = montar();
    expect((await useCase.evaluarPuertaFuncional('p1')).estado).toBe('bloqueada');
    const resultado = await useCase.aceptarPuertaFuncional({ proyectoId: 'p1', excepciones: ['espec_omitida:aplicacion'], aceptadoPor: 'u1' });
    expect(resultado.estado).toBe('aprobada');
    expect(plan().puerta_funcional).toMatchObject({ excepciones: ['espec_omitida:aplicacion'], aceptado_por: 'u1' });
  });

  test('no acepta identificadores que no son bloqueos actuales', async () => {
    const { useCase } = montar();
    await expect(useCase.aceptarPuertaFuncional({ proyectoId: 'p1', excepciones: ['sin_operacion:RF-99'] })).rejects.toThrow(/No existe un bloqueo/);
    await expect(useCase.aceptarPuertaFuncional({ proyectoId: 'p1', excepciones: 'todo' })).rejects.toThrow(/lista/);
  });

  test('sin artefactos no hay nada que evaluar', async () => {
    const useCase = new GestionarArtefactosCodigo({ proyectoRepository: {}, planCodificacionRepository: { obtenerPorProyecto: async () => null }, artefactoRepository: { obtenerUltimo: async () => null } });
    expect((await useCase.evaluarPuertaFuncional('p1')).estado).toBe('sin_artefactos');
  });
});
