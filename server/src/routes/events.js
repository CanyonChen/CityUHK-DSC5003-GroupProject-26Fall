'use strict';

const express = require('express');
const { sendOk, wrap } = require('../lib/http');
const { intParam, pageParams, optionalString } = require('../lib/params');
const catalog = require('../services/catalog');

const router = express.Router();

// API-06 Event list
router.get(
  '/',
  wrap(async (req, res) => {
    const { page, pageSize, offset } = pageParams(req.query);
    const keyword = optionalString(req.query.keyword, 'keyword', 100);
    const data = await catalog.listEvents({ keyword, page, pageSize, offset });
    return sendOk(res, data);
  })
);

// API-07 Event detail
router.get(
  '/:eventId',
  wrap(async (req, res) => {
    const eventId = intParam(req.params.eventId, 'event_id');
    const data = await catalog.getEvent(eventId);
    return sendOk(res, data);
  })
);

module.exports = router;
