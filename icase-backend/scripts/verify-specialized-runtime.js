const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {promisify}=require('node:util'),{execFile}=require('node:child_process');
const Backend=require('../src/infrastructure/services/BackendScaffoldGenerator'),Frontend=require('../src/infrastructure/services/FrontendScaffoldGenerator'),Tests=require('../src/infrastructure/services/TestSuiteGenerator'),Infrastructure=require('../src/infrastructure/services/InfrastructureGenerator'),Sandbox=require('../src/infrastructure/services/SandboxRuntimeVerifier');
async function generate(mode='integrations',backend='Express'){
 const realtime=mode==='realtime',processes=mode==='processes';if(!realtime&&!processes&&mode!=='integrations')throw new Error('Usa realtime, integrations o processes');
 const proyecto={nombre:realtime?'Biblioteca replicada':'Lugares e integraciones de prueba'};
 const requerimientos=(realtime?['Gestionar autores','Gestionar libros']:['Gestionar lugares']).map((nombre,index)=>({identificador:'RF-0'+(index+1),nombre,tipo:'RF',aprobado:true}));
 const selected=processes?['procesos_negocio','eventos_cambios']:realtime?['eventos_cambios','eventos_replicas','camara_qr']:['pagos_prueba','sso_oidc','mapas','camara_qr'];
 const decisiones={stack_tecnologico:{backend,base_datos:'PostgreSQL'},alcance_plataforma:{plataformas:['web','android']},control_acceso:{autenticacion:{metodo:'jwt',expiracion:'1h'},roles:[{nombre:'Editor',incluir:true}],permisos:requerimientos.map(rf=>({operacion:rf.identificador,rol:'editor',metodos:['GET','POST','PATCH','DELETE']}))},modulos:{modo:'personalizado',modulos:[...selected.map(id=>({id,activo:true})),{id:'datos_iniciales',activo:false}],pruebas_integracion:realtime?{operation:'rf-01'}:{operation:'rf-01',amountField:'importe_menor',latitude:'latitud',longitude:'longitud'}}};
 if(processes){decisiones.modulos.procesos=[{id:'revision',estado_decision:'confirmado',rf:['RF-01'],states:['pendiente','cerrado'],initial:'pendiente',terminal:['cerrado'],start_roles:['administrador'],records:{primero:'rf-01',segundo:'rf-01'},actions:[{id:'cerrar',from:'pendiente',to:'cerrado',roles:['administrador'],different_actor:true,steps:[{record:'primero',expect:{estado:'pendiente'},set:{estado:'cerrado'}},{record:'segundo',expect:{estado:'pendiente'},set:{estado:'cerrado'}}]}]}];delete decisiones.modulos.pruebas_integracion;}
 const domain=processes?'@startuml\nclass Lugar {\n String nombre\n String estado\n}\n@enduml':realtime?'@startuml\nclass Autor {\n String nombre\n}\nclass Libro {\n String titulo\n}\nAutor "*" -- "*" Libro : publicaciones\n@enduml':'@startuml\nclass Lugar {\n String nombre\n int importe_menor\n double latitud\n double longitud\n}\n@enduml';
 const base={proyecto,versionesOrigen:{}};
 const generated=await new Backend().generar({...base,insumos:{decisiones,requerimientos,diagramaDominio:{codigo_plantuml:domain}}});
 const frontend=await new Frontend().generar({...base,insumos:{decisiones,diseno:{manifiesto_navegacion:requerimientos.map((rf,index)=>({pantalla_id:'screen-'+index,nombre:rf.nombre,ruta:'/screen-'+index,rf_trazabilidad:[rf.identificador]})),mockups:[]}}});
 const common={decisiones,requerimientos,backend:{...generated,version:1},frontend:{...frontend,version:1}};
 const tests=await new Tests().generar({...base,insumos:common}),infrastructure=await new Infrastructure().generar({...base,insumos:{...common,diagramas:[]}});
 if(processes){tests.archivos.push({ruta:'tests/integration/processes.test.js',lenguaje:'javascript',contenido:await fs.readFile(path.join(__dirname,'../src/infrastructure/templates/verification/processes.integration.template'),'utf8')});tests.archivos.push({ruta:'tests/e2e/processes.spec.js',lenguaje:'javascript',contenido:await fs.readFile(path.join(__dirname,'../src/infrastructure/templates/verification/processes.e2e.template'),'utf8')});}
 return {proyecto,decisiones,generated,frontend,tests,infrastructure,artifact:{tipo:'paquete_entrega',archivos:[...generated.archivos,...frontend.archivos,...tests.archivos,...infrastructure.archivos]}};
}
async function main(){
 const mode=process.argv[2]||'integrations',backend=process.argv[3]||'Express',data=await generate(mode,backend),run=promisify(execFile);
 const result=await new Sandbox({run:async(command,args,options)=>{console.log('[Docker]',args.slice(0,12).join(' '));return run(command,args,options);}}).verificar(data.artifact);
 const dir=path.resolve(__dirname,'../verification-results/specialized');await fs.mkdir(dir,{recursive:true});const report=path.join(dir,mode+'-'+backend+'-'+Date.now()+'.json');
 await fs.writeFile(report,JSON.stringify({mode,backend,sha256:crypto.createHash('sha256').update(JSON.stringify(data.artifact.archivos)).digest('hex'),...result},null,2));
 console.log(JSON.stringify({estado:result.estado,errores:result.errores,informe:report,pruebas:result.pruebas.map(({paso,resultado})=>({paso,resultado}))},null,2));if(result.estado!=='apta')process.exitCode=1;
}
module.exports={generate};if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
