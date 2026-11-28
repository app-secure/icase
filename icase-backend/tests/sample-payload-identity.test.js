const samplePayload = require('../src/infrastructure/services/SamplePayload');

// La verificación aislada crea los registros padre de cada alta. Una referencia a la entidad de cuentas (el vendedor de una venta)
// no se crea como dato: es la cuenta de quien actúa (caso Ventas: el vendedor no puede crear «usuarios» por RF-12).
const createValidRecord = new Function(`${samplePayload.runtimeSource()}\nreturn createValidRecord;`)();
const usuario = { type: 'object', title: 'Usuario', properties: { id: { type: 'string', readOnly: true }, nombre: { type: 'string' } }, required: ['nombre'] };
const venta = { type: 'object', title: 'Venta', properties: { id: { type: 'string', readOnly: true }, total: { type: 'number' }, usuario_id: { type: 'string', 'x-references': 'Usuario' } }, required: ['total', 'usuario_id'] };
const operations = [
  { id: 'RF-12', key: 'rf-12', identity: 'login', schema: usuario, collectionPath: '/api/operations/rf-12', methods: ['GET'] },
  { id: 'RF-01', key: 'rf-01', schema: venta, rules: [{ tipo: 'requerido', campo: 'usuario_id', id: 'RN-01' }], collectionPath: '/api/operations/rf-01', methods: ['GET', 'POST'] }
];

test('el vendedor de una venta es la cuenta de quien actúa; no se intenta crear un usuario', async () => {
  const calls = [];
  const api = async (path, method, body) => {
    calls.push([method, path, body]);
    if (path === '/api/auth/me') return { status: 200, data: { usuario: { id: 7, rol: 'vendedor' } } };
    if (path === '/api/operations/rf-12') return { status: 403, data: { message: 'No tienes permiso' } };
    return { status: 201, data: { id: '99', ...body } };
  };
  const created = await createValidRecord(api, operations, operations[1], [], 0);
  expect(created.body.usuario_id).toBe('7');
  expect(calls.some(([method, path]) => method === 'POST' && path === '/api/operations/rf-12')).toBe(false);
});

// Caso Préstamo de herramientas: la solicitud es del estudiante, pero la herramienta que referencia solo la crea el encargado. La
// verificación de propiedad crea los padres con otro usuario (parentApi); sin él, el estudiante recibía 403 al crear la herramienta.
test('los registros padre se crean con parentApi cuando el rol del registro no puede crearlos', async () => {
  const herramienta = { type: 'object', title: 'Herramienta', properties: { id: { type: 'string', readOnly: true }, nombre: { type: 'string' } }, required: ['nombre'] };
  const solicitud = { type: 'object', title: 'SolicitudPrestamo', properties: { id: { type: 'string', readOnly: true }, herramienta_id: { type: 'string', 'x-references': 'Herramienta' } }, required: ['herramienta_id'] };
  const prestamos = [
    { id: 'RF-01', key: 'rf-01', schema: herramienta, rules: [], collectionPath: '/api/operations/rf-01', methods: ['GET', 'POST'] },
    { id: 'RF-03', key: 'rf-03', schema: solicitud, rules: [{ tipo: 'requerido', campo: 'herramienta_id', id: 'RN-01' }], collectionPath: '/api/operations/rf-03', methods: ['GET', 'POST'] }
  ];
  const estudiante = async (path, method, body) => (path === '/api/operations/rf-01' ? { status: 403, data: { message: 'No tienes permiso' } } : { status: 201, data: { id: 's1', ...body } });
  const calls = [];
  const encargado = async (path, method, body) => { calls.push([method, path]); return { status: 201, data: { id: 'h1', ...body } }; };
  const created = await createValidRecord(estudiante, prestamos, prestamos[1], [], 0, encargado);
  expect(created.body.herramienta_id).toBe('h1');
  expect(calls).toEqual([['POST', '/api/operations/rf-01']]);
  // Sin parentApi se conserva el comportamiento anterior: el padre lo crea el mismo usuario.
  await expect(createValidRecord(estudiante, prestamos, prestamos[1], [], 0)).rejects.toThrow(/crear respondió 403/);
});

// La búsqueda por texto usa los 4 primeros caracteres del valor de ejemplo, y otras pruebas dejan muchos registros que lo comparten: el nuevo
// puede quedar en la segunda página del resultado. La comprobación debe recorrer las páginas y no dar por perdido el registro.
test('la búsqueda por texto encuentra el registro nuevo aunque no esté en la primera página', async () => {
  const exerciseOperation = new Function(`${samplePayload.runtimeSource()}\nreturn exerciseOperation;`)();
  const herramienta = { type: 'object', title: 'Herramienta', properties: { id: { type: 'string', readOnly: true }, nombre: { type: 'string' } }, required: ['nombre'] };
  const operation = { id: 'RF-01', key: 'rf-01', schema: herramienta, rules: [{ tipo: 'requerido', campo: 'nombre', id: 'RN-01' }], collectionPath: '/api/operations/rf-01', methods: ['GET', 'POST'] };
  const rows = [];
  const api = async (path, method = 'GET', body) => {
    if (method === 'POST' && !body.nombre) return { status: 422, data: { message: 'El nombre es obligatorio.', details: [{ regla: 'RN-01' }] } };
    if (method === 'POST') { const row = { id: String(rows.length + 1), data: { ...body } }; rows.push(row); return { status: 201, data: row }; }
    const url = new URL(path, 'http://x');
    const page = Number(url.searchParams.get('page') || 1);
    const search = url.searchParams.get('search');
    // El listado sin filtros devuelve todo; el resultado de una búsqueda se pagina de 2 en 2 (como el servidor, pero más corto).
    const limit = Number(url.searchParams.get('limit') || (search ? 2 : 1000));
    const matching = search ? rows.filter((row) => JSON.stringify(row.data).includes(search)) : rows;
    const slice = matching.slice((page - 1) * limit, page * limit);
    return { status: 200, data: { data: slice, pagination: { page, limit, total: matching.length, total_pages: Math.ceil(matching.length / limit) } } };
  };
  // Antes de la prueba ya hay registros con el mismo valor de ejemplo: el nuevo queda más allá de la primera página.
  for (let index = 0; index < 5; index += 1) await api('/api/operations/rf-01', 'POST', { nombre: 'valor-nombre', verification: 'isolated' });
  await expect(exerciseOperation(api, [operation], operation)).resolves.not.toThrow();
});
