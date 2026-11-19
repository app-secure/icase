// Publicación al menos una vez: confirmar transporte no equivale a confirmar cada cliente.
function createWorker({pool,publish,interval=1000,publishTimeout=5000,onError=()=>{}}){
  let stopped=false,running=null,timer,cycles=0;
  const send=event=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('publish_timeout')),publishTimeout);Promise.resolve().then(()=>publish(event.operation)).then(resolve,reject).finally(()=>clearTimeout(timeout));});
  async function batch(){
    if(++cycles%60===0)await pool.query("DELETE FROM icase_process_outbox WHERE id IN (SELECT id FROM icase_process_outbox WHERE delivered_at<now()-interval '7 days' LIMIT 100)");
    for(let i=0;i<10&&!stopped;i++){
      const client=await pool.connect();
      try{
        await client.query('BEGIN');await client.query("SET LOCAL statement_timeout = '10s'");await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
        const row=(await client.query('SELECT id,operation,attempts FROM icase_process_outbox WHERE delivered_at IS NULL AND available_at<=now() ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED')).rows[0];
        if(!row){await client.query('COMMIT');break;}
        let delivered=false;try{await send(row);delivered=true;}catch{/* Nunca persistir mensajes del proveedor ni credenciales. */}
        if(delivered)await client.query('UPDATE icase_process_outbox SET delivered_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1',[row.id]);
        else await client.query("UPDATE icase_process_outbox SET attempts=attempts+1,available_at=now()+($2 * interval '1 second'),last_error='publish_failed' WHERE id=$1",[row.id,Math.min(60,2**Math.min(Number(row.attempts),6))]);
        await client.query('COMMIT');
      }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
      finally{client.release();}
    }
  }
  const tick=()=>{if(stopped)return Promise.resolve();if(running)return running;running=batch().catch(()=>{try{onError('process_outbox_unavailable');}catch{}}).finally(()=>{running=null;});return running;};
  timer=setInterval(tick,interval);timer.unref?.();void tick();
  return {tick,stop:async()=>{stopped=true;clearInterval(timer);if(running)await running;}};
}
module.exports={createWorker};
