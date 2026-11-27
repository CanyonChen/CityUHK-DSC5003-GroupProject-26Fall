'use strict';

const express = require('express');
const { ApiError, sendOk, wrap } = require('../lib/http');
const { requireInt, requireString } = require('../lib/body');
const { authenticate } = require('../middleware/auth');
const payments = require('../services/payments');

const router = express.Router();

// API-19 Payment notification (HMAC signature, no user token required)
router.post(
  '/notify',
  wrap(async (req, res) => {
    const signature = req.get('X-Signature') || '';
    const data = await payments.handleNotification({
      payload: req.body || {},
      rawBody: req.rawBody,
      signature,
      requestId: req.requestId,
    });
    return sendOk(res, data);
  })
);

router.use(authenticate);

// API-16 Create payment attempt
router.post(
  '/',
  wrap(async (req, res) => {
    const body = req.body || {};
    const orderId = requireInt(body.order_id, 'order_id');
    const result = await payments.createPayment({
      userId: req.auth.userId,
      orderId,
      requestId: req.requestId,
    });
    res.locals.realtime = { order_id: orderId };
    return sendOk(res, result.payment, result.reused ? 200 : 201);
  })
);

// API-17 Get payment
router.get(
  '/:paymentId',
  wrap(async (req, res) => {
    const paymentId = requireInt(req.params.paymentId, 'payment_id');
    const data = await payments.getPayment(paymentId, req.auth);
    return sendOk(res, data);
  })
);

// API-18 Simulate payment result
router.post(
  '/:paymentId/simulate',
  wrap(async (req, res) => {
    const paymentId = requireInt(req.params.paymentId, 'payment_id');
    const body = req.body || {};
    const result = requireString(body.result, 'result', { max: 20 });
    const data = await payments.simulate({
      userId: req.auth.userId,
      paymentId,
      result,
      requestId: req.requestId,
    });
    return sendOk(res, data);
  })
);

module.exports = router;
