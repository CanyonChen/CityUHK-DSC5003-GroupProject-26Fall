'use strict';

const crypto = require('node:crypto');

/** Business error with HTTP status and contract error code */
class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Request tracing: echo X-Request-Id when provided, otherwise generate one */
function requestId(req, res, next) {
  const incoming = req.get('X-Request-Id');
  const id =
    incoming && incoming.trim().length > 0 && incoming.length <= 64
      ? incoming.trim()
      : crypto.randomUUID();
  req.requestId = id;
  res.set('X-Request-Id', id);
  next();
}

function sendOk(res, data, status = 200) {
  res.status(status).json({
    code: 'OK',
    message: '',
    data: data === undefined ? null : data,
    request_id: res.req.requestId,
  });
}

function sendError(res, status, code, message, details) {
  const body = { code, message, request_id: res.req.requestId };
  if (details !== undefined) body.details = details;
  res.status(status).json(body);
}

function notFound(req, res) {
  sendError(res, 404, 'NOT_FOUND', `Endpoint not found: ${req.method} ${req.originalUrl.split('?')[0]}`);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return sendError(res, err.status, err.code, err.message, err.details);
  }
  if (err && err.type === 'entity.parse.failed') {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Request body is not valid JSON');
  }
  console.error(`[${req.requestId}] Unhandled exception:`, err);
  return sendError(res, 500, 'INTERNAL', 'Internal server error');
}

/** Forward async route rejections to errorHandler */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { ApiError, requestId, sendOk, sendError, notFound, errorHandler, wrap };
