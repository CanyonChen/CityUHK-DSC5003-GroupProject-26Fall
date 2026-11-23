import { API_BASE } from './api';

/**
 * Subscribe to the API's invalidation channel. The payload is only a signal:
 * the browser still calls the normal authenticated REST endpoints to refetch.
 */
export function connectRealtime(onEvent) {
  const wsBase = API_BASE.replace(/^http/, 'ws').replace(/\/$/, '');
  let socket = null;
  let retryTimer = null;
  let closed = false;

  function scheduleReconnect() {
    if (closed || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      open();
    }, 2000);
  }

  function open() {
    if (closed) return;
    try {
      socket = new WebSocket(`${wsBase}/ws`);
    } catch {
      scheduleReconnect();
      return;
    }
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'data.changed') onEvent(payload);
      } catch {
        // Ignore malformed frames.
      }
    };
    socket.onclose = () => {
      socket = null;
      scheduleReconnect();
    };
    socket.onerror = () => {
      socket?.close();
    };
  }

  open();

  function stop() {
    closed = true;
    clearTimeout(retryTimer);
    retryTimer = null;
    socket?.close();
    socket = null;
  }

  return stop;
}
