'use strict';

const express = require('express');
const { ApiError, sendOk, wrap } = require('../lib/http');
const { intParam, pageParams, optionalString, optionalDate } = require('../lib/params');
const { optionalAuth } = require('../middleware/auth');
const catalog = require('../services/catalog');
const recommendations = require('../services/seat-recommendations');

const router = express.Router();
const SALES_STATUSES = ['', 'all', 'on_sale', 'paused', 'closed'];

// API-08 Performance list
router.get(
  '/',
  wrap(async (req, res) => {
    const { page, pageSize, offset } = pageParams(req.query);
    const eventId =
      req.query.event_id === undefined || req.query.event_id === ''
        ? undefined
        : intParam(req.query.event_id, 'event_id');

    const dateFrom = optionalDate(req.query.date_from, 'date_from');
    const dateTo = optionalDate(req.query.date_to, 'date_to');
    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'date_from must not be later than date_to');
    }

    const salesStatus = optionalString(req.query.sales_status, 'sales_status', 20);
    if (!SALES_STATUSES.includes(salesStatus)) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'sales_status must be all, on_sale, paused, or closed'
      );
    }

    const data = await catalog.listPerformances({
      eventId,
      dateFrom,
      dateTo,
      salesStatus,
      page,
      pageSize,
      offset,
    });
    return sendOk(res, data);
  })
);

// API-10 Seat map (public; signed-in users also get holder_mine)
router.get(
  '/:performanceId/seats',
  optionalAuth,
  wrap(async (req, res) => {
    const performanceId = intParam(req.params.performanceId, 'performance_id');
    const userId = req.auth ? req.auth.userId : 0;
    const data = await catalog.getSeatMap(performanceId, userId);
    return sendOk(res, data);
  })
);

// API-47 Adjacent-seat recommendations (read-only; no reservation)
router.get(
  '/:performanceId/seat-recommendations',
  wrap(async (req, res) => {
    const performanceId = intParam(req.params.performanceId, 'performance_id');
    const partySize = intParam(req.query.party_size, 'party_size', { min: 2, max: 4 });
    const region = optionalString(req.query.region, 'region', 50).toUpperCase();
    if (!region) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'region is required');
    }
    let budgetCents = null;
    if (req.query.budget_cents !== undefined && req.query.budget_cents !== '') {
      budgetCents = intParam(req.query.budget_cents, 'budget_cents', {
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
      });
    }
    const limit = intParam(req.query.limit, 'limit', { min: 1, max: 10, fallback: 3 });
    const data = await recommendations.recommendAdjacentSeats({
      performanceId,
      partySize,
      region,
      budgetCents,
      limit,
    });
    return sendOk(res, data);
  })
);

// API-09 Performance detail
router.get(
  '/:performanceId',
  wrap(async (req, res) => {
    const performanceId = intParam(req.params.performanceId, 'performance_id');
    const data = await catalog.getPerformance(performanceId);
    return sendOk(res, data);
  })
);

module.exports = router;
