const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const sync=require('node:fs');
const http=require('node:http');
const express=require('express');
const support=require('../src/infrastructure/templates/data-layer/store-support');
const Backend=require('../src/infrastructure/services/GenericBackendGenerator');
const Frontend=require('../src/infrastructure/services/GenericFrontendGenerator');
const Extractor=require('../src/infrastructure/services/DomainModelExtractor');
const Access=require('../src/core/services/AccessControlService');
const Business=require('../src/core/services/BusinessRuleService');
const Incremental=require('../src/infrastructure/services/IncrementalMigrationGenerator');
const updater=require('../src/infrastructure/templates/verification/safe-update.cjs');
function template(name,overrides={}) {
  const mod={exports:{}};
  const source=sync.readFileSync(path.join(__dirname,'../src/infrastructure/templates/auth',name),'utf8');
  new Function('require','module','exports',source)(name=>overrides[name]||(name==='../data/store-support'?support:require(name)),mod,mod.exports);
  return mod.exports;
}
const rf=[{identificador:'RF-01',nombre:'Gestionar productos',tipo:'RF',aprobado:true}];
const modules={modo:'personalizado',modulos:['archivos_imagenes','reportes_calculos','recuperacion_cuentas'].map(id=>({id,activo:true}))};
const access=new Access().proponer({requerimientos:rf}).valor;
const model=extra=>new Extractor().extract('@startuml\nclass Producto {\n String nombre\n double precio\n double cantidad\n double total\n'+(extra||'')+'}\n@enduml');
const backend=(extra,stack='Express')=>new Backend().generate({proyecto:{nombre:'Tienda'},requirements:rf,domainModel:model(extra),stack:{backend:stack,base_datos:'PostgreSQL'},access,modules});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6HkAAAAAASUVORK5CYII=','base64');
describe('archivos/reportes/correo generados',()=>{
  let root;
  beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'icase-modules-'));});
  afterEach(async()=>{await fs.rm(root,{recursive:true,force:true});});
  test.each(['Express','NestJS'])('conecta módulos y dependencias sin selección silenciosa: %s',stack=>{
    const files=backend('',stack);const content=name=>files.find(file=>file.ruta===name)?.contenido;
    expect(content('backend/src/extensions/generated-files.js')).toContain('maxBytes');
    expect(JSON.parse(content('backend/package.json')).dependencies.nodemailer).toBe('10.3.1');
    expect(content('backend/src/auth/auth-core.js')).toContain('claims.pwd');
    expect(content(stack==='Express'?'backend/src/app.js':'backend/src/main.ts')).toContain('generated-extensions');
    expect(()=>backend('','Spring')).toThrow('Spring');
  });
  test('React y Expo incluyen controles, selección, descarga y pantalla de recuperación',()=>{
    const files=new Frontend().generate({proyecto:{nombre:'Tienda'},screens:[{nombre:'Productos',rf_trazabilidad:['RF-01']}],decisiones:{modulos:modules,control_acceso:access,alcance_plataforma:{plataformas:['web','android']}}});
    const source=name=>files.find(file=>file.ruta===name)?.contenido;
    expect(source('frontend/src/OperationScreen.jsx')).toContain('<FilesPanel');
    expect(source('frontend/src/OperationScreen.jsx')).toContain('<ReportsPanel');
    expect(source('frontend/src/LoginScreen.jsx')).toContain('<RecoveryPanel/>');
    expect(source('mobile/App.js')).toContain('DocumentPicker.getDocumentAsync');
    expect(source('mobile/App.js')).toContain('FileSystem.downloadAsync');
  });
  test('almacena y recupera adjuntos; rechaza MIME falso, tamaño y traversal',async()=>{
    const files=template('generated-files.js').createFiles({root,maxBytes:100});
    const input={operation:'rf-01',record:'1',owner:'u',name:'../hola.png',bytes:png,type:'image/png'};
    const file=await files.save(input);expect(file.name).not.toContain('/');
    expect(await files.read(file.id)).toEqual(png);expect(await files.list('rf-01','1')).toHaveLength(1);
    await expect(files.save({...input,type:'image/jpeg'})).rejects.toMatchObject({status:400});
    await expect(files.save({...input,bytes:Buffer.alloc(101)})).rejects.toMatchObject({status:413});
    await expect(files.get('../secret')).rejects.toMatchObject({status:404});
    await files.remove(file.id);await expect(files.get(file.id)).rejects.toMatchObject({status:404});
  });
  test('reportes agregan campos numéricos y protegen CSV de fórmulas',async()=>{
    const reports=template('generated-reports.js');
    const result=await reports.report({list:async()=>[{data:{nombre:'=HYPERLINK()',precio:10}},{data:{nombre:'dos',precio:20}}]}, {key:'rf',schema:{properties:{nombre:{type:'string'},precio:{type:'number'}}}});
    expect(result.totals.precio).toEqual({count:2,sum:30,average:15,min:10,max:20});
    expect(reports.csv([['=HYPERLINK()','"texto"']])).toContain("'=HYPERLINK()");
    await expect(reports.report({list:async()=>({data:[],pagination:{total:10001,total_pages:101}})},{key:'rf'})).rejects.toMatchObject({status:413});
  });
  test('recuperación: genérica, token no persistido en claro, caducidad y uso único concurrente',async()=>{
    let now=Date.now();let mail;const user={id:'1',email:'a@example.test',activo:true,password_hash:'old'};
    const store={findUserByEmail:async email=>email===user.email?user:null,findUserById:async()=>user,replacePassword:async(_id,previous,next)=>{if(user.password_hash!==previous)return false;user.password_hash=next;return true;}};
    const recovery=template('generated-recovery.js',{'../auth/auth-core':{hashPassword:async password=>'hashed-'+password}}).createRecovery({store,root,now:()=>now,publicUrl:'https://example.test/',send:async value=>{mail=value;}});
    const known=await recovery.request(user.email);const unknown=await recovery.request('nobody@example.test');expect(known).toEqual(unknown);
    const token=/reset=([a-f0-9]{64})/.exec(mail.text)[1];const names=await fs.readdir(root);
    expect(names).not.toContain(token);expect(await fs.readFile(path.join(root,names[0]),'utf8')).not.toContain(token);
    const outcomes=await Promise.allSettled([recovery.reset(token,'NewPass-123'),recovery.reset(token,'OtherPass-123')]);
    expect(outcomes.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    await recovery.request(user.email);const expired=/reset=([a-f0-9]{64})/.exec(mail.text)[1];now+=16*60*1000;
    await expect(recovery.reset(expired,'ValidPass-123')).rejects.toMatchObject({status:400});
  });
  test('no pisa una contraseña cambiada mientras se calcula el nuevo hash',async()=>{
    let mail;const user={id:'1',email:'a@example.test',activo:true,password_hash:'old'};
    const store={findUserByEmail:async()=>user,findUserById:async()=>({...user}),replacePassword:async(_id,old,next)=>{if(user.password_hash!==old)return false;user.password_hash=next;return true;}};
    const recovery=template('generated-recovery.js',{'../auth/auth-core':{hashPassword:async()=>{user.password_hash='concurrent';return 'new';}}}).createRecovery({store,root,publicUrl:'https://example.test/',send:async message=>{mail=message;}});
    await recovery.request(user.email);const token=/reset=([a-f0-9]{64})/.exec(mail.text)[1];
    await expect(recovery.reset(token,'Some-Password-123')).rejects.toMatchObject({status:400});expect(user.password_hash).toBe('concurrent');
  });
  test('rutas HTTP: JWT/permisos, upload, descarga privada, PDF y CSV reales',async()=>{
    const files=template('generated-files.js');const reports=template('generated-reports.js');
    const old=process.env.APP_DATA_DIR;process.env.APP_DATA_DIR=root;
    const app=express();const store={getRecord:async(_op,id)=>id==='1'?{id}:null,list:async()=>[{data:{precio:12}}]};
    const auth={authenticate:async header=>{if(!['Bearer reader','Bearer writer'].includes(header))throw new support.HttpError(401,'Sesión requerida');return {id:header};},authorize:(user,method)=>{if(user.id==='Bearer reader'&&method!=='GET')throw new support.HttpError(403,'Denegado');}};
    template('generated-extensions.js',{'./generated-files':files,'./generated-reports':reports})(app,{store,auth,contract:{operations:[{key:'rf-01',name:'Productos',schema:{properties:{precio:{type:'number'}}}}]},enabled:['archivos_imagenes','reportes_calculos']});
    const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port;
    try {
      const upload=(token,type='image/png')=>fetch(url+'/api/files/rf-01/1',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':type},body:png});
      expect((await upload('reader')).status).toBe(403);expect((await upload('wrong')).status).toBe(401);
      const response=await upload('writer');expect(response.status).toBe(201);const file=await response.json();
      const download=await fetch(url+'/api/download/'+file.id,{headers:{Authorization:'Bearer reader'}});expect(download.status).toBe(200);expect(download.headers.get('content-disposition')).toContain('attachment');
      const pdf=await fetch(url+'/api/reports/rf-01?format=pdf',{headers:{Authorization:'Bearer reader'}});expect(pdf.status).toBe(200);expect((await pdf.text()).startsWith('%PDF')).toBe(true);
      const csv=await fetch(url+'/api/reports/rf-01?format=csv',{headers:{Authorization:'Bearer reader'}});expect(await csv.text()).toContain('precio');
    } finally {await new Promise(resolve=>server.close(resolve));if(old===undefined)delete process.env.APP_DATA_DIR;else process.env.APP_DATA_DIR=old;}
  });
});
describe('cálculos confirmados y migraciones incrementales',()=>{
  const rule={id:'RN-01',tipo:'calculo',entidad:'Producto',campo:'total',expresion:{op:'*',izquierda:{campo:'precio'},derecha:{campo:'cantidad'}},decimales:2,rf:['RF-01'],mensaje:'Total según precio y cantidad',estado_decision:'confirmado',origen:'manual'};
  test('valida DSL y rechaza código, campos inexistentes y ciclos',()=>{
    const context={entidades:model().entities,requerimientos:rf};
    expect(new Business().validar([rule],context).errores).toEqual([]);
    expect(new Business().validar([{...rule,expresion:'eval(1)'}],context).errores.length).toBeGreaterThan(0);
    expect(new Business().validar([{...rule,expresion:{campo:'total'}}],context).errores.length).toBeGreaterThan(0);
  });
  test('motor deriva sin eval, conserva cálculo en PATCH y detecta división por cero',()=>{
    const source=sync.readFileSync(path.join(__dirname,'../src/infrastructure/templates/data-layer/calculations.js'),'utf8');const mod={exports:{}};
    new Function('require','module',source)(()=>support,mod);
    expect(mod.exports.derive([rule],{precio:12,cantidad:3,total:999}).total).toBe(36);
    expect(mod.exports.derive([rule],{cantidad:2},{precio:12}).total).toBe(24);
    expect(()=>mod.exports.evaluate({op:'/',izquierda:1,derecha:0},{})).toThrow('cero');
  });
  test('conserva historial y genera ALTER sin DROP; rechaza cambios destructivos',()=>{
    const previous={version:1,archivos:backend()};const files=new Incremental().apply(backend(' String descripcion\n'),previous);
    const migration=files.find(file=>/0004_alter_.*\.sql$/.test(file.ruta));expect(migration.contenido).toContain('ADD COLUMN');expect(migration.contenido).not.toMatch(/DROP|DELETE/);
    expect(files.find(file=>file.ruta==='backend/db/migrations/0001_init.sql').contenido).toBe(previous.archivos.find(file=>file.ruta==='backend/db/migrations/0001_init.sql').contenido);
    expect(()=>new Incremental().apply(backend(),{version:2,archivos:files})).toThrow('Cambiar/eliminar');
    const unchanged=new Incremental().apply(backend(' String descripcion\n'),{version:2,archivos:files});expect(unchanged.filter(file=>/0004_alter_/.test(file.ruta))).toHaveLength(1);
  });
});
describe('actualización no destructiva con aprobación',()=>{
  let root,incoming;
  const prepare=async(dir,files)=>{await fs.mkdir(path.join(dir,'.icase'),{recursive:true});await fs.writeFile(path.join(dir,'.icase/baseline.json'),JSON.stringify({files}));for(const file of files)await fs.writeFile(path.join(dir,file.ruta),file.contenido);};
  beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'icase-update-'));incoming=await fs.mkdtemp(path.join(os.tmpdir(),'icase-next-'));});
  afterEach(async()=>{await fs.rm(root,{recursive:true,force:true});await fs.rm(incoming,{recursive:true,force:true});});
  test('vista previa sin escritura; aprobación vigente y respaldo al aplicar',async()=>{
    await prepare(root,[{ruta:'app.js',contenido:'old'}]);await prepare(incoming,[{ruta:'app.js',contenido:'new'}]);
    const plan=await updater.planUpdate(root,incoming);expect(plan.changes[0].action).toBe('update');expect(await fs.readFile(path.join(root,'app.js'),'utf8')).toBe('old');
    await expect(updater.applyUpdate(plan,'wrong')).rejects.toThrow('aprobación');
    const result=await updater.applyUpdate(plan,plan.approval);expect(await fs.readFile(path.join(root,'app.js'),'utf8')).toBe('new');expect(await fs.readFile(path.join(root,result.backup,'app.js'),'utf8')).toBe('old');
  });
  test('bloquea conflictos, cambios posteriores y traversal; preserva manuales',async()=>{
    await prepare(root,[{ruta:'app.js',contenido:'old'}]);await prepare(incoming,[{ruta:'app.js',contenido:'new'}]);
    const plan=await updater.planUpdate(root,incoming);await fs.writeFile(path.join(root,'app.js'),'manual');
    await expect(updater.applyUpdate(plan,plan.approval)).rejects.toThrow('aprobación');
    const current=await updater.planUpdate(root,incoming);await expect(updater.applyUpdate(current,current.approval)).rejects.toThrow('conflictos');
    await prepare(incoming,[{ruta:'app.js',contenido:'old'}]);expect((await updater.planUpdate(root,incoming)).changes[0].action).toBe('preserve_manual');
    await expect(updater.safePath(root,'../secret')).rejects.toThrow('Ruta');await expect(updater.safePath(root,'.env')).rejects.toThrow('Ruta');
  });
});
