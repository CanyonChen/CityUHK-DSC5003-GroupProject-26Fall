'use strict';

const { ApiError } = require('./http');

function intParam(raw, field, { min = 1, max = Number.MAX_SAFE_INTEGER, fallback } = {}) {
  if (raw === undefined || raw === null || raw === '') {
    if (fallback !== undefined) return fallback;
    throw new ApiError(400, 'VALIDATION_ERROR', `Missing parameter ${field}`);
  }
  const text = String(raw);
  if (!/^\d+$/.test(text)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} must be a positive integer`);
  }
  const n = Number(text);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} must be between ${min} and ${max}`);
  }
  return n;
}

function pageParams(query = {}) {
  const page = intParam(query.page, 'page', { fallback: 1 });
  const pageSize = intParam(query.page_size, 'page_size', { max: 100, fallback: 20 });
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function optionalString(raw, field, maxLength = 100) {
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} must be a string`);
  }
  const text = raw.trim();
  if (text.length > maxLength) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} must be at most ${maxLength} characters`);
  }
  return text;
}

function optionalDate(raw, field) {
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} must be YYYY-MM-DD`);
  }
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} is not a valid date`);
  }
  return raw;
}

module.exports = { intParam, pageParams, optionalString, optionalDate };
