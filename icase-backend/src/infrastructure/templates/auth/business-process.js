const {randomUUID,createHash}=require('node:crypto');
const {HttpError}=require('../data/store-support');
function engine({definitions,repository,authorize}){
  const definition=id=>{const p=definitions.find(item=>item.id===id);if(!p)throw new HttpError(404,'Proceso inexistente');return p;};
  const fingerprint=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
  const current=instance=>{const p=definition(instance.definition);if(instance.definition_hash!==fingerprint(p))throw new HttpError(409,'La definición del proceso cambió: requiere migración explícita de la instancia');return p;};
  const allowed=(roles,user)=>{if(!roles.includes(user.rol))throw new HttpError(403,'Rol no autorizado para esta acción');};
  const permissions=(p,user)=>{for(const key of new Set(Object.values(p.records))){authorize(user,'GET','/api/operations/'+key);authorize(user,'PATCH','/api/operations/'+key);}};
  const participant=(p,user)=>p.start_roles.includes(user.rol)||p.actions.some(a=>a.roles.includes(user.rol));
  return {
    catalog(user){return definitions.filter(p=>{try{permissions(p,user);return p.start_roles.includes(user.rol);}catch{return false;}}).map(p=>({id:p.id,records:p.records,initial:p.initial}));},
    async list(user,page=1){if(!Number.isSafeInteger(page)||page<1||page>10000)throw new HttpError(400,'Página inválida');const ids=definitions.filter(p=>{try{permissions(p,user);return p.start_roles.includes(user.rol)||p.actions.some(a=>a.roles.includes(user.rol));}catch{return false;}}).map(p=>p.id);return {...await repository.list(ids,(page-1)*20),page};},
    async read(user,id){const instance=await repository.read(id);const p=current(instance);permissions(p,user);if(!participant(p,user))throw new HttpError(403,'Rol ajeno al proceso');return {id,state:instance.state,version:instance.version,definition:p.id,records:instance.records,operations:[...new Set(Object.values(p.records))],actions:p.actions.filter(a=>a.from===instance.state&&a.roles.includes(user.rol)&&(!a.different_actor||instance.last_actor!==String(user.id))).map(a=>a.id),history:instance.history.map(({key,signature,...item})=>item)};},
    async start(user,id,records){
      const p=definition(id);allowed(p.start_roles,user);permissions(p,user);
      if(!records||Array.isArray(records)||typeof records!=='object'||Object.keys(records).length!==Object.keys(p.records).length||Object.keys(records).some(alias=>!Object.hasOwn(p.records,alias)||!/^\d{1,18}$/.test(String(records[alias]))))throw new HttpError(400,'Registros del proceso inválidos');
      records=Object.fromEntries(Object.entries(records).map(([alias,id])=>[alias,String(BigInt(id))]));
      return repository.start({id:randomUUID(),definition:p.id,definition_hash:fingerprint(p),state:p.initial,records,version:0,last_actor:String(user.id),history:[]},p);
    },
    async act(user,id,input){
      if(!input||!Number.isSafeInteger(input.version)||input.version<0||!/^[a-zA-Z0-9_-]{16,100}$/.test(input.key||'')||typeof input.action!=='string')throw new HttpError(400,'Acción, versión o clave de idempotencia inválida');
      return repository.transaction(id,async(tx,instance)=>{
        const p=current(instance);permissions(p,user);
        const a=p.actions.find(item=>item.id===input.action);if(!a)throw new HttpError(400,'Acción no definida');allowed(a.roles,user);
        const signature=createHash('sha256').update(JSON.stringify([user.id,input.action,input.version])).digest('hex');
        const old=instance.history.find(item=>item.key===input.key);
        if(old){if(old.signature!==signature)throw new HttpError(409,'Clave de idempotencia reutilizada');return {id,state:old.to,version:old.version,replayed:true};}
        if(instance.version!==input.version||instance.state!==a.from||p.terminal.includes(instance.state))throw new HttpError(409,'La versión o el estado del proceso cambió');
        if(a.different_actor&&instance.last_actor===String(user.id))throw new HttpError(403,'Esta acción requiere un actor diferente al anterior');
        if(instance.history.length>=100)throw new HttpError(409,'El proceso alcanzó el límite de acciones');
        for(const step of a.steps){
          const key=p.records[step.record],record=await tx.getRecord(key,instance.records[step.record]);
          if(!record)throw new HttpError(404,'Un registro del proceso ya no existe');
          if(Object.entries(step.expect||{}).some(([field,value])=>record.data[field]!==value))throw new HttpError(409,'Una precondición del proceso no se cumple');
          if(!await tx.update(key,instance.records[step.record],step.set))throw new HttpError(409,'No se pudo actualizar un registro');
        }
        const version=instance.version+1;
        await tx.save({...instance,state:a.to,version,last_actor:String(user.id),history:[...instance.history,{action:a.id,from:a.from,to:a.to,actor:String(user.id),at:new Date().toISOString(),version,key:input.key,signature}]});
        return {id,state:a.to,version,replayed:false};
      });
    }
  };
}
module.exports={engine};
