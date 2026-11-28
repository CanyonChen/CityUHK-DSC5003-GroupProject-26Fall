'use strict';
// Browser acceptance uses only synthetic data and the original text-code check-in flow.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '..');
const browserRequire = createRequire(path.join(ROOT, '.cache/browser-tools/package.json'));
const { chromium } = browserRequire('playwright');
const USER = 'http://127.0.0.1:8080', ADMIN = 'http://127.0.0.1:8081';
const BASE = process.env.BASE || 'http://127.0.0.1:3300';
const OUT = path.join(ROOT, '.cache/checks/browser');
const fixtures = JSON.parse(fs.readFileSync(path.join(ROOT, '.cache/checks/browser-fixtures.json'), 'utf8'));
const checks = [], pageErrors = [];
let browser, context, buyerToken, adminToken, user, admin;
async function api(method, endpoint, token, body) {
  const response = await fetch(BASE + endpoint, { method, signal: AbortSignal.timeout(15000), headers: {
    ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  const raw = await response.text(), result = raw ? JSON.parse(raw) : null;
  assert.ok(response.ok, method + ' ' + endpoint + ': ' + raw);
  return result?.data;
}
async function loginApi(name) { return (await api('POST', '/auth/login', null, { user_name: name, password: 'Demo@1234' })).token; }
async function eventually(condition, message, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(message);
}
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true }); }
async function visible(locator) { await locator.waitFor({ state: 'visible' }); }
async function noPageOverflow(page) { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'page must not overflow horizontally'); }

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const dictionaries = {};
  for (const file of ['shell', 'programme', 'operations']) Object.assign(dictionaries, (await import(pathToFileURL(path.join(ROOT, 'web-admin/src/locales/' + file + '.js')).href)).default);
  const states = (await import(pathToFileURL(path.join(ROOT, 'web-admin/src/locales/states.js')).href)).states;
  const en = (key, params = {}) => dictionaries[key][0].replace(/\{(\w+)\}/g, (text, key) => params[key] ?? text);
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await context.tracing.start({ screenshots: true, snapshots: true });
  await context.addInitScript(() => {
    window.__cameraCalls = 0;
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => {
      window.__cameraCalls++;
      throw new DOMException('No camera in text-code acceptance', 'NotAllowedError');
    };
  });
  context.on('page', page => {
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
  });
  user = await context.newPage();
  const username = 'web' + Date.now().toString(36);
  await user.goto(USER + '/login');
  await user.getByRole('button', { name: 'Create an account', exact: true }).click();
  await user.getByLabel('Account', { exact: true }).fill(username);
  await user.getByLabel('Password', { exact: true }).fill('Demo@1234');
  await user.getByRole('button', { name: 'Create account', exact: true }).click();
  await user.waitForURL('**/events');
  buyerToken = await loginApi(username);
  checks.push('registration and automatic sign-in through the visitor form');

  async function chooseEvent(name, mobile = false, loseResponse = false) {
    await user.goto(USER + '/events');
    if (mobile) await user.setViewportSize({ width: 390, height: 844 });
    await user.getByRole('searchbox', { name: 'Search productions' }).fill(name);
    const heading = user.getByRole('heading', { name, exact: true });
    await visible(heading);
    await heading.click();
    await user.getByRole('link', { name: 'Select seats', exact: true }).first().click();
    await visible(user.getByRole('heading', { name: 'Auditorium plan' }));
    await noPageOverflow(user);
    await user.getByRole('button', { name: /^A row .*available$/ }).first().click();
    const keys = []; let committedOrder;
    const routePattern = '**/api/orders';
    if (loseResponse) await user.route(routePattern, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      keys.push(route.request().headers()['idempotency-key']);
      const response = await route.fetch();
      if (keys.length === 1) { committedOrder = (await response.json()).data.order_id; await route.abort('failed'); }
      else await route.fulfill({ response });
    });
    await user.getByRole('button', { name: 'Reserve seats', exact: true }).click();
    if (loseResponse) {
      await visible(user.getByText('The reservation result is unknown. Retry to retrieve the original result; your request is saved in this tab.', {exact:true}));
      await user.reload();
      await user.getByRole('button', { name: 'Reserve seats', exact: true }).click();
      await eventually(async () => new URL(user.url()).pathname.startsWith('/orders/'), 'replayed reservation did not open');
      assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]);
      assert.equal(Number(new URL(user.url()).pathname.split('/').pop()), committedOrder);
      await user.unroute(routePattern);
      checks.push('lost reservation response survives reload and replays the same key and order');
    }
    await user.waitForURL(/\/orders\/\d+$/);
    return Number(new URL(user.url()).pathname.split('/').pop());
  }
  const freeOrderId = await chooseEvent(fixtures.freeEventName, true, true);
  await visible(user.getByRole('heading', { name: 'Free booking', exact: true }));
  assert.equal(await user.getByRole('button', { name: 'Continue to payment', exact: true }).count(), 0);
  await user.getByRole('button', { name: 'Confirm free booking', exact: true }).click();
  await visible(user.getByRole('heading', { name: 'Booking confirmed', exact: true }));
  await shot(user, '01-free-booking-mobile');
  await user.getByRole('link', { name: 'View my tickets', exact: true }).click();
  await user.getByRole('link').filter({ has: user.getByRole('heading', { name: fixtures.freeEventName, exact: true }) }).click();
  const qr = user.getByRole('img', { name: 'Ticket QR code', exact: true });
  await visible(qr);
  await eventually(() => qr.evaluate(image => image.complete && image.naturalWidth > 0), 'ticket QR image did not load');
  await user.getByRole('link', { name: 'View order', exact: true }).click();
  await user.getByRole('button', { name: 'Cancel free booking', exact: true }).click();
  await visible(user.getByText('This order was cancelled.', { exact: true }));
  assert.equal((await api('GET', '/orders/' + freeOrderId, buyerToken)).tickets[0].status, 'VOID');
  checks.push('mobile browsing, zero-price seat reservation, free confirmation, QR display and cancellation');

  await user.setViewportSize({ width: 1280, height: 900 });
  const paidOrderId = await chooseEvent(fixtures.paidEventName);
  await user.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await user.getByRole('button', { name: 'Simulate timeout', exact: true }).click();
  await visible(user.getByText('The gateway timed out. Your order is still pending; try again before the timer runs out.', { exact: true }));
  await user.getByRole('button', { name: 'Simulate decline', exact: true }).click();
  await user.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await user.getByRole('button', { name: 'Simulate successful payment', exact: true }).click();
  await user.waitForURL('**/tickets?paid=*');
  await user.getByRole('link').filter({ has: user.getByRole('heading', { name: fixtures.paidEventName, exact: true }) }).click();
  await visible(user.getByRole('img', { name: 'Ticket QR code', exact: true }));
  await user.getByRole('button', { name: 'Refresh QR', exact: true }).click();
  await visible(user.getByRole('button', { name: 'Refresh QR', exact: true }));
  await user.getByRole('button', { name: 'Copy gate code (demo)', exact: true }).click();
  await visible(user.getByRole('button', { name: 'Code copied', exact: true }));
  const copiedCode = await user.evaluate(() => navigator.clipboard.readText());
  assert.match(copiedCode, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const paidTicketId = Number(new URL(user.url()).pathname.split('/').pop());
  await shot(user, '02-paid-ticket');
  assert.equal((await api('GET', '/orders/' + paidOrderId, buyerToken)).status, 'PAID');
  checks.push('paid checkout including timeout, decline, retry, success, QR refresh and Copy gate code');

  admin = await context.newPage();
  await admin.goto(ADMIN + '/login?lang=en');
  await admin.getByLabel(en('shell.username'), { exact: true }).fill('admin');
  await admin.getByLabel(en('shell.password'), { exact: true }).fill('Demo@1234');
  await admin.getByRole('button', { name: en('shell.enterConsole'), exact: true }).click();
  await admin.waitForURL(ADMIN + '/');
  async function navigate(key) {
    await visible(admin.locator('.admin-header'));
    const link = admin.getByRole('link', { name: en(key), exact: true });
    if (!await link.isVisible()) await admin.getByRole('button', { name: en('shell.menu'), exact: true }).click();
    await link.click();
  }
  adminToken = await loginApi('admin');
  await navigate('shell.events');
  await admin.getByRole('button', { name: en('programme.newEvent'), exact: true }).click();
  const eventDialog = admin.getByRole('dialog');
  const eventName = 'Created in browser ' + Date.now().toString(36);
  await eventDialog.getByLabel(en('programme.title'), { exact: true }).fill(eventName);
  await eventDialog.getByLabel(en('programme.organizer'), { exact: true }).fill('Browser acceptance');
  await eventDialog.getByRole('button', { name: en('programme.saveEvent'), exact: true }).click();
  let eventRow = admin.getByRole('row').filter({ hasText: eventName });
  await visible(eventRow);
  await eventRow.getByRole('button', { name: en('programme.edit'), exact: true }).click();
  await admin.getByRole('dialog').getByLabel(en('programme.title'), { exact: true }).fill(eventName + ' revised');
  await admin.getByRole('dialog').getByRole('button', { name: en('programme.saveEvent'), exact: true }).click();
  await visible(admin.getByRole('row').filter({ hasText: eventName + ' revised' }));
  checks.push('administrator signs in and creates/edits an event through the actual forms');

  await navigate('shell.performances');
  await admin.getByLabel(en('programme.event'), { exact: true }).selectOption(String(fixtures.freeEventId));
  await admin.getByLabel(en('programme.status'), { exact: true }).selectOption('DRAFT');
  const draftRow = admin.getByRole('row').filter({ hasText: '#' + fixtures.draftPerformance });
  await draftRow.getByRole('button', { name: en('programme.seats'), exact: true }).click();
  const map = await api('GET', '/admin/performances/' + fixtures.draftPerformance + '/seats', adminToken);
  const seat = map.seats.find(seat => seat.status === 'AVAILABLE');
  const seatLabel = status => en('programme.seatLabel', { region: seat.region, row: seat.row_no, seat: seat.seat_no, status: states[status][0] });
  await admin.getByRole('dialog').getByRole('button', { name: seatLabel('AVAILABLE'), exact: true }).click();
  await visible(admin.getByRole('dialog').getByRole('button', { name: seatLabel('BLOCKED'), exact: true }));
  await admin.getByRole('dialog').getByRole('button', { name: seatLabel('BLOCKED'), exact: true }).click();
  await visible(admin.getByRole('dialog').getByRole('button', { name: seatLabel('AVAILABLE'), exact: true }));
  await shot(admin, '03-admin-draft-seats');
  await admin.getByRole('dialog').getByRole('button', { name: en('programme.close'), exact: true }).click();
  await draftRow.getByRole('button', { name: en('programme.publish'), exact: true }).click();
  await eventually(async () => (await api('GET', '/admin/performances/' + fixtures.draftPerformance, adminToken)).status === 'PUBLISHED', 'draft did not publish');
  checks.push('draft inventory opens privately; staff block/restore a seat and publish the performance');

  await navigate('shell.finance');
  await admin.getByRole('button', { name: new RegExp('^' + en('ops.refunds')) }).click();
  const failedRow = admin.locator('li').filter({ hasText: fixtures.retryOrderNo }).filter({ has: admin.getByRole('button', { name: en('ops.retryRefund'), exact: true }) });
  await failedRow.getByRole('button', { name: en('ops.retryRefund'), exact: true }).click();
  const pendingRow = admin.locator('li').filter({ hasText: fixtures.retryOrderNo }).filter({ has: admin.getByRole('button', { name: en('ops.markSucceeded'), exact: true }) });
  await pendingRow.getByRole('button', { name: en('ops.markSucceeded'), exact: true }).click();
  await eventually(async () => {
    const refunds = await api('GET', '/admin/refunds?order_id=' + fixtures.retryOrderId, adminToken);
    return refunds.items.some(row => row.status === 'SUCCEEDED') && refunds.items.some(row => row.refund_id === fixtures.retryRefundId && row.status === 'FAILED');
  }, 'refund retry did not settle or failed history changed');
  await admin.getByRole('button', { name: en('ops.ledger'), exact: true }).click();
  for (const label of ['ops.refunded','ops.excessRefunded','ops.totalRefunded']) {
    await visible(admin.getByRole('columnheader', { name: en(label), exact: true }));
  }
  await visible(admin.getByText(en('ops.netFormula'), {exact:true}));
  await admin.getByRole('button', { name: en('ops.runNow'), exact:true }).click();
  await eventually(async () => (await api('GET','/admin/reconciliation/status',adminToken)).last_summary != null, 'reconciliation summary missing');
  await shot(admin, '04-finance-refund-retry');
  checks.push('finance UI creates a retry, confirms success and preserves the failed refund history');

  // This follows requirements v1.2: paste the copied text, with camera access unavailable.
  await navigate('shell.checkin');
  await admin.locator('.gate-card').filter({ hasText: fixtures.paidEventName }).click();
  const input = admin.getByLabel(en('ops.ticketCode'), { exact: true });
  await input.click();
  await input.press('Control+V');
  assert.equal(await input.inputValue(), copiedCode);
  await admin.getByRole('button', { name: en('ops.validate'), exact: true }).click();
  await visible(admin.locator('.checkin-result.ok'));
  await input.fill(copiedCode);
  await admin.getByRole('button', { name: en('ops.validate'), exact: true }).click();
  await visible(admin.locator('.checkin-result.bad'));
  await visible(admin.getByText(en('ops.TICKET_ALREADY_USED'), { exact: true }));
  assert.equal((await api('GET', '/tickets/' + paidTicketId, buyerToken)).status, 'USED');
  assert.equal(await admin.evaluate(() => window.__cameraCalls), 0);
  assert.equal(await admin.getByRole('button', { name: /camera|摄像|攝影/i }).count(), 0);
  await shot(admin, '05-text-code-checkin-duplicate');
  checks.push('Copy gate code -> clipboard paste -> successful check-in -> duplicate rejection, without camera calls');

  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.getByRole('button', { name: en('shell.menu'), exact: true }).click();
  await admin.getByRole('link', { name: en('shell.orders'), exact: true }).click();
  await noPageOverflow(admin);
  await admin.getByRole('combobox', { name: en('shell.language'), exact: true }).selectOption('zh-cn');
  await eventually(async () => (await admin.evaluate(() => document.documentElement.lang)) === 'zh-Hans-CN', 'language did not switch');
  await admin.getByRole('combobox', { name: dictionaries['shell.language'][1], exact: true }).selectOption('en');
  await eventually(async () => (await admin.evaluate(() => document.documentElement.lang)) === 'en', 'language did not switch back');
  await shot(admin, '06-admin-mobile');
  checks.push('mobile admin navigation and language switching');

  const checkerContext = await browser.newContext();
  try {
    const checker = await checkerContext.newPage();
    await checker.goto(ADMIN + '/login?lang=en');
    await checker.getByLabel(en('shell.username'), { exact: true }).fill('checker01');
    await checker.getByLabel(en('shell.password'), { exact: true }).fill('Demo@1234');
    await checker.getByRole('button', { name: en('shell.enterConsole'), exact: true }).click();
    await checker.waitForURL('**/checkin*');
    assert.equal(await checker.locator('.admin-nav a').count(), 1);
    await checker.goto(ADMIN + '/finance');
    await checker.waitForURL('**/checkin*');
    checks.push('checker sees only check-in navigation and cannot open the finance page');
  } finally { await checkerContext.close(); }
  assert.deepEqual(pageErrors, [], 'browser runtime errors');
}
main().catch(async error => {
  console.error(error); process.exitCode = 1;
  console.error('Page errors:', pageErrors);
  for (const [page, name] of [[user, 'user'], [admin, 'admin']]) if (page && !page.isClosed()) console.error('Failure view ' + name + ': ' + page.url() + '\\n' + (await page.locator('body').innerText()).slice(0, 10000));
  for (const [page, name] of [[user, 'failure-user'], [admin, 'failure-admin']]) if (page && !page.isClosed()) await shot(page, name).catch(() => {});
}).finally(async () => {
  if (context) await context.tracing.stop({ path: path.join(OUT, 'trace.zip') }).catch(() => {});
  await browser?.close();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ checks, passed: checks.length, errors: pageErrors, cameraRequired: false }, null, 2));
  for (const check of checks) console.log('PASS UI ' + check);
});
