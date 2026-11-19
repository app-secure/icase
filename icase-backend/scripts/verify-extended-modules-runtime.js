// Prueba controlada de los cuatro bloques, sin IA ni datos de la plataforma activa.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {promisify}=require('node:util'),{execFile}=require('node:child_process');
const Backend=require('../src/infrastructure/services/BackendScaffoldGenerator');
const Frontend=require('../src/infrastructure/services/FrontendScaffoldGenerator');
const Tests=require('../src/infrastructure/services/TestSuiteGenerator');
const Infrastructure=require('../src/infrastructure/services/InfrastructureGenerator');
const Sandbox=require('../src/infrastructure/services/SandboxRuntimeVerifier');
async function main(){
  const backend=process.argv[2]||'Express';const proyecto={nombre:'Inventario de verificación'};
  const requerimientos=[{identificador:'RF-01',tipo:'RF',aprobado:true,nombre:'Gestionar productos',descripcion:'El total del producto es precio multiplicado por cantidad, con 2 decimales.'}];
  const rule={id:'RN-01',tipo:'calculo',entidad:'Producto',campo:'total',expresion:{op:'*',izquierda:{campo:'precio'},derecha:{campo:'cantidad'}},decimales:2,rf:['RF-01'],mensaje:'Total = precio por cantidad',estado_decision:'confirmado',origen:'manual'};
  const decisiones={stack_tecnologico:{backend,base_datos:'PostgreSQL'},alcance_plataforma:{plataformas:['web','android']},modulos:{modo:'personalizado',modulos:[...['archivos_imagenes','reportes_calculos','recuperacion_cuentas'].map(id=>({id,activo:true})),{id:'datos_iniciales',activo:false}]},reglas_negocio:{reglas:[rule]},control_acceso:{autenticacion:{metodo:'jwt',expiracion:'1h'},roles:[{nombre:'Editor',incluir:true}],permisos:[{operacion:'RF-01',rol:'editor',metodos:['GET','POST','PATCH','DELETE']}]}};
  const domain=extra=>({codigo_plantuml:'@startuml\nclass Producto {\n String nombre\n double precio\n double cantidad\n double total\n'+extra+'}\n@enduml'});
  const base={proyecto,versionesOrigen:{}};
  const previous=await new Backend().generar({...base,insumos:{decisiones,requerimientos,diagramaDominio:domain('')}});
  const generated=await new Backend().generar({...base,insumos:{decisiones,requerimientos,diagramaDominio:domain(' String descripcion\n'),backendAnterior:{...previous,version:1}}});
  const frontend=await new Frontend().generar({...base,insumos:{decisiones,diseno:{manifiesto_navegacion:[{pantalla_id:'productos',nombre:'Productos',ruta:'/productos',rf_trazabilidad:['RF-01']}],mockups:[]}}});
  const common={decisiones,requerimientos,backend:{...generated,version:2},frontend:{...frontend,version:1}};
  const tests=await new Tests().generar({...base,insumos:common});
  tests.archivos.push({ruta:'tests/integration/upgrade.test.js',contenido:`import {test} from 'node:test';import assert from 'node:assert/strict';
test('migración aditiva conserva el registro anterior y añade descripción',async()=>{
const base=process.env.BASE_API_URL;const login=await(await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})})).json();
const headers={Authorization:'Bearer '+login.token,'Content-Type':'application/json'};
const rows=await(await fetch(base+'/api/operations/rf-01',{headers})).json();const row=rows.find(row=>row.data.nombre==='conservado-antes-de-migrar');assert.ok(row,'Se perdió el registro anterior');assert.equal(row.data.total,6);
assert.equal((await fetch(base+'/api/operations/rf-01/'+row.id,{method:'PATCH',headers,body:JSON.stringify({descripcion:'columna nueva'})})).status,200);
});`});
  const infra=await new Infrastructure().generar({...base,insumos:{...common,diagramas:[]}});
  const files=[...generated.archivos,...frontend.archivos,...tests.archivos,...infra.archivos];
  const oldMigrations=JSON.parse(previous.archivos.find(file=>file.ruta==='backend/src/data/migrations.js').contenido.replace(/^module.exports = /,'').trim().replace(/;$/,''));
  const init=`CREATE TABLE schema_migrations(id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now());\n`+oldMigrations.flatMap(migration=>[...migration.statements,`INSERT INTO schema_migrations(id) VALUES ('${migration.id}')`]).join(';\n')+`;\nINSERT INTO producto(nombre,precio,cantidad,total,extra) VALUES ('conservado-antes-de-migrar',2,3,6,'{}');\n`;
  class UpgradeSandbox extends Sandbox {
    async _helpers(root,type){const result=await super._helpers(root,type);await fs.writeFile(path.join(root,'upgrade-init.sql'),init);const file=path.join(root,'verify.compose.yml');const source=await fs.readFile(file,'utf8');await fs.writeFile(file,source.replace('  database:\n','  database:\n    volumes: ["./upgrade-init.sql:/docker-entrypoint-initdb.d/10-upgrade.sql:ro"]\n'));return result;}
  }
  // El Compose exportado arranca una base nueva: también preparar v1 para la prueba de actualización.
  const exported=files.find(file=>file.ruta==='ops/docker-compose.yml');
  exported.contenido=exported.contenido.replace('      - database-data:','      - ../upgrade-init.sql:/docker-entrypoint-initdb.d/10-upgrade.sql:ro\n      - database-data:');
  files.push({ruta:'upgrade-init.sql',lenguaje:'sql',contenido:init});
  const run=promisify(execFile);const result=await new UpgradeSandbox({run:async(command,args,options)=>{console.log('[Docker]',args.slice(0,12).join(' '));return run(command,args,options);}}).verificar({tipo:'paquete_entrega',archivos:files});
  const dir=path.resolve(__dirname,'../verification-results/extended-modules');await fs.mkdir(dir,{recursive:true});const report=path.join(dir,backend+'-'+Date.now()+'.json');await fs.writeFile(report,JSON.stringify({backend,sha256:crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex'),...result},null,2));
  console.log(JSON.stringify({estado:result.estado,errores:result.errores,informe:report,pruebas:result.pruebas.map(({paso,resultado})=>({paso,resultado}))},null,2));if(result.estado!=='apta')process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
