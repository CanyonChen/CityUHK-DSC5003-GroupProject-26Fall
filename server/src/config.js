'use strict';

const path = require('node:path');
const { parseOrigins } = require('./lib/origins');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const cfg = {
  env: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '127.0.0.1',
  port: toInt(process.env.PORT, 3000),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: toInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ticketing_system',
    connectionLimit: toInt(process.env.DB_POOL, 10),
    isolation: process.env.DB_TRANSACTION_ISOLATION || 'REPEATABLE READ',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-only-insecure-secret',
    expiresInSeconds: toInt(process.env.JWT_EXPIRES_SECONDS, 8 * 60 * 60),
  },
  // Business rules from the requirements: CFG-02 max 4 seats per order; CFG-06 refunds close 24 hours before the performance
  limits: {
    purchaseLimit: toInt(process.env.PURCHASE_LIMIT, 4),
    refundCutoffHours: toInt(process.env.REFUND_CUTOFF_HOURS, 24),
    holdSeconds: toInt(process.env.HOLD_SECONDS, 5 * 60),
    ticketQrSeconds: toInt(process.env.TICKET_QR_SECONDS, 60),
  },
  cors: {
    origins: parseOrigins(process.env.CORS_ORIGINS || ''),
    allowLocal: (process.env.NODE_ENV || 'development') !== 'production',
  },
  currency: process.env.CURRENCY || 'HKD',
  payment: {
    mode: (process.env.PAYMENT_MODE || 'test').toLowerCase(),
    notifySecret: process.env.PAYMENT_NOTIFY_SECRET || 'dev-notify-secret',
  },
  // Match schema.sql: application connections must also enable strict mode
  sqlMode:
    'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION',
  version: require('../package.json').version,
};

if (!['REPEATABLE READ', 'READ COMMITTED'].includes(cfg.db.isolation)) throw new Error('DB_TRANSACTION_ISOLATION must be REPEATABLE READ or READ COMMITTED');

if (cfg.env === 'production' && cfg.jwt.secret === 'dev-only-insecure-secret') {
  throw new Error('Production requires a separate JWT_SECRET');
}

if (cfg.env === 'production' && !cfg.cors.origins.length) throw new Error('Production requires CORS_ORIGINS for the hosted frontends');
if (cfg.env === 'production' && cfg.payment.notifySecret === 'dev-notify-secret') throw new Error('Production requires a separate PAYMENT_NOTIFY_SECRET');

module.exports = cfg;
