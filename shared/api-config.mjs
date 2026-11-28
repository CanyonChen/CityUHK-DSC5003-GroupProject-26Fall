function loopback(host) { return ['localhost', '127.0.0.1', '[::1]'].includes(host); }
export function resolveApiBase(configured, location) {
  const value = configured?.trim() || (location.protocol === 'http:' && loopback(location.hostname) ? 'http://127.0.0.1:3000' : '/api');
  if (value.startsWith('//')) throw new Error('API base must not be a protocol-relative URL');
  const relative = value.startsWith('/');
  const url = new URL(value, location.origin);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('API base must be an HTTP(S) URL or an absolute path without credentials, query or fragment');
  }
  if (location.protocol === 'https:' && url.protocol !== 'https:') throw new Error('An HTTPS frontend requires an HTTPS API');
  return relative ? url.pathname.replace(/\/+$/, '') : url.href.replace(/\/+$/, '');
}
export function webSocketUrl(base, location) {
  const url = new URL(base + '/ws', location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}
