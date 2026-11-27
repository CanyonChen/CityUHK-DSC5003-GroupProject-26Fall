import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import operations from '../src/locales/operations.js';
import programme from '../src/locales/programme.js';
import shell from '../src/locales/shell.js';
import { states } from '../src/locales/states.js';
import { errorText } from '../src/locales/errors.js';

test('admin screens reference existing message keys', () => {
  const catalog = { ...shell, ...programme, ...operations };
  for (const dir of [new URL('../src/', import.meta.url), new URL('../src/views/', import.meta.url)]) {
    for (const name of readdirSync(dir).filter(name => name.endsWith('.vue'))) {
      const view = readFileSync(new URL(name, dir), 'utf8');
      for (const [, key] of view.matchAll(/['"]((?:shell|programme|ops)\.\w+)['"]/g)) {
        assert.ok(Object.hasOwn(catalog, key), name + ' references ' + key);
      }
    }
  }
});

test('every admin message has three translations with the same interpolation fields', () => {
  const placeholders = text => [...new Set(text.match(/\{\w+\}/g) || [])].sort();
  for (const catalog of [shell, programme, operations, states]) {
    for (const [key, variants] of Object.entries(catalog)) {
      assert.equal(variants.length, 3, key);
      for (const text of variants) {
        assert.ok(text.trim(), key);
        assert.deepEqual(placeholders(text), placeholders(variants[0]), key);
      }
    }
  }
});

test('a stored error can be displayed in another language without repeating the request', () => {
  const validation = { code: 'VALIDATION_ERROR', message: 'sale_end_at: Sales must end before the performance starts' };
  assert.equal(errorText(validation, 0), validation.message);
  assert.match(errorText(validation, 1), /演出开始/);
  assert.match(errorText(validation, 2), /演出開始/);
  assert.match(errorText({ code: 'INVALID_CREDENTIALS' }, 2), /帳號或密碼/);
});
