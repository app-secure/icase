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
