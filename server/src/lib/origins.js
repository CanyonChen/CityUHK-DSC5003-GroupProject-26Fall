'use strict';
function loopback(hostname) { return ['localhost', '127.0.0.1', '[::1]'].includes(hostname); }
function parseOrigins(raw = '') {
  return [...new Set(raw.split(',').map(value => value.trim()).filter(Boolean).map(value => {
    let url;
    try { url = new URL(value); } catch { throw new Error('CORS_ORIGINS must contain complete HTTP(S) origins'); }
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback(url.hostname)))) {
      throw new Error('CORS_ORIGINS requires HTTPS origins without paths, credentials or wildcards; loopback HTTP is allowed');
    }
    return url.origin;
  }))];
}
function createOriginPolicy({ origins = [], allowLocal = false } = {}) {
  const approved = new Set(origins);
  return origin => {
    if (!origin) return true; // CLI and server-to-server clients do not send Origin.
    try {
      const url = new URL(origin);
      if (url.origin !== origin) return false;
      return approved.has(origin) || (allowLocal && loopback(url.hostname) && ['http:', 'https:'].includes(url.protocol));
    } catch { return false; }
  };
}
module.exports = { parseOrigins, createOriginPolicy };
