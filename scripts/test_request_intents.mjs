import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntentStore, runIntent } from '../shared/request-intents.mjs';
function storage() { const m = new Map(); return { getItem: k => m.get(k), setItem: (k,v) => m.set(k,v), removeItem: k => m.delete(k) }; }
test('lost response and reload reuse the key; confirmed success starts a new intent', async () => {
  const disk = storage(); let n = 0; const make = () => 'key-' + ++n;
  let store = createIntentStore(disk, make); const scope = [1,'order',2,[3]];
  const sent = [];
  await assert.rejects(runIntent(store, scope, async k => { sent.push(k); throw new TypeError('connection lost after commit'); }));
  store = createIntentStore(disk, make);
  await runIntent(store, scope, async k => { sent.push(k); return { order_id: 9 }; });
  assert.deepEqual(sent, ['key-1','key-1']);
  assert.equal(store.key(scope), 'key-2');
});
test('uncertain replies keep intent, definitive rejection clears it and users stay isolated', async () => {
  let n = 0; const store = createIntentStore(storage(), () => String(++n)), scope = [1,'refund',8];
  const key = store.key(scope);
  await assert.rejects(runIntent(store, scope, async () => { throw {status:503}; }));
  assert.equal(store.key(scope), key);
  assert.notEqual(store.key([2,'refund',8]), key);
  await assert.rejects(runIntent(store, scope, async () => { throw {status:409,code:'REFUND_NOT_ALLOWED'}; }));
  assert.notEqual(store.key(scope), key);
});
test('blocked storage retains a key within the page', () => {
  const store = createIntentStore({ getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();} }, () => 'key');
  assert.equal(store.key(['x']), store.key(['x']));
});
