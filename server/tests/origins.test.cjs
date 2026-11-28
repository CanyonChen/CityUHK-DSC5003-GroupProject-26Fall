'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseOrigins, createOriginPolicy } = require('../src/lib/origins');
test('hosted REST and WebSocket origins use an exact allowlist', () => {
  const policy = createOriginPolicy({ origins: parseOrigins('https://tickets.example.org,https://admin.example.org/') });
  assert.equal(policy('https://tickets.example.org'), true);
  for (const origin of ['https://tickets.example.org.evil.test', 'http://tickets.example.org', 'null', 'https://tickets.example.org/path', 'http://localhost:8080']) assert.equal(policy(origin), false);
  assert.equal(policy(undefined), true);
});
test('local demos remain available without exposing arbitrary origins', () => {
  const policy = createOriginPolicy({ allowLocal: true });
  for (const origin of ['http://127.0.0.1:8080', 'http://localhost:8081', 'http://[::1]:8081']) assert.equal(policy(origin), true);
  assert.equal(policy('https://unlisted.example.org'), false);
});
test('invalid hosted configuration fails closed', () => {
  for (const origin of ['*', 'https://user:secret@example.org', 'https://example.org/path', 'http://example.org', 'https://example.org?key=x']) assert.throws(() => parseOrigins(origin));
});
