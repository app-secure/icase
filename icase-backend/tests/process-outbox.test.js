const {createWorker}=require('../src/infrastructure/templates/auth/business-process-outbox');
describe('worker outbox: confirmación y reintento acotado',()=>{
 let row,queries,released,pool;
 beforeEach(()=>{
  row={id:'1',operation:'rf-01',attempts:0};queries=[];released=jest.fn();
  pool={connect:async()=>({release:released,query:async(sql,args)=>{
   queries.push({sql,args});
   if(sql.startsWith('SELECT id,operation'))return {rows:row?[row]:[]};
   if(sql.startsWith('UPDATE'))row=null;
   return {rows:[]};
  }})};
 });
 test('marca entregado solo después de publicar y libera la conexión',async()=>{
  const publish=jest.fn(async()=>{expect(queries.some(q=>q.sql.includes('SET delivered_at'))).toBe(false);});
  const worker=createWorker({pool,publish,interval:60000});await worker.tick();await worker.stop();
  expect(publish).toHaveBeenCalledWith('rf-01');expect(queries.some(q=>q.sql.includes('SET delivered_at=now()'))).toBe(true);expect(released).toHaveBeenCalled();
 });
 test('un fallo conserva pendiente, aplica espera y no registra mensajes secretos',async()=>{
  const worker=createWorker({pool,publish:async()=>{throw new Error('sensitive-provider-message');},interval:60000});await worker.tick();await worker.stop();
  expect(queries.some(q=>q.sql.includes('last_error=\'publish_failed\''))).toBe(true);
  expect(JSON.stringify(queries)).not.toContain('sensitive-provider-message');expect(queries.some(q=>q.sql.includes('SET delivered_at=now()'))).toBe(false);
 });
 test('limita el tiempo de publicación y evita ejecuciones solapadas en el mismo worker',async()=>{
  const publish=jest.fn(()=>new Promise(()=>{})),worker=createWorker({pool,publish,publishTimeout:10,interval:60000});
  await Promise.all([worker.tick(),worker.tick()]);await worker.stop();expect(publish).toHaveBeenCalledTimes(1);expect(queries.some(q=>q.sql.includes('publish_failed'))).toBe(true);
 });
 test('hace rollback al fallar el ack y nunca guarda el error bruto',async()=>{
  const wrapped={connect:async()=>{const client=await pool.connect();return {release:client.release,query:async(sql,args)=>{if(sql.includes('SET delivered_at'))throw new Error('lost connection');return client.query(sql,args);}};}};
  const errors=jest.fn(),worker=createWorker({pool:wrapped,publish:async()=>{},onError:errors,interval:60000});await worker.tick();await worker.stop();
  expect(queries.some(q=>q.sql==='ROLLBACK')).toBe(true);expect(errors).toHaveBeenCalledWith('process_outbox_unavailable');expect(row).not.toBe(null);
 });
});
