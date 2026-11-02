import { io } from 'socket.io-client';

// Los avisos nunca son datos: se vuelve a consultar la API autorizada.
export function subscribeChanges({ url, token, operations, onChange, onState = () => {}, active = true }) {
  let closed = false;
  let paused = !active;
  let timer;
  let running = false;
  let pending = false;
  const keys = [...new Set(operations)].slice(0, 20);
  const socket = io(url || undefined, {
    autoConnect: false, transports: ['websocket'], path: '/socket.io',
    auth: { token }, reconnectionAttempts: 5, reconnectionDelay: 500, timeout: 10000
  });
  const refresh = () => {
    if (closed || paused) return;
    pending = true;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (closed || paused || running) return;
      running = true;
      pending = false;
      try { await onChange(); } catch { /* La pantalla muestra los errores HTTP. */ }
      finally { running = false; if (pending && !closed && !paused) refresh(); }
    }, 100);
  };
  socket.on('connect', () => {
    onState('conectando');
    socket.timeout(10000).emit('subscribe', keys, (error, result) => {
      if (closed || paused || !socket.connected) return;
      if (error || result?.ok !== true) { onState('no disponible'); socket.disconnect(); return; }
      onState('activo');
      refresh(); // Recuperar cambios perdidos durante desconexiones, sin replay.
    });
  });
  socket.on('records:changed', (event) => {
    if (keys.includes(event?.operation) && ['POST', 'PATCH', 'DELETE'].includes(event?.method)) refresh();
  });
  socket.on('disconnect', () => { if (!closed && !paused) onState('desconectado'); });
  socket.on('connect_error', () => { if (!closed && !paused) onState('no disponible'); });
  const reconcile=setInterval(()=>{if(!closed&&!paused){if(!socket.connected)socket.connect();refresh();}},30000);
  const dispose = () => {
    closed = true;
    clearTimeout(timer);
    clearInterval(reconcile);
    socket.removeAllListeners();
    socket.disconnect();
    socket.auth = {};
  };
  dispose.pause = () => { paused = true; pending = false; clearTimeout(timer); socket.disconnect(); };
  dispose.resume = () => { if (!closed) { paused = false; socket.connect(); } };
  if (active) socket.connect();
  return dispose;
}
