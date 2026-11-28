// Retain an intent across an uncertain response and page reload. Storage can be unavailable.
export function createIntentStore(storage, makeKey = () => crypto.randomUUID()) {
  const memory = new Map();
  const name = scope => 'cityuhk-events-hub.intent:' + JSON.stringify(scope);
  return {
    key(scope) {
      const id = name(scope);
      let key = memory.get(id);
      try { key ||= storage?.getItem(id); } catch { /* private browsing */ }
      if (!key) key = makeKey();
      memory.set(id, key);
      try { storage?.setItem(id, key); } catch { /* in-memory fallback */ }
      return key;
    },
    clear(scope) {
      const id = name(scope); memory.delete(id);
      try { storage?.removeItem(id); } catch { /* in-memory fallback */ }
    },
  };
}
export async function runIntent(store, scope, send) {
  try {
    const result = await send(store.key(scope));
    store.clear(scope);
    return result;
  } catch (error) {
    if (error.status >= 400 && error.status < 500 && error.code !== 'HTTP_ERROR') store.clear(scope);
    throw error;
  }
}
