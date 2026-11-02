// Ejecutar desde la raíz de la entrega. Vista previa por defecto, sin sobrescribir archivos.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const digest=value=>hash(JSON.stringify(value));
async function safePath(root,relative) {
  if(typeof relative!=='string'||relative.includes('\\')||relative.includes(':')||relative.startsWith('/')||relative.split('/').some(part=>!part||part==='.'||part==='..')||relative.split('/').some(part=>['.git','node_modules','app-data','uploads','.ssh','.aws'].includes(part.toLowerCase()))||relative.split('/').some(part=>part.toLowerCase().startsWith('.env')&&part!=='.env.example')) throw new Error('Ruta no permitida: '+relative);
  const absolute=path.resolve(root,...relative.split('/'));
  if(!absolute.startsWith(root+path.sep)) throw new Error('Ruta fuera de la entrega');
  let current=root;
  for(const part of relative.split('/')) {current=path.join(current,part);try{if((await fs.lstat(current)).isSymbolicLink())throw new Error('No se siguen enlaces simbólicos: '+relative);}catch(error){if(error.code!=='ENOENT')throw error;}}
  return absolute;
}
const read=async file=>{try{return await fs.readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}};
async function planUpdate(root,incoming) {
  root=await fs.realpath(root);incoming=await fs.realpath(incoming);
  const baseFile=await safePath(root,'.icase/baseline.json');
  const old=JSON.parse(await fs.readFile(baseFile,'utf8'));
  const next=JSON.parse(await fs.readFile(await safePath(incoming,'.icase/baseline.json'),'utf8'));
  if(!Array.isArray(old.files)||!Array.isArray(next.files))throw new Error('Baseline inválida');
  const previous=new Map(old.files.map(file=>[file.ruta,file.contenido]));const seen=new Set();const changes=[];
  for(const file of next.files) {
    const key=file.ruta?.toLowerCase();if(seen.has(key)||typeof file.contenido!=='string'||key?.startsWith('.icase/'))throw new Error('Baseline duplicada o inválida');seen.add(key);
    const target=await safePath(root,file.ruta),source=await safePath(incoming,file.ruta);
    if(await read(source)!==file.contenido)throw new Error('El archivo entrante no coincide con su baseline: '+file.ruta);
    const local=await read(target),base=previous.get(file.ruta);
    const action=local===file.contenido?'unchanged':local===null?(base===undefined?'add':'conflict'):base===undefined?'conflict':local===base?'update':file.contenido===base?'preserve_manual':'conflict';
    if(file.ruta.startsWith('backend/db/migrations/')&&base!==undefined&&base!==file.contenido)throw new Error('No se reescriben migraciones históricas');
    changes.push({ruta:file.ruta,action,before:local===null?null:hash(local),after:hash(file.contenido),diff:action==='update'||action==='conflict'?{before:(local||'').split('\n').slice(0,80),after:file.contenido.split('\n').slice(0,80)}:undefined});
  }
  for(const [ruta] of previous)if(!seen.has(ruta.toLowerCase()))changes.push({ruta,action:'preserve_removed'});
  return {root,incoming,changes,approval:digest({old,next,changes}),next};
}
async function applyUpdate(plan,approval) {
  const current=await planUpdate(plan.root,plan.incoming);
  if(approval!==current.approval)throw new Error('La aprobación no coincide con la vista previa vigente');
  if(current.changes.some(change=>change.action==='conflict'))throw new Error('Existen conflictos; resuélvelos antes de aplicar');
  const backup='.icase/backups/'+Date.now()+'-'+crypto.randomBytes(4).toString('hex');const contents=new Map(current.next.files.map(file=>[file.ruta,file.contenido]));
  for(const change of current.changes.filter(change=>['add','update'].includes(change.action))) {
    const target=await safePath(current.root,change.ruta),old=await read(target);
    if((old===null?null:hash(old))!==change.before)throw new Error('El archivo cambió durante la actualización: '+change.ruta);
    if(old!==null) {const destination=await safePath(current.root,backup+'/'+change.ruta);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,old,{flag:'wx'});}
    await fs.mkdir(path.dirname(target),{recursive:true});
    const temp=await safePath(current.root,change.ruta+'.icase-tmp-'+crypto.randomBytes(8).toString('hex'));
    await fs.writeFile(temp,contents.get(change.ruta),{flag:'wx'});await fs.rename(temp,target);
  }
  const baseline=await safePath(current.root,'.icase/baseline.json');
  await fs.copyFile(baseline,await safePath(current.root,backup+'/baseline.json').then(async file=>{await fs.mkdir(path.dirname(file),{recursive:true});return file;}));
  await fs.writeFile(baseline,JSON.stringify(current.next,null,2));
  return {applied:true,backup,changes:current.changes};
}
module.exports={planUpdate,applyUpdate,safePath};
if(require.main===module) (async()=>{
  const args=process.argv.slice(2),source=args[args.indexOf('--from')+1];if(!args.includes('--from')||!source)throw new Error('Uso: node tools/update.cjs --from carpeta [--apply --approve HASH]');
  const plan=await planUpdate(process.cwd(),source);
  if(args.includes('--apply'))console.log(JSON.stringify(await applyUpdate(plan,args[args.indexOf('--approve')+1]),null,2));
  else console.log(JSON.stringify({changes:plan.changes,approval:plan.approval},null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
