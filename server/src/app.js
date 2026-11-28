'use strict';

const express = require('express');
const cors = require('cors');
const { ApiError, requestId, notFound, errorHandler } = require('./lib/http');
const realtime = require('./realtime');
const { resolveRealtimeScope } = require('./realtime-scope');
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const performanceRoutes = require('./routes/performances');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payments');
const ticketRoutes = require('./routes/tickets');
const adminRoutes = require('./routes/admin');

const app = express();
app.disable('x-powered-by');

const cfg = require('./config');
const { createOriginPolicy } = require('./lib/origins');
const acceptsOrigin = createOriginPolicy(cfg.cors);
app.use(requestId);
app.use((req, res, next) => {
  if (!acceptsOrigin(req.get('Origin'))) return next(new ApiError(403, 'ORIGIN_FORBIDDEN', 'This frontend origin is not configured'));
  next();
});
app.use(cors({
  origin(origin, callback) { callback(null, acceptsOrigin(origin)); },
  exposedHeaders: ['X-Request-Id'],
}));

app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms rid=${req.requestId}`
    );
    const requestPath = req.originalUrl.split('?')[0];
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      res.statusCode < 400 &&
      !requestPath.startsWith('/auth')
    ) {
      resolveRealtimeScope(req)
        .then((scope) => realtime.notifyChange(requestPath, scope))
        .catch(() => realtime.notifyChange(requestPath));
    }
  });
  next();
});
app.use(
  express.json({
    limit: '1mb',
    verify(req, res, buf) {
      req.rawBody = buf;
    },
  })
);

app.use(healthRoutes);
app.use('/auth', authRoutes);
app.use('/events', eventRoutes);
app.use('/performances', performanceRoutes);
app.use('/orders', orderRoutes);
app.use('/payments', paymentRoutes);
app.use('/tickets', ticketRoutes);
app.use('/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
