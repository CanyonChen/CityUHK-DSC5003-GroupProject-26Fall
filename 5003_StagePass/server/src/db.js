'use strict';

const mysql = require('mysql2/promise');
const cfg = require('./config');

const pool = mysql.createPool({
  host: cfg.db.host,
  port: cfg.db.port,
  user: cfg.db.user,
  password: cfg.db.password,
  database: cfg.db.database,
  connectionLimit: cfg.db.connectionLimit,
  waitForConnections: true,
  queueLimit: 0,
  charset: 'utf8mb4',
  // Store UTC in the database; parse DATETIME as UTC and emit ISO strings
  timezone: 'Z',
  supportBigNumbers: true,
  bigNumberStrings: false,
});

// Set strict mode and the UTC session time zone on every physical connection:
// Strict mode prevents NOT NULL / CHECK from being bypassed; UTC keeps NOW() and DATETIME(3) consistent
pool.on('connection', (conn) => {
  conn.query(`SET SESSION sql_mode = '${cfg.sqlMode}'`, (err) => {
    if (err) console.error('[db] Failed to set sql_mode:', err.message);
  });
  conn.query("SET SESSION time_zone = '+00:00'", (err) => {
    if (err) console.error('[db] Failed to set time_zone:', err.message);
  });
});

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function ping() {
  await query('SELECT 1');
  return true;
}

async function close() {
  await pool.end();
}

module.exports = { pool, query, ping, close };
