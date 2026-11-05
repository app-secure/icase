const {HttpError,tableFor}=require('../data/store-support');
const model=require('../data/model');
const quote=name=>'"'+String(name).replace(/"/g,'""')+'"';
function repository(store){
  const withTransaction=async run=>{
    const client=await store.pool.connect();
    try{await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');await client.query("SET LOCAL statement_timeout = '10s'");await client.query("SET LOCAL lock_timeout = '5s'");const result=await run(client);await client.query('COMMIT');return result;}
    catch(error){await client.query('ROLLBACK').catch(()=>{});if(['40001','40P01','55P03'].includes(error.code))throw new HttpError(409,'Conflicto concurrente: vuelve a consultar y reintenta');throw error;}
    finally{client.release();}
  };
  const transactionalStore=client=>Object.assign(Object.create(Object.getPrototypeOf(store)),{pool:{query:(...args)=>client.query(...args)},processExecution:true});
  const lockRecords=async(client,p,records)=>{
    const targets=Object.entries(p.records).map(([alias,key])=>({key,id:String(records[alias]),...tableFor(model,key)})).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
    for(const target of targets){const result=await client.query('SELECT id FROM '+quote(target.name)+' WHERE id=$1 FOR UPDATE',[target.id]);if(!result.rows.length)throw new HttpError(404,'Registro del proceso inexistente');}
  };
  return {
    list:async(definitions,offset=0)=>{const rows=await store.pool.query("SELECT id,document->>'definition' AS definition,document->>'state' AS state,(document->>'version')::int AS version FROM icase_process_instances WHERE document->>'definition'=ANY($1::text[]) ORDER BY id LIMIT 21 OFFSET $2",[definitions,offset]);return {data:rows.rows.slice(0,20),has_more:rows.rows.length>20};},
    read:async id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw new HttpError(404,'Instancia inexistente');const row=(await store.pool.query('SELECT document FROM icase_process_instances WHERE id=$1',[id])).rows[0];if(!row)throw new HttpError(404,'Instancia inexistente');return row.document;},
    start:(instance,p)=>withTransaction(async client=>{await lockRecords(client,p,instance.records);const tx=transactionalStore(client);for(const [alias,key]of Object.entries(p.records))if(!await tx.getRecord(key,instance.records[alias]))throw new HttpError(404,'Registro del proceso inexistente');await client.query('INSERT INTO icase_process_instances (id,document) VALUES ($1,$2::jsonb)',[instance.id,JSON.stringify(instance)]);for(const [alias,key] of Object.entries(p.records)){const {name}=tableFor(model,key);const lock=await client.query('INSERT INTO icase_process_locks (record_table,record_id,instance_id) VALUES ($1,$2,$3) ON CONFLICT(record_table,record_id) DO UPDATE SET instance_id=EXCLUDED.instance_id WHERE icase_process_locks.instance_id=EXCLUDED.instance_id RETURNING instance_id',[name,String(instance.records[alias]),instance.id]);if(!lock.rows.length)throw new HttpError(409,'El registro ya pertenece a otro proceso');}return {id:instance.id,state:instance.state,version:instance.version};}),
    transaction:async(id,run)=>{const changed=new Set();const result=await withTransaction(async client=>{
      if(!/^[a-f0-9-]{36}$/.test(id))throw new HttpError(404,'Instancia inexistente');
      const instance=(await client.query('SELECT document FROM icase_process_instances WHERE id=$1 FOR UPDATE',[id])).rows[0]?.document;
      if(!instance)throw new HttpError(404,'Instancia inexistente');
      const tx=transactionalStore(client);
      const update=tx.update.bind(tx);tx.update=async(key,...args)=>{const value=await update(key,...args);if(value)changed.add(key);return value;};
      tx.save=next=>client.query('UPDATE icase_process_instances SET document=$2::jsonb WHERE id=$1',[id,JSON.stringify(next)]);
      tx.unlock=()=>client.query('DELETE FROM icase_process_locks WHERE instance_id=$1',[id]);
      // El aviso y el cambio se guardan juntos; el worker solo ve filas confirmadas.
      const result=await run(tx,instance);
      if(store.processOutboxEnabled&&changed.size){
        await client.query('SELECT pg_advisory_xact_lock(727276)');
        const count=Number((await client.query('SELECT count(*) AS total FROM icase_process_outbox WHERE delivered_at IS NULL')).rows[0].total);
        if(count+changed.size>10000)throw new HttpError(503,'Cola de avisos llena: reintenta cuando se recupere el transporte');
        for(const key of changed)await client.query('INSERT INTO icase_process_outbox (instance_id,version,operation) VALUES ($1,$2,$3) ON CONFLICT(instance_id,version,operation) DO NOTHING',[id,result.version,key]);
      }
      return result;
    });return result;}
  };
}
module.exports={repository};
