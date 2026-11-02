const {HttpError,tableFor}=require('../data/store-support');
const model=require('../data/model');
const quote=name=>'"'+String(name).replace(/"/g,'""')+'"';
async function execute(store,method,operation,id,body){
  if(!/^\d{1,18}$/.test(String(id)))return method==='remove'?false:null;
  id=String(BigInt(id));
  const {name}=tableFor(model,operation),client=await store.pool.connect();
  try{
    await client.query('BEGIN');await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query('SELECT id FROM '+quote(name)+' WHERE id=$1 FOR UPDATE',[id]);
    const lock=await client.query('SELECT instance_id FROM icase_process_locks WHERE record_table=$1 AND record_id=$2',[name,String(id)]);
    if(lock.rows.length)throw new HttpError(409,'Registro gobernado por un proceso: utiliza sus acciones, incluso después del cierre');
    const tx=Object.assign(Object.create(Object.getPrototypeOf(store)),{pool:{query:(...args)=>client.query(...args)},processExecution:true});
    const result=await tx[method](operation,id,body);await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK').catch(()=>{});if(['40P01','55P03'].includes(error.code))throw new HttpError(409,'Conflicto concurrente: reintenta después de consultar');throw error;}
  finally{client.release();}
}
module.exports={execute};
