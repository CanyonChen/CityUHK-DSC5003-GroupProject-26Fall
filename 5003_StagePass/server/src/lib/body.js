'use strict';

const { ApiError } = require('./http');

function requireInt(value, field, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = typeof value === 'number' ? value : Number(value);
  if (value === null || value === undefined || !Number.isInteger(n) || n < min || n > max) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} must be an integer between ${min} and ${max}`);
  }
  return n;
}

function requireString(value, field, { min = 1, max = 255, trim = true } = {}) {
  if (typeof value !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} must be a string`);
  }
  const text = trim ? value.trim() : value;
  if (text.length < min || text.length > max) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} length must be between ${min} and ${max}`);
  }
  return text;
}

function optionalString(value, field, { max = 255 } = {}) {
  if (value === undefined || value === null || value === '') return null;
  return requireString(value, field, { max, min: 0 });
}

function requireArray(value, field, { min = 1, max = 100 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} must be an array of ${min}–${max} items`);
  }
  return value;
}

function idempotencyKey(req) {
  const raw = (req.get('Idempotency-Key') || '').trim();
  if (!raw) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Missing Idempotency-Key header');
  }
  if (raw.length > 100) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Idempotency-Key must be at most 100 characters');
  }
  return raw;
}

module.exports = { requireInt, requireString, optionalString, requireArray, idempotencyKey };
