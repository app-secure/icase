const { startPlatform, token, ids } = require('./helpers/platform-fixture');
let platform;
const job = { id: ids.jobA, proyecto_id: ids.projectA, usuario_id: ids.userA, tipo: 'requisitos', estado: 'interrumpido', entrada_requisitos: { snapshot: 'old' } };
beforeAll(async () => {
  platform = await startPlatform({ env: { REQUIREMENTS_RESILIENT_ENABLED: 'true' }, repositoryOverrides: {
    projectMutationLease: { acquire: async () => ({ release: async () => {}, assert() {} }) },
    trabajoGeneracion: {
      obtenerPorId: async id => id === ids.jobA ? job : null,
      requirementsRecover: async () => {}, requirementsGet: async () => structuredClone(job),
      requirementsLatest: async () => structuredClone(job), requirementsClaim: async () => null,
      requirementsStart: async data => ({ created: false, job: { ...data, id: ids.jobA, estado: 'encolado' } })
    }
  } });
});
afterAll(async () => platform.close());
test('rutas nuevas exigen sesión y propiedad de proyecto y trabajo', async () => {
  expect((await platform.request('GET', `/proyectos/trabajos-requisitos/${ids.jobA}`)).status).toBe(401);
  expect((await platform.request('GET', `/proyectos/trabajos-requisitos/${ids.jobA}`, { auth: token(ids.userB) })).status).toBe(404);
  const owned = await platform.request('GET', `/proyectos/trabajos-requisitos/${ids.jobA}`, { auth: token(ids.userA) });
  expect(owned.status).toBe(200);
  expect(owned.json.entrada_requisitos).toBeUndefined();
  expect(owned.json.estado).toBe('interrumpido');
});
test('inicio devuelve 202, último es consultable y entrada obsoleta no reanuda', async () => {
  const auth = token(ids.userA);
  expect((await platform.request('POST', `/proyectos/${ids.projectA}/trabajos-requisitos`, { auth, body: {} })).status).toBe(202);
  expect((await platform.request('GET', `/proyectos/${ids.projectA}/trabajos-requisitos/ultimo`, { auth })).status).toBe(200);
  expect((await platform.request('POST', `/proyectos/trabajos-requisitos/${ids.jobA}/reanudar`, { auth, body: {} })).status).toBe(409);
});
