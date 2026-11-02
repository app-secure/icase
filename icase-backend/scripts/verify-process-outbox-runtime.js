const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{randomUUID}=require('node:crypto'),{promisify}=require('node:util'),{execFile}=require('node:child_process');
const {generate}=require('./verify-specialized-runtime');
async function main(){
 const backend=process.argv[2]||'Express';if(!['Express','NestJS'].includes(backend))throw new Error('Usa Express o NestJS');
 const run=promisify(execFile),project='icaseoutbox'+randomUUID().replaceAll('-',''),root=await fs.mkdtemp(path.join(os.tmpdir(),'icase-outbox-'));
 const compose=['compose','-p',project,'--env-file','verify.env','-f','ops/docker-compose.yml','-f','verify.outbox.yml'];
 const docker=async args=>run('docker',[...compose,...args],{cwd:root,timeout:900000,maxBuffer:4*1024*1024});let error,output='';
 try{
  const {artifact}=await generate('processes',backend);for(const file of artifact.archivos){const target=path.join(root,file.ruta);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,file.contenido);}
  await fs.writeFile(path.join(root,'verify.env'),'DB_NAME=outbox_test\nDB_USER=outbox_test\nDB_PASSWORD=isolated-only-password\nJWT_SECRET=isolated-only-outbox-test-not-production\n');
  await fs.writeFile(path.join(root,'verify.outbox.yml'),'services:\n  backend:\n    ports: !reset []\n    environment:\n      ICASE_OUTBOX_VERIFY: isolated\n  frontend:\n    ports: !reset []\nnetworks:\n  default:\n    internal: true\n');
  await docker(['build','backend']);await docker(['up','-d','--wait','database']);
  const definition=JSON.parse(artifact.archivos.find(file=>file.ruta==='backend/icase.manifest.json').contenido).procesos.definitions[0];
  const source='const VERIFIED_DEFINITION='+JSON.stringify(definition)+';\n'+await fs.readFile(path.join(__dirname,'../src/infrastructure/templates/verification/outbox.runtime.template'),'utf8');
  const result=await docker(['run','--rm','--no-deps','backend','node','-e',source]);output=result.stdout;console.log(output);
  const persisted=await docker(['run','--rm','--no-deps','-e','ICASE_OUTBOX_PHASE=persist','backend','node','-e',source]);output+=persisted.stdout;
  await docker(['restart','database']);await docker(['up','-d','--wait','database']);
  const recovered=await docker(['run','--rm','--no-deps','-e','ICASE_OUTBOX_PHASE=recover','backend','node','-e',source]);output+=recovered.stdout;console.log(persisted.stdout+recovered.stdout);
 }catch(failure){error=failure;output+='\n'+String(failure.stdout||'').slice(-1500);}
 finally{
  try{await docker(['down','-v','--rmi','local','--remove-orphans']);}catch{error=error||new Error('No se pudo limpiar el proyecto temporal '+project);}
  if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('icase-outbox-'))await fs.rm(root,{recursive:true,force:true});
 }
 const report={backend,estado:error?'fallida':'apta',alcance:'postgresql_aislado_publicacion_simulada',salida:output,error:error?'La verificación falló; revisar salida sin credenciales.':null};
 const folder=path.resolve(__dirname,'../verification-results/specialized');await fs.mkdir(folder,{recursive:true});const file=path.join(folder,'outbox-'+backend+'-'+Date.now()+'.json');await fs.writeFile(file,JSON.stringify(report,null,2));console.log(file);if(error)throw new Error(report.error);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
