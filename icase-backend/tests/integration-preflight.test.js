const {check}=require('../src/infrastructure/templates/auth/integration-preflight');
const operations=[{key:'rf-01',schema:{properties:{amount:{type:'integer'},lat:{type:'number'},lng:{type:'number'}}}}];
const env={STRIPE_SECRET_KEY:'sk_test_dummy',STRIPE_WEBHOOK_SECRET:'whsec_dummy',PAYMENT_NAMESPACE:'isolated-test-project',PAYMENT_RETURN_URL:'https://app.test',PAYMENT_BINDINGS:JSON.stringify({'rf-01':{amountField:'amount',currency:'usd'}})};
describe('preflight local de integraciones sin secretos ni red',()=>{
 test('configuración test correcta no afirma validación externa',()=>{
  const result=check({enabled:['pagos_prueba'],operations,env});
  expect(result.ready).toBe(true);expect(result.scope).toBe('configuracion_local_sin_contactar_proveedores');
  expect(JSON.stringify(result)).not.toContain('sk_test_dummy');expect(JSON.stringify(result)).not.toContain('whsec_dummy');
 });
 test.each(['sk_live_secret',''])('rechaza clave live o faltante',key=>expect(check({enabled:['pagos_prueba'],operations,env:{...env,STRIPE_SECRET_KEY:key}}).ready).toBe(false));
 test('bloquea campos inventados y configuraciones JSON inválidas sin mostrar su contenido',()=>{
  for(const value of ['{"rf-01":{"amountField":"inventado","currency":"usd"}}','secret-not-json','[]']){
   const result=check({enabled:['pagos_prueba'],operations,env:{...env,PAYMENT_BINDINGS:value}});
   expect(result.ready).toBe(false);expect(JSON.stringify(result)).not.toContain(value);
  }
 });
 test('OIDC exige identidad explícita y origen compartido por la cookie',()=>{
  const oidc={OIDC_ISSUER:'https://id.test',OIDC_CLIENT_ID:'test',OIDC_REDIRECT_URI:'https://app.test/api/integrations/sso/callback',OIDC_APP_URL:'https://app.test',OIDC_SUBJECTS:'{"https://id.test":{"sub":"local@test"}}'};
  expect(check({enabled:['sso_oidc'],env:oidc}).ready).toBe(true);
  expect(check({enabled:['sso_oidc'],env:{...oidc,OIDC_APP_URL:'https://other.test'}}).ready).toBe(false);
 });
 test('solo evalúa módulos seleccionados y deja cámara como prueba manual',()=>{
  expect(check({enabled:[],env:{}}).results).toEqual([]);
  expect(check({enabled:['camara_qr'],env:{}}).results[0].status).toBe('pendiente');
 });
 test('mapas valida coordenadas y plantilla sin inventar ubicaciones',()=>{
  const maps={MAP_FIELDS:'{"rf-01":{"latitude":"lat","longitude":"lng"}}',MAP_TILE_URL:'https://tiles.test/{z}/{x}/{y}.png',MAP_ATTRIBUTION:'Proveedor de prueba'};
  expect(check({enabled:['mapas'],operations,env:maps}).ready).toBe(true);
  expect(check({enabled:['mapas'],operations,env:{...maps,MAP_FIELDS:'{}'}}).ready).toBe(false);
 });
});
