const {randomUUID}=require('node:crypto');
// Pub/Sub transporta únicamente invalidaciones internas; cada réplica reautoriza sus clientes.
async function createRedisBridge({url,namespace,receive,onFailure}) {
  if(!/^[a-zA-Z0-9:_-]{16,120}$/.test(namespace||''))throw new Error('EVENTS_NAMESPACE debe ser único por aplicación/entorno y tener 16–120 caracteres');
  const {createClient}=require('redis');
  const publisher=createClient({url,disableOfflineQueue:true,socket:{connectTimeout:5000}}),subscriber=publisher.duplicate();
  const pending=new Map();let draining=false,closed=false;
  const enqueue=event=>{
    if(closed||pending.size>=200)return;
    pending.set(JSON.stringify(event),event);
    if(draining)return;draining=true;
    void (async()=>{try{while(pending.size&&!closed){const [key,event]=pending.entries().next().value;pending.delete(key);await receive(event).catch(()=>{});}}finally{draining=false;}})();
  };
  const instance=randomUUID(),channel='icase:invalidations:'+namespace;
  for(const client of [publisher,subscriber])client.on('error',()=>onFailure());
  try {
    await Promise.all([publisher.connect(),subscriber.connect()]);
    await subscriber.subscribe(channel,message=>{
      if(Buffer.byteLength(message)>16384)return;
      try{const event=JSON.parse(message);if(event.instance!==instance&&typeof event.instance==='string')enqueue(event.event);}catch{/* Nunca ejecutar contenido del broker. */}
    });
  }catch(error){for(const client of [publisher,subscriber])if(client.isOpen)client.destroy();throw new Error('No se pudo iniciar la coordinación Redis');}
  return {
    publish:event=>publisher.publish(channel,JSON.stringify({instance,event})),
    close:async()=>{closed=true;pending.clear();for(const client of [subscriber,publisher])if(client.isOpen)await client.quit().catch(()=>client.destroy());}
  };
}
module.exports={createRedisBridge};
