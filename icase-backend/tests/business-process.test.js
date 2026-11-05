const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const Service=require('../src/core/services/BusinessProcessService');
const Backend=require('../src/infrastructure/services/GenericBackendGenerator');
const Access=require('../src/core/services/AccessControlService');
const {HttpError}=require('../src/infrastructure/templates/data-layer/store-support');
const source=fs.readFileSync(path.join(__dirname,'../src/infrastructure/templates/auth/business-process.js'),'utf8');
const engine=()=>{const module={exports:{}};vm.runInNewContext(source,{module,require:name=>{
  if(name==='../data/store-support')return {HttpError};
  if(name==='./business-process-notify')return {smtpConfigured:()=>false,sendActionMail:async()=>{}};
  if(name==='../auth/ownership')return {scopeOf:()=>null};
  return require(name);
}});return module.exports.engine;};
const requirements=[{identificador:'RF-01',tipo:'RF',nombre:'Gestionar solicitudes',aprobado:true}];
const operations=[{key:'rf-01',schema:{properties:{estado:{type:'string'}}}}];
const definition=()=>({id:'revision',estado_decision:'confirmado',rf:['RF-01'],states:['pendiente','aprobado','cerrado'],initial:'pendiente',terminal:['cerrado'],records:{solicitud:'rf-01',otra:'rf-01'},start_roles:['administrador'],reopen:{to:'pendiente',roles:['administrador']},actions:[{id:'aprobar',from:'pendiente',to:'aprobado',roles:['administrador'],different_actor:true,steps:[{record:'solicitud',expect:{estado:'pendiente'},set:{estado:'aprobado'}},{record:'otra',expect:{estado:'pendiente'},set:{estado:'aprobado'}}]},{id:'cerrar',from:'aprobado',to:'cerrado',roles:['administrador'],different_actor:false,steps:[]}]});
describe('definiciones de procesos confirmados',()=>{
 test('acepta transiciones trazables y rechaza RF, roles, campos y decisiones inventados',()=>{
  const validate=p=>new Service().validar([p],{operations,requirements,roles:['administrador']});
  expect(validate(definition()).errores).toEqual([]);
  for(const mutate of [p=>p.rf=['RF-99'],p=>p.estado_decision='pendiente',p=>p.actions[0].roles=['inventado'],p=>p.actions[0].steps[0].set={inventado:'x'},p=>p.terminal=['pendiente'],p=>p.states.push('inalcanzable')]){const p=definition();mutate(p);expect(validate(p).errores.length).toBeGreaterThan(0);}
 });
 test.each(['Express','NestJS'])('genera API y migración PostgreSQL solo opt-in: %s',backend=>{
  const access=new Access().proponer({requerimientos:requirements}).valor;
  const modules={modo:'personalizado',modulos:[{id:'procesos_negocio',activo:true}],procesos:[{...definition(),actions:definition().actions.map(a=>({...a,steps:[]}))}]};
  const files=new Backend().generate({proyecto:{nombre:'Prueba'},requirements,stack:{backend,base_datos:'PostgreSQL'},access,modules});
  expect(files.find(f=>f.ruta==='backend/src/processes/business-process.js')).toBeTruthy();
  expect(files.find(f=>f.ruta==='backend/src/data/migrations.js').contenido).toContain('icase_process_instances');
  expect(files.find(f=>f.ruta==='backend/src/data/migrations.js').contenido).toContain('icase_process_locks');
  expect(files.find(f=>f.ruta==='backend/src/data/migrations.js').contenido).toContain('icase_process_outbox');
  expect(JSON.parse(files.find(f=>f.ruta==='backend/icase.manifest.json').contenido).storage.migrations).toContain('0006_business_process_outbox');
  expect(files.find(f=>f.ruta==='backend/src/processes/business-process-guard.js').contenido).toContain('id=String(BigInt(id))');
  expect(files.find(f=>f.ruta==='backend/openapi.json').contenido).toContain('/api/processes/definitions');
  const old=structuredClone(files),oldMigration=old.find(f=>f.ruta==='backend/src/data/migrations.js');
  const oldList=JSON.parse(oldMigration.contenido.replace(/^module\.exports\s*=\s*/,'').replace(/;\s*$/,''));
  oldMigration.contenido='module.exports = '+JSON.stringify(oldList.filter(item=>item.id!=='0005_business_process_locks'))+';\n';
  const upgraded=new (require('../src/infrastructure/services/IncrementalMigrationGenerator'))().apply(structuredClone(files),{version:1,archivos:old.filter(f=>!f.ruta.endsWith('0005_business_process_locks.sql'))});
  expect(upgraded.find(f=>f.ruta==='backend/src/data/migrations.js').contenido).toContain('0005_business_process_locks');
  expect(upgraded.filter(f=>f.ruta.endsWith('0005_business_process_locks.sql'))).toHaveLength(1);
  const removed=structuredClone(files),removedMigration=removed.find(f=>f.ruta==='backend/src/data/migrations.js');
  removedMigration.contenido='module.exports = '+JSON.stringify(oldList.filter(item=>!item.id.includes('business_process')))+';\n';
  expect(()=>new (require('../src/infrastructure/services/IncrementalMigrationGenerator'))().apply(removed,{version:1,archivos:files})).toThrow('Eliminar procesos de negocio');
  expect(files.find(f=>f.ruta==='backend/openapi.json').contenido).toContain('/api/processes/instances/{id}/actions');
  expect(()=>new Backend().generate({proyecto:{nombre:'Prueba'},requirements,stack:{backend,base_datos:'MySQL'},access,modules})).toThrow('PostgreSQL');
  expect(()=>new Backend().generate({proyecto:{nombre:'Prueba'},requirements,stack:{backend,base_datos:'PostgreSQL'},access,modules:{...modules,procesos:[]}})).toThrow('Procesos de negocio');
 });
});
describe('ejecución de procesos',()=>{
 let state,records,service,authorize;
 const user=id=>({id,rol:'administrador'});
 const input={action:'aprobar',version:0,key:'unique-request-key-0001'};
 beforeEach(async()=>{
  records={'1':{data:{estado:'pendiente'}},'2':{data:{estado:'pendiente'}}};authorize=jest.fn();
  const repository={start:async instance=>{state=structuredClone(instance);return {id:instance.id,state:instance.state,version:0};},read:async()=>structuredClone(state),transaction:async(id,run)=>{
   const draft=structuredClone(state),next=structuredClone(records);
   const result=await run({getRecord:async(key,id)=>next[id]||null,update:async(key,id,patch)=>{Object.assign(next[id].data,patch);return next[id];},save:async value=>Object.assign(draft,value)},draft);
   state=draft;records=next;return result;
  }};
  service=engine()({definitions:[definition()],repository,authorize});await service.start(user('1'),'revision',{solicitud:'1',otra:'2'});
 });
 test('separa solicitante/aprobador y exige permisos de todas las operaciones',async()=>{
  await expect(service.act(user('1'),state.id,input)).rejects.toMatchObject({status:403});
  expect(records['1'].data.estado).toBe('pendiente');
  authorize.mockImplementation(()=>{throw new HttpError(403,'denegado');});
  await expect(service.act(user('2'),state.id,input)).rejects.toMatchObject({status:403});
 });
 test('dos pasos, versión, cierre y reintento sin duplicar acciones',async()=>{
  const result=await service.act(user('2'),state.id,input);expect(result.version).toBe(1);expect(records['2'].data.estado).toBe('aprobado');
  expect((await service.act(user('2'),state.id,input)).replayed).toBe(true);expect(state.history.length).toBe(1);
  await expect(service.act(user('3'),state.id,input)).rejects.toMatchObject({status:409});
  const view=await service.read(user('2'),state.id);expect(JSON.stringify(view)).not.toContain(input.key);expect(view.actions).toEqual(['cerrar']);
  await service.act(user('2'),state.id,{action:'cerrar',version:1,key:'unique-request-key-0002'});expect(state.state).toBe('cerrado');
 });
 test('si falla el segundo paso, ni el primero ni la auditoría se confirman',async()=>{
  records['2'].data.estado='cancelado';
  await expect(service.act(user('2'),state.id,input)).rejects.toMatchObject({status:409});
  expect(records['1'].data.estado).toBe('pendiente');expect(state.version).toBe(0);expect(state.history).toHaveLength(0);
 });
 test('rechaza versión obsoleta y entradas mal formadas',async()=>{
  await expect(service.act(user('2'),state.id,{...input,version:7})).rejects.toMatchObject({status:409});
  await expect(service.act(user('2'),state.id,{...input,key:'x'})).rejects.toMatchObject({status:400});
  await expect(service.start(user('1'),'revision',{solicitud:'1',otra:'2',extra:'3'})).rejects.toMatchObject({status:400});
 });
 test('no reinterpreta instancias existentes después de cambiar la definición',async()=>{
  state.definition_hash='definicion-anterior';
  await expect(service.act(user('2'),state.id,input)).rejects.toMatchObject({status:409});
  expect(state.version).toBe(0);
 });
 test('normaliza IDs equivalentes y filtra el catálogo por permisos',async()=>{
  await service.start(user('1'),'revision',{solicitud:'01',otra:'002'});
  expect(state.records).toEqual({solicitud:'1',otra:'2'});
  expect(service.catalog(user('1')).length).toBe(1);
  authorize.mockImplementation(()=>{throw new HttpError(403,'denegado');});
  expect(service.catalog(user('1'))).toEqual([]);
 });
 test('un rol ajeno al proceso no puede consultar su auditoría aunque conozca el UUID',async()=>{
  await expect(service.read({id:'9',rol:'ajeno'},state.id)).rejects.toMatchObject({status:403});
 });
 test('reabre un proceso terminal, libera el estado y exige clave de idempotencia',async()=>{
  await service.act(user('2'),state.id,input);
  await service.act(user('2'),state.id,{action:'cerrar',version:1,key:'unique-request-key-0002'});
  expect(state.state).toBe('cerrado');
  const unlocked=[];
  const previous=service;
  const repository={start:async()=>null,read:async()=>structuredClone(state),transaction:async(id,run)=>{
   const draft=structuredClone(state);
   const result=await run({getRecord:async()=>null,update:async()=>null,save:async value=>Object.assign(draft,value),unlock:async()=>{unlocked.push(id);}},draft);
   state=draft;return result;
  }};
  service=engine()({definitions:[definition()],repository,authorize});
  const view=await previous.read(user('2'),state.id);expect(view.can_reopen).toBe(true);
  const reopened=await service.reopen(user('2'),state.id,{version:2,key:'unique-request-key-reopen'});
  expect(reopened).toMatchObject({state:'pendiente',version:3,replayed:false});
  expect(unlocked).toEqual([state.id]);
  expect((await service.reopen(user('2'),state.id,{version:2,key:'unique-request-key-reopen'})).replayed).toBe(true);
 });
 test('una acción con notify sin SMTP responde 503 y no cambia el estado',async()=>{
  const withMail={...definition(),actions:definition().actions.map(a=>a.id==='aprobar'?{...a,notify:{roles:['administrador'],plantilla:'accion'}}:a)};
  const repository={start:async instance=>{state=structuredClone(instance);return {id:instance.id,state:instance.state,version:0};},read:async()=>structuredClone(state),transaction:async(id,run)=>{
   const draft=structuredClone(state),next=structuredClone(records);
   try{
    const result=await run({getRecord:async(key,id)=>next[id]||null,update:async(key,id,patch)=>{Object.assign(next[id].data,patch);return next[id];},save:async value=>Object.assign(draft,value)},draft);
    state=draft;records=next;return result;
   }catch(error){throw error;}
  }};
  service=engine()({definitions:[withMail],repository,authorize,store:{listUsers:async()=>[]}});
  await service.start(user('1'),'revision',{solicitud:'1',otra:'2'});
  await expect(service.act(user('2'),state.id,input)).rejects.toMatchObject({status:503});
  expect(state.version).toBe(0);expect(records['1'].data.estado).toBe('pendiente');
 });
});

test('frontend incorpora bandeja opt-in, selectores, reapertura y ruta protegida por sesión',()=>{
 const Frontend=require('../src/infrastructure/services/GenericFrontendGenerator');
 const files=new Frontend().generate({proyecto:{nombre:'Prueba'},screens:[],decisiones:{control_acceso:{autenticacion:{metodo:'jwt'}},alcance_plataforma:{plataformas:['web','móvil']},modulos:{modo:'personalizado',modulos:[{id:'procesos_negocio',activo:true}],procesos:[definition()]}}});
 const app=files.find(file=>file.ruta==='frontend/src/App.jsx').contenido;
 expect(app).toContain('path="/procesos"');expect(app).toContain('if (!user) return <LoginScreen />');
 const screen=files.find(file=>file.ruta==='frontend/src/ProcessScreen.jsx').contenido;
 expect(screen).toContain('Registro {alias}');expect(screen).toContain('can_reopen');expect(screen).toContain('/reopen');expect(screen).toContain('getRandomValues');expect(screen).not.toContain('crypto.randomUUID');
 const mobile=files.find(file=>file.ruta==='mobile/App.js').contenido;
 expect(mobile).toContain("import ProcessScreen from './ProcessScreen'");
 expect(files.find(file=>file.ruta==='mobile/ProcessScreen.js').contenido).toContain('/api/processes/instances');
});

test('el generador engancha protección N:M/adjuntos y documenta reopen',()=>{
 const access=new Access().proponer({requerimientos:requirements}).valor;
 const modules={modo:'personalizado',modulos:[{id:'procesos_negocio',activo:true},{id:'archivos_imagenes',activo:true}],procesos:[{...definition(),actions:definition().actions.map(a=>({...a,steps:[]}))}]};
 const files=new Backend().generate({proyecto:{nombre:'Prueba'},requirements,stack:{backend:'Express',base_datos:'PostgreSQL'},access,modules,domainModel:{codigo_plantuml:'@startuml\nclass Solicitud {\n+String id\n+String estado\n}\n@enduml'}});
 expect(files.find(f=>f.ruta==='backend/src/data/associations.js').contenido).toContain('assertAssociation');
 expect(files.find(f=>f.ruta==='backend/src/extensions/generated-extensions.js').contenido).toContain('assertFile');
 expect(files.find(f=>f.ruta==='backend/openapi.json').contenido).toContain('/api/processes/instances/{id}/reopen');
 expect(files.find(f=>f.ruta==='backend/src/processes/business-process-notify.js')).toBeTruthy();
});
