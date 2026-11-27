'use strict';

const express = require('express');
const { ApiError, sendOk, wrap } = require('../lib/http');
const { pageParams, optionalDate, optionalString } = require('../lib/params');
const { requireInt, requireArray, idempotencyKey } = require('../lib/body');
const { authenticate } = require('../middleware/auth');
const orders = require('../services/orders');
const refunds = require('../services/refunds');
const cfg = require('../config');

const router = express.Router();
router.use(authenticate);

const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'CANCELLED',
  'EXPIRED',
  'REFUND_PENDING',
  'REFUNDED',
];

// API-11 Create order (reserve the whole group)
router.post(
  '/',
  wrap(async (req, res) => {
    const body = req.body || {};
    const key = idempotencyKey(req);
    const performanceId = requireInt(body.performance_id, 'performance_id');
    const rawSeats = requireArray(body.session_seat_ids, 'session_seat_ids', { min: 1, max: 50 });
    if (rawSeats.length > cfg.limits.purchaseLimit) {
      throw new ApiError(409, 'LIMIT_EXCEEDED', `At most ${cfg.limits.purchaseLimit} seats per order`);
    }
    const seatIds = rawSeats.map((id, idx) => requireInt(id, `session_seat_ids[${idx}]`));
    if (new Set(seatIds).size !== seatIds.length) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'The same seat cannot be selected twice in one order');
    }

    const result = await orders.createOrder({
      userId: req.auth.userId,
      performanceId,
      seatIds,
      key,
      requestId: req.requestId,
    });
    res.locals.realtime = {
      order_id: result.order.order_id,
      performance_id: result.order.performance_id,
    };
    return sendOk(res, result.order, result.replayed ? 200 : 201);
  })
);

// API-13 My orders
router.get(
  '/',
  wrap(async (req, res) => {
    const { page, pageSize, offset } = pageParams(req.query);
    const status = optionalString(req.query.status, 'status', 30);
    if (status && !ORDER_STATUSES.includes(status)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'status is not a valid order status');
    }
    const dateFrom = optionalDate(req.query.date_from, 'date_from');
    const dateTo = optionalDate(req.query.date_to, 'date_to');
    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'date_from must not be later than date_to');
    }
    const data = await orders.listOrders({
      userId: req.auth.userId,
      status,
      dateFrom,
      dateTo,
      page,
      pageSize,
      offset,
    });
    return sendOk(res, data);
  })
);

// API-12 Order detail
router.get(
  '/:orderId',
  wrap(async (req, res) => {
    const orderId = requireInt(req.params.orderId, 'order_id');
    const data = await orders.getOrderForViewer(orderId, req.auth);
    return sendOk(res, data);
  })
);

// API-15 Request refund (full order)
router.post(
  '/:orderId/refund',
  wrap(async (req, res) => {
    const orderId = requireInt(req.params.orderId, 'order_id');
    const key = idempotencyKey(req);
    const reason = optionalString((req.body || {}).reason, 'reason', 255);
    const result = await refunds.requestRefund({
      orderId,
      userId: req.auth.userId,
      key,
      reason,
      requestId: req.requestId,
    });
    return sendOk(
      res,
      {
        ...result.refund,
        order_status: result.orderStatus,
      },
      result.replayed ? 200 : 201
    );
  })
);

// API-14 Cancel order
router.post(
  '/:orderId/cancel',
  wrap(async (req, res) => {
    const orderId = requireInt(req.params.orderId, 'order_id');
    const data = await orders.cancelOrder({
      orderId,
      userId: req.auth.userId,
      requestId: req.requestId,
    });
    return sendOk(res, data);
  })
);

module.exports = router;
