'use strict';

const express = require('express');
const { ApiError, sendOk, wrap } = require('../lib/http');
const { pageParams, optionalDate, optionalString, intParam } = require('../lib/params');
const { requireInt, requireArray, idempotencyKey } = require('../lib/body');
const { authenticate, requireRole } = require('../middleware/auth');
const admin = require('../services/admin');
const refunds = require('../services/refunds');
const users = require('../services/users');
const reconciliation = require('../services/reconciliation');

const router = express.Router();
router.use(authenticate);

const ADMIN_ONLY = requireRole('ADMIN');
const CHECKER_OR_ADMIN = requireRole('ADMIN', 'CHECKER');

function optInt(raw, field) {
  if (raw === undefined || raw === null || raw === '') return undefined;
  return requireInt(raw, field);
}

// ---------------------------------------------------------------- helper lookups
router.get('/venues', ADMIN_ONLY, wrap(async (req, res) => {
  const data = await admin.listVenues();
  return sendOk(res, data);
}));

// ---------------------------------------------------------------- reconciliation
router.get('/reconciliation/status', ADMIN_ONLY, wrap(async (req, res) => {
  return sendOk(res, await reconciliation.status());
}));

router.post('/reconciliation/run', ADMIN_ONLY, wrap(async (req, res) => {
  const data = await reconciliation.run({ actorId: req.auth.userId, requestId: req.requestId });
  return sendOk(res, data);
}));

// ---------------------------------------------------------------- users & roles
router.get('/users', ADMIN_ONLY, wrap(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const data = await users.listUsers({
    keyword: optionalString(req.query.keyword, 'keyword', 100),
    role: optionalString(req.query.role, 'role', 20),
    page, pageSize, offset,
  });
  return sendOk(res, data);
}));

router.post('/users/:userId/roles', ADMIN_ONLY, wrap(async (req, res) => {
  const userId = requireInt(req.params.userId, 'user_id');
  const body = req.body || {};
  const data = await users.grantRole({
    userId,
    role: body.role,
    performanceId: body.performance_id === undefined || body.performance_id === null
      ? undefined
      : requireInt(body.performance_id, 'performance_id'),
    requestId: req.requestId,
    actorId: req.auth.userId,
  });
  return sendOk(res, data, 201);
}));

router.delete('/users/:userId/roles/:assignmentId', ADMIN_ONLY, wrap(async (req, res) => {
  const userId = requireInt(req.params.userId, 'user_id');
  const assignmentId = requireInt(req.params.assignmentId, 'assignment_id');
  await users.revokeRole({
    userId,
    assignmentId,
    requestId: req.requestId,
    actorId: req.auth.userId,
  });
  return res.status(204).end();
}));

// ---------------------------------------------------------------- events
router.get('/events', ADMIN_ONLY, wrap(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const data = await admin.listAdminEvents({
    keyword: optionalString(req.query.keyword, 'keyword', 100),
    status: optionalString(req.query.status, 'status', 30),
    page, pageSize, offset,
  });
  return sendOk(res, data);
}));

router.post('/events', ADMIN_ONLY, wrap(async (req, res) => {
  const data = await admin.createEvent({
    body: { ...(req.body || {}), actorId: req.auth.userId },
    requestId: req.requestId,
  });
  return sendOk(res, data, 201);
}));

router.patch('/events/:eventId', ADMIN_ONLY, wrap(async (req, res) => {
  const eventId = requireInt(req.params.eventId, 'event_id');
  const data = await admin.updateEvent({
    eventId, body: req.body || {}, actorId: req.auth.userId, requestId: req.requestId,
  });
  return sendOk(res, data);
}));

// ---------------------------------------------------------------- performances
router.get('/performances', ADMIN_ONLY, wrap(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const data = await admin.listAdminPerformances({
    eventId: optInt(req.query.event_id, 'event_id'),
    status: optionalString(req.query.status, 'status', 30),
    dateFrom: optionalDate(req.query.date_from, 'date_from'),
    dateTo: optionalDate(req.query.date_to, 'date_to'),
    page, pageSize, offset,
  });
  return sendOk(res, data);
}));

router.get('/performances/:performanceId', ADMIN_ONLY, wrap(async (req, res) => {
  const performanceId = requireInt(req.params.performanceId, 'performance_id');
  const data = await admin.getAdminPerformance(performanceId);
  return sendOk(res, data);
}));

router.post('/performances', ADMIN_ONLY, wrap(async (req, res) => {
  const data = await admin.createPerformance({
    body: req.body || {}, requestId: req.requestId, actorId: req.auth.userId,
  });
  return sendOk(res, data, 201);
}));

router.patch('/performances/:performanceId', ADMIN_ONLY, wrap(async (req, res) => {
  const performanceId = requireInt(req.params.performanceId, 'performance_id');
  const data = await admin.updatePerformance({
    performanceId, body: req.body || {}, requestId: req.requestId, actorId: req.auth.userId,
  });
  return sendOk(res, data);
}));

router.post('/performances/:performanceId/publish', ADMIN_ONLY, wrap(async (req, res) => {
  const performanceId = requireInt(req.params.performanceId, 'performance_id');
  const data = await admin.publishPerformance({ performanceId, requestId: req.requestId, actorId: req.auth.userId });
  return sendOk(res, data);
}));

router.post('/performances/:performanceId/sales', ADMIN_ONLY, wrap(async (req, res) => {
  const performanceId = requireInt(req.params.performanceId, 'performance_id');
  const action = (req.body || {}).action;
  const data = await admin.setSales({ performanceId, action, requestId: req.requestId, actorId: req.auth.userId });
  return sendOk(res, data);
}));

router.patch('/performances/:performanceId/price-tiers', ADMIN_ONLY, wrap(async (req, res) => {
  const performanceId = requireInt(req.params.performanceId, 'performance_id');
  const tiers = requireArray((req.body || {}).tiers, 'tiers', { min: 1, max: 10 });
  const data = await admin.updatePriceTiers({
    performanceId, tiers, requestId: req.requestId, actorId: req.auth.userId,
  });
  return sendOk(res, data);
}));

router.patch('/session-seats/:sessionSeatId', ADMIN_ONLY, wrap(async (req, res) => {
  const sessionSeatId = requireInt(req.params.sessionSeatId, 'session_seat_id');
  const data = await admin.setSessionSeatStatus({
    sessionSeatId, status: (req.body || {}).status, requestId: req.requestId, actorId: req.auth.userId,
  });
  return sendOk(res, data);
}));

router.patch('/performances/:performanceId/seat-status', ADMIN_ONLY, wrap(async (req, res) => {
  const performanceId = requireInt(req.params.performanceId, 'performance_id');
  const body = req.body || {};
  const data = await admin.bulkSetSeatStatus({
    performanceId,
    status: body.status,
    sessionSeatIds: body.session_seat_ids,
    region: body.region,
    rowNo: body.row_no,
    requestId: req.requestId,
    actorId: req.auth.userId,
  });
  return sendOk(res, data);
}));

// ---------------------------------------------------------------- check-in
router.get('/checker/performances', CHECKER_OR_ADMIN, wrap(async (req, res) => {
  const data = await admin.checkerPerformances({ userId: req.auth.userId, roles: req.auth.roles });
  return sendOk(res, data);
}));

router.post('/checkins', CHECKER_OR_ADMIN, wrap(async (req, res) => {
  const key = idempotencyKey(req);
  const body = req.body || {};
  const performanceId = requireInt(body.performance_id, 'performance_id');
  const data = await admin.checkin({
    ticketCode: body.ticket_code,
    performanceId,
    userId: req.auth.userId,
    roles: req.auth.roles,
    requestId: req.requestId,
    key,
  });
  return sendOk(res, data);
}));

router.get('/checkins', CHECKER_OR_ADMIN, wrap(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const data = await admin.listCheckins({
    userId: req.auth.userId,
    roles: req.auth.roles,
    performanceId: optInt(req.query.performance_id, 'performance_id'),
    dateFrom: optionalDate(req.query.date_from, 'date_from'),
    dateTo: optionalDate(req.query.date_to, 'date_to'),
    page, pageSize, offset,
  });
  return sendOk(res, data);
}));

// ---------------------------------------------------------------- stats & finance
router.get('/stats', ADMIN_ONLY, wrap(async (req, res) => {
  const data = await admin.salesStats({
    performanceId: optInt(req.query.performance_id, 'performance_id'),
    dateFrom: optionalDate(req.query.date_from, 'date_from'),
    dateTo: optionalDate(req.query.date_to, 'date_to'),
  });
  return sendOk(res, data);
}));

router.get('/orders', ADMIN_ONLY, wrap(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const data = await admin.adminOrders({
    status: optionalString(req.query.status, 'status', 30),
    performanceId: optInt(req.query.performance_id, 'performance_id'),
    dateFrom: optionalDate(req.query.date_from, 'date_from'),
    dateTo: optionalDate(req.query.date_to, 'date_to'),
    keyword: optionalString(req.query.keyword, 'keyword', 100),
    page, pageSize, offset,
  });
  return sendOk(res, data);
}));

router.get('/payments/exceptions', ADMIN_ONLY, wrap(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const type = optionalString(req.query.type, 'type', 30);
  if (type && !['unknown', 'mismatch', 'unprocessed', 'late'].includes(type)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'type must be unknown, mismatch, unprocessed, or late');
  }
  const data = await admin.paymentExceptions({ type, page, pageSize, offset });
  return sendOk(res, data);
}));

router.get('/refunds', ADMIN_ONLY, wrap(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const data = await admin.listRefunds({
    status: optionalString(req.query.status, 'status', 30),
    orderId: optInt(req.query.order_id, 'order_id'),
    page, pageSize, offset,
  });
  return sendOk(res, data);
}));

router.post('/refunds/:refundId/resolve', ADMIN_ONLY, wrap(async (req, res) => {
  const refundId = requireInt(req.params.refundId, 'refund_id');
  const data = await refunds.resolveRefund({
    refundId,
    result: (req.body || {}).result,
    requestId: req.requestId,
    actorId: req.auth.userId,
  });
  res.locals.realtime = { order_id: data.refund?.order_id };
  return sendOk(res, data);
}));

router.post('/payments/:paymentId/reconcile', ADMIN_ONLY, wrap(async (req, res) => {
  const paymentId = requireInt(req.params.paymentId, 'payment_id');
  const data = await admin.reconcilePayment({
    paymentId, requestId: req.requestId, actorId: req.auth.userId,
  });
  return sendOk(res, data);
}));

router.get('/audit-logs', ADMIN_ONLY, wrap(async (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const data = await admin.auditLogs({
    objectType: optionalString(req.query.object_type, 'object_type', 40),
    objectId: optInt(req.query.object_id, 'object_id'),
    action: optionalString(req.query.action, 'action', 40),
    dateFrom: optionalDate(req.query.date_from, 'date_from'),
    dateTo: optionalDate(req.query.date_to, 'date_to'),
    page, pageSize, offset,
  });
  return sendOk(res, data);
}));

module.exports = router;
