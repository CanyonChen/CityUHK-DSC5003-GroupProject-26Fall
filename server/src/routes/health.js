'use strict';

const express = require('express');
const cfg = require('../config');
const db = require('../db');
const { sendOk } = require('../lib/http');
const { wrap } = require('../lib/http');

const router = express.Router();

// API-05 Health check: ping the database; return 503 when the database is unavailable
router.get(
  '/health',
  wrap(async (req, res) => {
    let dbState = 'down';
    try {
      await db.ping();
      dbState = 'ok';
    } catch {
      dbState = 'down';
    }
    const data = {
      status: dbState === 'ok' ? 'ok' : 'down',
      db: dbState,
      version: cfg.version,
      server_time: new Date().toISOString(),
    };
    if (dbState === 'ok') return sendOk(res, data);
    return res.status(503).json({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database unavailable',
      data,
      request_id: req.requestId,
    });
  })
);

module.exports = router;
