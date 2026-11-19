// Canal de invalidación, no un bus de datos ni una garantía de entrega.
const { Server } = require('socket.io');

function attachChangeEvents(server, { store, auth, operations, associations = [], origins = [], bridge = null }) {
  if (!auth || !Array.isArray(operations)) throw new Error('El canal de cambios requiere autenticación y contrato.');
  const allowed = new Map(operations.map(operation => [operation.key, operation]));
  const attempts = new Map();
  const io = new Server(server, {
    serveClient: false, transports: ['websocket'], maxHttpBufferSize: 8192, cors: { origin: origins, credentials: false },
    allowRequest(request, done) {
      const now = Date.now();
      for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
      const ip = request.socket.remoteAddress || 'unknown';
      if (!attempts.has(ip) && attempts.size >= 2048) return done(null, false);
      const entry = attempts.get(ip) || { count: 0, until: now + 60000 };
      attempts.set(ip, entry);
      done(null, ++entry.count <= 300 && (!request.headers.origin || origins.includes(request.headers.origin)));
    }
  });
  const readUser = socket => auth.authenticate('Bearer ' + socket.handshake.auth.token);
  let connections = 0;
  io.use(async (socket, next) => {
    let reserved = false;
    const release = () => { if (reserved) { reserved = false; connections--; } };
    try {
      if (connections >= 200 || typeof socket.handshake.auth?.token !== 'string' || socket.handshake.auth.token.length > 8192) throw new Error();
      connections++; reserved = true;
      socket.conn.once('close', release);
      await readUser(socket); next();
    } catch { release(); next(new Error('No autorizado')); }
  });
  io.on('connection', socket => {
    socket.data.operations = new Set();
    let requests = 0, windowStart = Date.now();
    socket.on('subscribe', async (keys, acknowledge) => {
      const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
      if (Date.now() - windowStart >= 60000) { requests = 0; windowStart = Date.now(); }
      if (++requests > 30) { reply({ ok: false }); socket.disconnect(true); return; }
      try {
        if (!Array.isArray(keys) || keys.length > 20 || keys.some(key => typeof key !== 'string' || !allowed.has(key))) throw new Error();
        const user = await readUser(socket);
        for (const key of keys) auth.authorize(user, 'GET', '/api/operations/' + key);
        socket.data.operations = new Set(keys);
        reply({ ok: true });
      } catch { socket.data.operations.clear(); reply({ ok: false }); }
    });
  });
  async function receive(event) {
    if(!event||!Array.isArray(event.keys)||event.keys.length>200||event.keys.some(key=>!allowed.has(key))||!['POST','PATCH','DELETE'].includes(event.method))return;
    if(event.requires&&(!Array.isArray(event.requires)||event.requires.length>2||event.requires.some(group=>!Array.isArray(group)||!group.length||group.length>200||group.some(key=>!allowed.has(key)))))return;
    const {keys,method}=event;
    for (const socket of io.sockets.sockets.values()) {
      const subscriptions = keys.filter(item => socket.data.operations?.has(item));
      if (!subscriptions.length) continue;
      try {
        const user = await readUser(socket); // expiración, usuario desactivado y cambio de rol antes de cada aviso
        if(event.requires&&!event.requires.every(group=>group.some(key=>{try{auth.authorize(user,'GET','/api/operations/'+key);return true;}catch{return false;}})))continue;
        for (const operation of subscriptions) {
          auth.authorize(user, 'GET', '/api/operations/' + operation);
          socket.emit('records:changed', { operation, method });
        }
      } catch { socket.disconnect(true); }
    }
  }
  const queue=new Map();let draining=false,closed=false;
  function dispatch(event) {
    if(closed||queue.size>=200)return;
    queue.set(JSON.stringify(event),event);
    if(draining)return;draining=true;
    void (async()=>{try{while(queue.size&&!closed){const [id,event]=queue.entries().next().value;queue.delete(id);await receive(event);if(bridge)await bridge.publish(event).catch(()=>{});}}finally{draining=false;}})().catch(()=>{});
  }
  async function publish(key,method) {
    const source=allowed.get(key);if(!source)return;
    dispatch({keys:operations.filter(operation=>operation.key===key||(source.entity&&operation.entity===source.entity)).map(operation=>operation.key),method});
  }
  const previousNotification=store.notifyAssociationChange;
  const previousProcessNotification=store.notifyProcessChange;
  store.notifyProcessChange=async key=>{
    if(closed)throw new Error('transport_closed');
    const source=allowed.get(key);if(!source)throw new Error('unknown_operation');
    const event={keys:operations.filter(operation=>operation.key===key||(source.entity&&operation.entity===source.entity)).map(operation=>operation.key),method:'PATCH'};
    await receive(event);
    if(bridge)await bridge.publish(event); // No ocultar el fallo: el outbox debe reintentar.
  };
  store.notifyAssociationChange=(name,action)=>{
    const relation=associations.find(item=>item.table===name);if(!relation?.operations?.length)return;
    dispatch({keys:[...new Set(relation.operations.flat())],method:action==='link'?'PATCH':'DELETE',requires:relation.operations});
  };
  const originals = new Map();
  let pending = 0;
  for (const [name, method] of [['create', 'POST'], ['update', 'PATCH'], ['remove', 'DELETE']]) {
    const original = store[name];
    if (typeof original !== 'function') continue;
    originals.set(name, original);
    store[name] = async function(key, ...args) {
      const result = await original.call(this, key, ...args);
      if (result && pending < 20) {
        pending++;
        void publish(key, method).catch(() => {}).finally(() => { pending--; });
      }
      return result;
    };
  }
  return { io, receive, setBridge:value=>{bridge=value;}, disconnectClients:()=>{for(const socket of io.sockets.sockets.values())socket.disconnect(true);}, close: async () => {closed=true;queue.clear();for (const [name, original] of originals) store[name] = original;store.notifyAssociationChange=previousNotification;store.notifyProcessChange=previousProcessNotification;if(bridge)await bridge.close();return new Promise(resolve => io.close(resolve)); } };
}
async function connectChangeEvents(server,config) {
  if(config.requireRedis&&!process.env.EVENTS_REDIS_URL)throw new Error('Configura EVENTS_REDIS_URL para la coordinación aprobada');
  const channel=attachChangeEvents(server,config);
  if(process.env.EVENTS_REDIS_URL)try {
    const bridge=await require('./change-events-redis').createRedisBridge({url:process.env.EVENTS_REDIS_URL,namespace:process.env.EVENTS_NAMESPACE,receive:channel.receive,onFailure:channel.disconnectClients});
    channel.setBridge(bridge);
  }catch(error){await channel.close();throw error;}
  if(config.store.startProcessOutbox){
    const stop=config.store.startProcessOutbox(),close=channel.close;
    channel.close=async()=>{await stop();await close();};
  }
  return channel;
}
module.exports = { attachChangeEvents,connectChangeEvents };
