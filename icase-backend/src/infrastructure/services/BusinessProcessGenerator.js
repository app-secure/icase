const fs=require('node:fs'),path=require('node:path');
const Modules=require('../../core/services/ModuleService');
const Service=require('../../core/services/BusinessProcessService');
class BusinessProcessGenerator {
 apply(files,{resolved,policy,contract,modules,requirements}){
  if(!new Modules().activos(modules).includes('procesos_negocio'))return files;
  if(resolved.backend==='spring'||resolved.database!=='postgres'||!policy.habilitada)throw new Error('Procesos transaccionales requieren Express/NestJS, PostgreSQL y JWT.');
  const result=new Service().validar(modules.procesos,{operations:contract.operations,requirements,roles:['administrador',...Object.keys(policy.roles||{})]});
  if(result.errores.length||!result.procesos.length)throw new Error('Procesos inválidos: '+(result.errores.join(' ')||'define y confirma al menos uno.'));
  const model=files.find(f=>f.ruta==='backend/src/data/model.js');
  if(model.contenido.includes('"icase_process_instances"'))throw new Error('El nombre icase_process_instances está reservado.');
  for(const name of ['business-process.js','business-process-pg.js','business-process-routes.js','business-process-guard.js','business-process-outbox.js','business-process-notify.js'])files.push({ruta:'backend/src/processes/'+name,lenguaje:'javascript',contenido:fs.readFileSync(path.join(__dirname,'../templates/auth',name),'utf8')});
  if(result.procesos.some(p=>p.actions.some(a=>a.notify))){
    const pkg=files.find(file=>file.ruta==='backend/package.json');const data=JSON.parse(pkg.contenido);
    data.dependencies=data.dependencies||{};data.dependencies.nodemailer=data.dependencies.nodemailer||'10.3.1';pkg.contenido=JSON.stringify(data,null,2);
    const env=files.find(file=>file.ruta==='backend/.env.example');
    if(env&&!env.contenido.includes('SMTP_HOST='))env.contenido+='\nSMTP_HOST=\nSMTP_PORT=587\nSMTP_FROM=\nSMTP_USER=\nSMTP_PASSWORD=\nSMTP_SECURE=false\nSMTP_ALLOW_INSECURE=false\n';
  }
  const physical=JSON.parse(model.contenido.replace(/^module\.exports\s*=\s*/,'').replace(/;\s*$/,''));
  if(physical.tables.icase_process_locks)throw new Error('El nombre icase_process_locks está reservado.');
  if(physical.tables.icase_process_outbox)throw new Error('El nombre icase_process_outbox está reservado.');
  const literal=value=>"'"+String(value).replace(/'/g,"''")+"'";
  const fingerprint=p=>require('node:crypto').createHash('sha256').update(JSON.stringify(p)).digest('hex');
  const compatible=result.procesos.map(p=>`(document->>'definition'=${literal(p.id)} AND document->>'definition_hash'=${literal(fingerprint(p))})`).join(' OR ');
  const locks={id:'0005_business_process_locks',statements:[
    'CREATE TABLE IF NOT EXISTS icase_process_locks (record_table TEXT NOT NULL, record_id TEXT NOT NULL, instance_id UUID NOT NULL REFERENCES icase_process_instances(id), PRIMARY KEY(record_table,record_id))',
    `DO $$ BEGIN IF EXISTS(SELECT 1 FROM icase_process_instances WHERE NOT COALESCE((${compatible}),false)) THEN RAISE EXCEPTION 'Las instancias existentes requieren migracion explicita de definiciones antes de activar bloqueos'; END IF; END; $$`,
    'INSERT INTO icase_process_locks (record_table,record_id,instance_id) SELECT DISTINCT record_table,record_id,instance_id FROM ('+result.procesos.flatMap(p=>Object.entries(p.records).map(([alias,key])=>`SELECT ${literal(physical.operations[key])} AS record_table,((document->'records'->>${literal(alias)})::bigint)::text AS record_id,id AS instance_id FROM icase_process_instances WHERE document->>'definition'=${literal(p.id)}`)).join(' UNION ALL ')+') AS bindings'
  ]};
  const store=files.find(f=>['backend/src/record.store.js','backend/src/record.store.base.js'].includes(f.ruta));
  if(!store)throw new Error('No se encontró el almacén para proteger los procesos');
  store.contenido=store.contenido.replace('async update(operation, id, body) {',"async update(operation, id, body) {\n    if(!this.processExecution)return require('./processes/business-process-guard').execute(this,'update',operation,id,body);")
    .replace('async remove(operation, id) {',"async remove(operation, id) {\n    if(!this.processExecution)return require('./processes/business-process-guard').execute(this,'remove',operation,id);");
  store.contenido=store.contenido.replace('new Pool({ connectionString: process.env.DATABASE_URL })','new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 })');
  const associations=files.find(f=>f.ruta==='backend/src/data/associations.js');
  if(associations&&!associations.contenido.includes('assertAssociation')){
    associations.contenido=associations.contenido.replace(
      'module.exports = async function associations(store, action, key, input = {}, scopes = {}) {',
      "module.exports = async function associations(store, action, key, input = {}, scopes = {}) {\n  if (action !== 'list' && store.pool) await require('../processes/business-process-guard').assertAssociation(store, key, input);"
    );
  }
  const extensions=files.find(f=>f.ruta==='backend/src/extensions/generated-extensions.js');
  if(extensions&&!extensions.contenido.includes('assertFile')){
    extensions.contenido=extensions.contenido.replace(
      /await recordExists\(req\.params\.operation,req\.params\.record,req\.fileUser\);\r?\n\s*next\(\);/,
      "await recordExists(req.params.operation,req.params.record,req.fileUser);\n      await require('../processes/business-process-guard').assertFile(store,req.params.operation,req.params.record);\n      next();"
    ).replace(
      /const user=await access\(req,file\.operation,'PATCH'\);\s*await recordExists\(file\.operation,file\.record,user\);\r?\n\s*await files\.remove\(file\.id\);/,
      "const user=await access(req,file.operation,'PATCH'); await recordExists(file.operation,file.record,user);\n      await require('../processes/business-process-guard').assertFile(store,file.operation,file.record);\n      await files.remove(file.id);"
    );
  }
  const migration={id:'0004_business_process_instances',statements:['CREATE TABLE IF NOT EXISTS icase_process_instances (id UUID PRIMARY KEY, document JSONB NOT NULL)']};
  const migrations=files.find(f=>f.ruta==='backend/src/data/migrations.js');
  const list=JSON.parse(migrations.contenido.replace(/^module\.exports\s*=\s*/,'').replace(/;\s*$/,''));
  const outbox={id:'0006_business_process_outbox',statements:[
    'CREATE TABLE IF NOT EXISTS icase_process_outbox (id BIGSERIAL PRIMARY KEY, instance_id UUID NOT NULL REFERENCES icase_process_instances(id), version INTEGER NOT NULL, operation TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, available_at TIMESTAMPTZ NOT NULL DEFAULT now(), delivered_at TIMESTAMPTZ, last_error TEXT, UNIQUE(instance_id,version,operation))',
    'CREATE INDEX IF NOT EXISTS ix_process_outbox_pending ON icase_process_outbox(available_at,id) WHERE delivered_at IS NULL',
    'CREATE INDEX IF NOT EXISTS ix_process_outbox_delivered ON icase_process_outbox(delivered_at) WHERE delivered_at IS NOT NULL'
  ]};
  list.push(migration,locks,outbox);migrations.contenido='module.exports = '+JSON.stringify(list,null,2)+';\n';
  files.push({ruta:'backend/db/migrations/'+outbox.id+'.sql',lenguaje:'sql',contenido:outbox.statements.join(';\n')+';\n'});
  files.push({ruta:'backend/db/migrations/'+locks.id+'.sql',lenguaje:'sql',contenido:locks.statements.join(';\n')+';\n'});
  files.push({ruta:'backend/db/migrations/'+migration.id+'.sql',lenguaje:'sql',contenido:migration.statements[0]+';\n'});
  const config='outbox:'+new Modules().activos(modules).includes('eventos_cambios')+',definitions:'+JSON.stringify(result.procesos);
  if(resolved.backend==='nest'){
   const main=files.find(f=>f.ruta==='backend/src/main.ts');
   if(!main.contenido.includes('import { RecordStore }'))main.contenido="import { RecordStore } from './record.store';\nimport { AuthService } from './auth.service';\n"+main.contenido;
   main.contenido=main.contenido.replace('app.useGlobalFilters',`require('./processes/business-process-routes')(app.getHttpAdapter().getInstance(),{store:app.get(RecordStore),auth:app.get(AuthService).core,${config}});app.useGlobalFilters`);
  }else{
   const app=files.find(f=>f.ruta==='backend/src/app.js');app.contenido=app.contenido.replace('mountAuth(app,auth);',`require('./processes/business-process-routes')(app,{store,auth,${config}});mountAuth(app,auth);`);
  }
  const manifest=files.find(f=>f.ruta==='backend/icase.manifest.json'),data=JSON.parse(manifest.contenido);data.procesos={enabled:true,definitions:result.procesos,scope:'transacciones_acotadas_postgresql',outbox:{enabled:new Modules().activos(modules).includes('eventos_cambios'),delivery:'at_least_once_transport',max_pending:10000,retention_days:7}};data.storage.migrations=list.map(item=>item.id);manifest.contenido=JSON.stringify(data,null,2);
  const api=files.find(f=>f.ruta==='backend/openapi.json'),docs=JSON.parse(api.contenido);
  const responses={200:{description:'Estado y versión del proceso'},400:{description:'Entrada inválida'},401:{description:'Requiere JWT'},403:{description:'Rol, permisos o separación de actores'},404:{description:'Proceso o registro inexistente'},409:{description:'Versión, precondición o concurrencia'},500:{description:'Transacción abortada'}};
  const param=name=>({name,in:'path',required:true,schema:{type:'string'}});
  docs.paths['/api/processes/definitions']={get:{summary:'Definiciones que el usuario puede iniciar',responses}};
  docs.paths['/api/processes/instances']={get:{summary:'Bandeja autorizada, paginada de 20 en 20',parameters:[{name:'page',in:'query',schema:{type:'integer',minimum:1,maximum:10000}}],responses}};
  docs.paths['/api/processes/{definition}/instances']={post:{summary:'Iniciar proceso confirmado con registros existentes',parameters:[param('definition')],requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['records'],properties:{records:{type:'object',additionalProperties:{type:'string'}}}}}}},responses:{...responses,201:{description:'Instancia creada'}}}};
  docs.paths['/api/processes/instances/{id}']={get:{summary:'Estado, acciones disponibles y auditoría sin claves de idempotencia',parameters:[param('id')],responses}};
  docs.paths['/api/processes/instances/{id}/actions']={post:{summary:'Acción atómica con versión e idempotencia',parameters:[param('id')],requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['action','version','key'],properties:{action:{type:'string'},version:{type:'integer',minimum:0},key:{type:'string',minLength:16,maxLength:100}}}}}},responses}};
  docs.paths['/api/processes/instances/{id}/reopen']={post:{summary:'Reapertura opt-in: libera bloqueos y vuelve a un estado no terminal',parameters:[param('id')],requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['version','key'],properties:{version:{type:'integer',minimum:0},key:{type:'string',minLength:16,maxLength:100}}}}}},responses}};
  api.contenido=JSON.stringify(docs,null,2);files.find(f=>f.ruta==='backend/src/docs/openapi.js').contenido='module.exports = '+JSON.stringify(docs)+';\n';
  files.push({ruta:'backend/PROCESSES.md',lenguaje:'markdown',contenido:fs.readFileSync(path.join(__dirname,'../templates/auth/business-process.README.md'),'utf8')});
  return files;
 }
}
module.exports=BusinessProcessGenerator;
