'use strict';

const cfg = require('./config');
const app = require('./app');
const db = require('./db');
const realtime = require('./realtime');
const { startExpiryWorker } = require('./services/orders');
const reconciliation = require('./services/reconciliation');

async function main() {
  try {
    await db.ping();
    console.log(`[db] Connected ${cfg.db.host}:${cfg.db.port}/${cfg.db.database}`);
  } catch (err) {
    // Still start: /health returns 503 so the frontends and smoke tests see a clear state
    console.warn(`[db] Connection failed: ${err.message}; starting anyway, /health will return 503`);
  }

  const server = app.listen(cfg.port, cfg.host, () => {
    console.log(`[api] listening on http://${cfg.host}:${cfg.port} (v${cfg.version})`);
    startExpiryWorker();
    console.log('[api] Expired reservation cleanup started (every 10 seconds)');
    reconciliation.start();
  });
  realtime.attach(server);
  console.log('[api] WebSocket realtime endpoint enabled at /ws');

  const shutdown = async (signal) => {
    console.log(`[api] ${signal}, shutting down`);
    reconciliation.stop();
    realtime.close();
    server.close(async () => {
      try {
        await db.close();
      } finally {
        process.exit(0);
      }
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[api] Startup failed:', err);
  process.exit(1);
});
