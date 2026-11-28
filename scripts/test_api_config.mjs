import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiBase, webSocketUrl } from '../shared/api-config.mjs';
const hosted = { protocol: 'https:', hostname: 'tickets.example.org', origin: 'https://tickets.example.org' };
test('hosted defaults use same-origin HTTPS and WSS with the API prefix', () => {
  const base = resolveApiBase(undefined, hosted);
  assert.equal(base, '/api');
  assert.equal(webSocketUrl(base, hosted), 'wss://tickets.example.org/api/ws');
  assert.equal(webSocketUrl(resolveApiBase('https://api.example.org/v1/', hosted), hosted), 'wss://api.example.org/v1/ws');
});
test('loopback development keeps its API default', () => {
  assert.equal(resolveApiBase(undefined, { protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:8080' }), 'http://127.0.0.1:3000');
});
test('mixed content and credential-bearing API URLs are rejected', () => {
  for (const value of ['http://api.example.org', '//evil.test', 'https://user:pass@example.org', 'https://example.org?token=x']) assert.throws(() => resolveApiBase(value, hosted));
});
