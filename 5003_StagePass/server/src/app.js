'use strict';

const express = require('express');
const cors = require('cors');
const { requestId, notFound, errorHandler } = require('./lib/http');
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

// Dual frontends 8080/8081 and local scripts; other origins are blocked
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || LOCAL_ORIGIN.test(origin)) return callback(null, true);
      return callback(null, false);
    },
    exposedHeaders: ['X-Request-Id'],
  })
);

// request_id must be assigned before body parsing so JSON parse failures still carry it
app.use(requestId);
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
