'use strict';

const express = require('express');
const { ApiError, sendOk, wrap } = require('../lib/http');
const { authenticate } = require('../middleware/auth');
const authService = require('../services/auth');

const router = express.Router();

function requireString(value, field, { min = 1, max = 255, trim = true } = {}) {
  if (typeof value !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} must be a string`);
  }
  const v = trim ? value.trim() : value;
  if (v.length < min || v.length > max) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} length must be between ${min} and ${max}`);
  }
  return v;
}

// API-01 Register
router.post(
  '/register',
  wrap(async (req, res) => {
    const body = req.body || {};
    const userName = requireString(body.user_name, 'user_name', { min: 4, max: 20 });
    const password = requireString(body.password, 'password', { min: 8, max: 64, trim: false });
    let displayName = null;
    if (body.display_name !== undefined && body.display_name !== null
        && String(body.display_name).trim() !== '') {
      displayName = requireString(body.display_name, 'display_name', { max: 50 });
    }
    const data = await authService.register({
      userName,
      password,
      displayName,
      requestId: req.requestId,
    });
    return sendOk(res, data, 201);
  })
);

// API-02 Sign in
router.post(
  '/login',
  wrap(async (req, res) => {
    const body = req.body || {};
    const userName = requireString(body.user_name, 'user_name', { max: 50 });
    const password = requireString(body.password, 'password', { max: 64, trim: false });
    const data = await authService.login(userName, password);
    return sendOk(res, data);
  })
);

// API-03 Sign out
router.post(
  '/logout',
  authenticate,
  wrap(async (req, res) => {
    await authService.logout({ userId: req.auth.userId, requestId: req.requestId });
    return res.status(204).end();
  })
);

// API-04 Current user
router.get(
  '/me',
  authenticate,
  wrap(async (req, res) => {
    const data = await authService.me(req.auth.userId);
    return sendOk(res, data);
  })
);

module.exports = router;
