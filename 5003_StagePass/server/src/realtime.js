'use strict';

const { WebSocketServer } = require('ws');

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

let wss = null;
let heartbeat = null;

function clientCount() {
  return wss ? wss.clients.size : 0;
}

function send(socket, payload) {
  if (socket.readyState !== 1) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    // A dead socket is removed by its own close handler.
  }
}

function broadcast(type, details = {}) {
  if (!wss) return 0;
  const payload = { type, at: new Date().toISOString(), ...details };
  let sent = 0;
  for (const socket of wss.clients) {
    if (socket.readyState === 1) {
      send(socket, payload);
      sent += 1;
    }
  }
  return sent;
}

/**
 * Invalidate client caches after a successful mutation. Clients refetch the
 * page they are on; the socket carries only a signal, never order or user data.
 */
function notifyChange(path, details = {}) {
  const scope = {};
  if (Number.isInteger(details.order_id)) scope.order_id = details.order_id;
  if (Number.isInteger(details.performance_id)) scope.performance_id = details.performance_id;
  const sent = broadcast('data.changed', { path, ...scope });
  const suffix = scope.order_id || scope.performance_id
    ? ` order=${scope.order_id || '-'} performance=${scope.performance_id || '-'}`
    : '';
  console.log(`[ws] data.changed path=${path}${suffix} clients=${sent}`);
  return sent;
}

function attach(server) {
  if (wss) return wss;

  wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 1024,
    verifyClient(info, done) {
      const origin = info.req.headers.origin;
      if (origin && !LOCAL_ORIGIN.test(origin)) {
        done(false, 403, 'Forbidden origin');
        return;
      }
      done(true);
    },
  });

  wss.on('connection', (socket, req) => {
    socket.isAlive = true;
    socket.on('pong', () => {
      socket.isAlive = true;
    });
    socket.on('error', () => {
      // Close handler owns cleanup.
    });
    send(socket, {
      type: 'connected',
      at: new Date().toISOString(),
      path: req.url,
    });
  });

  heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.isAlive === false) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      try {
        socket.ping();
      } catch {
        socket.terminate();
      }
    }
  }, 30000);
  heartbeat.unref();

  wss.on('close', () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
  });

  return wss;
}

function close() {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  if (!wss) return;
  for (const socket of wss.clients) socket.terminate();
  wss.close();
  wss = null;
}

module.exports = { attach, broadcast, notifyChange, clientCount, close };
