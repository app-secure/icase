const fs=require('node:fs/promises'),sync=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const ModuleService=require('../src/core/services/ModuleService');
const Backend=require('../src/infrastructure/services/GenericBackendGenerator');
const Access=require('../src/core/services/AccessControlService');
const support=require('../src/infrastructure/templates/data-layer/store-support');
const QR=require('qrcode'),decode=require('jsqr');
function load(name,overrides={}){
 const mod={exports:{}};new Function('require','module','exports',sync.readFileSync(path.join(__dirname,'../src/infrastructure/templates/auth',name),'utf8'))(name=>overrides[name]||(name==='../data/store-support'?support:require(name)),mod,mod.exports);return mod.exports;
}
const storage=load('integration-storage.js').storage;
describe('integraciones opcionales y credenciales',()=>{
 const requirements=[{identificador:'RF-01',nombre:'Gestionar registros',tipo:'RF',aprobado:true}];
 const modules={modo:'personalizado',modulos:['pagos_prueba','sso_oidc','mapas','camara_qr'].map(id=>({id,activo:true}))};
 test('no activa proveedores automáticamente y valida dependencia Redis',()=>{
  expect(new ModuleService().activos()).toEqual(['formularios_tipados','paginacion_busqueda','datos_iniciales']);
  expect(new ModuleService().validar({modo:'personalizado',modulos:[{id:'eventos_replicas',activo:true}]}).errores.join(' ')).toContain('eventos_cambios');
 });
 test.each(['Express','NestJS'])('genera rutas, validación OIDC y contrato sin credenciales: %s',backend=>{
  const access=new Access().proponer({requerimientos:requirements}).valor;
  const files=new Backend().generate({proyecto:{nombre:'Prueba'},requirements,stack:{backend,base_datos:'PostgreSQL'},access,modules});
  expect(files.find(file=>file.ruta==='backend/src/integrations/integration-payments.js')).toBeTruthy();
  expect(files.find(file=>file.ruta==='backend/tools/check-integrations.cjs').contenido).toContain("require('./integration-preflight.cjs')");
  expect(files.find(file=>file.ruta==='backend/tools/integration-preflight.cjs')).toBeTruthy();
  expect(JSON.parse(files.find(file=>file.ruta==='backend/package.json').contenido).scripts['check:integrations']).toBe('node tools/check-integrations.cjs');
  expect(JSON.parse(files.find(file=>file.ruta==='backend/package.json').contenido).dependencies.jose).toBe('6.2.15');
  expect(files.find(file=>file.ruta==='backend/src/auth/auth-core.js').contenido).toContain('return { issue, init, login,');
  expect(files.find(file=>file.ruta==='backend/.env.example').contenido).toContain('STRIPE_SECRET_KEY=\n');
  expect(()=>new Backend().generate({proyecto:{nombre:'Prueba'},requirements,stack:{backend,base_datos:'PostgreSQL'},modules})).toThrow('JWT');
 });
});
describe('checkout y webhook',()=>{
 let root,ledger,service,env,fetcher;
 beforeEach(async()=>{
  root=await fs.mkdtemp(path.join(os.tmpdir(),'icase-payment-'));ledger=storage(root);
  env={NODE_ENV:'test',STRIPE_SECRET_KEY:'sk_test_local',STRIPE_WEBHOOK_SECRET:'whsec_local',PAYMENT_NAMESPACE:'payment-local-tests',STRIPE_API_BASE:'http://provider.test',PAYMENT_RETURN_URL:'http://app.test',PAYMENT_BINDINGS:JSON.stringify({'rf-01':{amountField:'importe',currency:'usd'}})};
  fetcher=jest.fn(async()=>({ok:true,json:async()=>({id:'cs_test_1',livemode:false,url:'http://provider.test/checkout/1'})}));
  service=load('integration-payments.js',{'./integration-storage':load('integration-storage.js')}).payments({store:{getRecord:async()=>({data:{importe:1234}})},ledger,operations:[{key:'rf-01',schema:{properties:{importe:{type:'integer'}}}}],env,fetcher});
 });
 afterEach(async()=>fs.rm(root,{recursive:true,force:true}));
 const event=payment=>({id:'evt_test',type:'checkout.session.completed',livemode:false,data:{object:{id:payment.session,amount_total:payment.amount,currency:payment.currency,payment_status:'paid',metadata:{reference:payment.reference}}}});
 const sign=data=>{const bytes=Buffer.from(JSON.stringify(data)),time=Math.floor(Date.now()/1000);return [bytes,'t='+time+',v1='+crypto.createHmac('sha256','whsec_local').update(time+'.').update(bytes).digest('hex')];};
 test('10 solicitudes concurrentes usan un único checkout y precio del servidor',async()=>{
  const results=await Promise.all(Array.from({length:10},()=>service.checkout({id:'u'},'rf-01','1')));expect(fetcher).toHaveBeenCalledTimes(1);expect(new Set(results.map(item=>item.session)).size).toBe(1);
  expect(fetcher.mock.calls[0][1].body.get('line_items[0][price_data][unit_amount]')).toBe('1234');
  expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(results[0].reference);
 });
 test('el mismo registro en otra aplicación no reutiliza su idempotency key',async()=>{
  const first=await service.checkout({id:'u'},'rf-01','1');env.PAYMENT_NAMESPACE='other-application-tests';
  const second=await service.checkout({id:'u'},'rf-01','1');expect(first.reference).not.toBe(second.reference);expect(fetcher).toHaveBeenCalledTimes(2);
 });
 test('rechaza claves live, referencias ajenas y no confirma por URL de retorno',async()=>{
  env.STRIPE_SECRET_KEY='sk_live_not_allowed';await expect(service.checkout({id:'u'},'rf-01','1')).rejects.toMatchObject({status:503});expect(fetcher).not.toHaveBeenCalled();
  env.STRIPE_SECRET_KEY='sk_test_local';const payment=await service.checkout({id:'u'},'rf-01','1');expect(payment.status).toBe('pending');
  await expect(service.status({id:'other'},payment.reference)).rejects.toMatchObject({status:404});
 });
 test('firma, importe y moneda son obligatorios; replay no duplica confirmación',async()=>{
  const payment=await service.checkout({id:'u'},'rf-01','1');await expect(service.webhook(Buffer.from('{}'),'bad')).rejects.toMatchObject({status:400});
  const wrong=event(payment);wrong.data.object.amount_total++;await expect(service.webhook(...sign(wrong))).rejects.toMatchObject({status:400});
  const live=event(payment);live.livemode=true;await expect(service.webhook(...sign(live))).rejects.toMatchObject({status:400});
  await service.webhook(...sign(event(payment)));await service.webhook(...sign(event(payment)));expect((await service.status({id:'u'},payment.reference)).status).toBe('paid');
 });
});
describe('OIDC vinculado a navegador y cuenta preautorizada',()=>{
 let root,service,claims,env;
 beforeEach(async()=>{
  root=await fs.mkdtemp(path.join(os.tmpdir(),'icase-oidc-'));
  env={NODE_ENV:'test',OIDC_ISSUER:'http://issuer.test',OIDC_CLIENT_ID:'client',OIDC_REDIRECT_URI:'http://app.test/callback',OIDC_APP_URL:'http://app.test',OIDC_SUBJECTS:JSON.stringify({'http://issuer.test':{subject:'local@example.test'}})};
  claims={sub:'subject',aud:'client'};
  service=load('integration-oidc.js',{'./integration-storage':load('integration-storage.js')}).oidc({env,stateStore:storage(root),store:{findUserByEmail:async email=>email==='local@example.test'?{id:'1',rol:'lector',activo:true}:null,findUserById:async()=>({id:'1',rol:'lector',activo:true})},auth:{issue:user=>'jwt-'+user.rol,publicUser:user=>user,permissionsOf:()=>({administrador:false})},fetcher:async url=>({ok:true,json:async()=>url.endsWith('openid-configuration')?{issuer:env.OIDC_ISSUER,authorization_endpoint:env.OIDC_ISSUER+'/authorize',token_endpoint:env.OIDC_ISSUER+'/token',jwks_uri:env.OIDC_ISSUER+'/jwks'}:{id_token:'signed'}}),joseLoader:async()=>({createRemoteJWKSet:()=>()=>{},jwtVerify:async()=>({payload:claims})})});
 });
 afterEach(async()=>fs.rm(root,{recursive:true,force:true}));
 async function flow(){const target=new URL(await service.start('browser'));claims.nonce=target.searchParams.get('nonce');return target.searchParams.get('state');}
 test('PKCE y state; no vincula por correo ni acepta navegador diferente',async()=>{
  const target=new URL(await service.start('browser'));expect(target.searchParams.get('code_challenge_method')).toBe('S256');
  await expect(service.callback({state:target.searchParams.get('state'),code:'code',browser:'attacker'})).rejects.toMatchObject({status:400});
 });
 test('replay rechazado, ticket de un uso y roles solo de la cuenta local',async()=>{
  const state=await flow();claims.roles=['administrador'];const ticket=await service.callback({state,code:'code',browser:'browser'});
  await expect(service.callback({state,code:'code',browser:'browser'})).rejects.toMatchObject({status:400});
  const result=await service.exchange(ticket,'browser');expect(result.token).toBe('jwt-lector');expect(result.permisos.administrador).toBe(false);
  await expect(service.exchange(ticket,'browser')).rejects.toMatchObject({status:401});
 });
 test('nonce incorrecto y sujeto no aprovisionado se rechazan',async()=>{
  const state=await flow();claims.nonce='different';await expect(service.callback({state,code:'code',browser:'browser'})).rejects.toMatchObject({status:401});
  const other=await flow();claims.sub='unknown';claims.email='local@example.test';await expect(service.callback({state:other,code:'code',browser:'browser'})).rejects.toMatchObject({status:403});
 });
 test('rechaza azp ajeno incluso con audiencia simple',async()=>{
  const state=await flow();claims.azp='other-client';await expect(service.callback({state,code:'code',browser:'browser'})).rejects.toMatchObject({status:401});
 });
});
test('decodifica un QR real sin tratar su URL como una acción autorizada',()=>{
 const text='https://untrusted.example/no-navegar',qr=QR.create(text),scale=8,border=4,size=(qr.modules.size+border*2)*scale,bytes=new Uint8ClampedArray(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const row=Math.floor(y/scale)-border,col=Math.floor(x/scale)-border,black=row>=0&&col>=0&&row<qr.modules.size&&col<qr.modules.size&&qr.modules.data[row*qr.modules.size+col];const index=(y*size+x)*4;bytes[index]=bytes[index+1]=bytes[index+2]=black?0:255;bytes[index+3]=255;}
 expect(decode(bytes,size,size).data).toBe(text);
});
