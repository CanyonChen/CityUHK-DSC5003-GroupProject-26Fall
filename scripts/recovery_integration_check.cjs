'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { createRequire } = require('node:module');
const serverRequire = createRequire(path.resolve(__dirname, '../server/package.json'));
const mysql = serverRequire('mysql2/promise');
const jwt = serverRequire('jsonwebtoken');
const { inspect } = require('./inventory_consistency_check.cjs');
const BASE = process.env.BASE || 'http://127.0.0.1:3300', key = () => crypto.randomUUID();
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname,'../.cache/checks/browser-fixtures.json'),'utf8'));
const checks = [];
let conn;
const q = async (sql, p=[]) => (await conn.query(sql,p))[0];
async function api(method, route, token, body, expected=200, requestKey) {
  const response = await fetch(BASE+route, { method, signal: AbortSignal.timeout(20000), headers: {
    ...(token?{Authorization:'Bearer '+token}:{}), ...(body===undefined?{}:{'Content-Type':'application/json'}),
    ...(requestKey?{'Idempotency-Key':requestKey}:{}) }, body:body===undefined?undefined:JSON.stringify(body) });
  const result=await response.json();
  assert.equal(response.status,expected,method+' '+route+' '+JSON.stringify(result)); return result;
}
async function login(name) { return (await api('POST','/auth/login',null,{user_name:name,password:'Demo@1234'})).data.token; }
async function reserve(token) {
  const map=(await api('GET','/performances/'+fixtures.paidPerformance+'/seats',token)).data;
  const seat=map.seats.find(s=>s.status==='AVAILABLE'); assert.ok(seat);
  return (await api('POST','/orders',token,{performance_id:fixtures.paidPerformance,session_seat_ids:[seat.session_seat_id]},201,key())).data;
}
const payment=async(token,order)=>(await api('POST','/payments',token,{order_id:order.order_id},201)).data;
async function main() {
  assert.match(process.env.DB_NAME||'',/^ticketing_(ac|ci)$/,'only disposable CI databases');
  conn=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),
    user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME,timezone:'Z'});
  const stamp=Date.now().toString(36), username='recovery'+stamp;
  await api('POST','/auth/register',null,{user_name:username,password:'Demo@1234'},201);
  const buyer=await login(username), admin=await login('admin');
  const held=await reserve(buyer), pay=await payment(buyer,held), seatId=held.items[0].session_seat_id;
  // Force an inventory discrepancy after a hold, then let a verified provider success arrive.
  await q("UPDATE session_seats SET session_seat_status='BLOCKED',holder_order_id=NULL,hold_expires_at=NULL WHERE session_seat_id=?",[seatId]);
  const refused=await api('POST','/payments/'+pay.payment_id+'/simulate',buyer,{result:'SUCCESS'},409);
  assert.equal(refused.code,'INVENTORY_INCONSISTENT');
  assert.equal((await q('SELECT status FROM orders WHERE order_id=?',[held.order_id]))[0].status,'PENDING_PAYMENT');
  assert.equal((await q('SELECT result FROM payment_attempts WHERE attempt_id=?',[pay.payment_id]))[0].result,'PENDING');
  assert.equal((await q('SELECT COUNT(*) n FROM tickets t JOIN order_items oi ON oi.order_item_id=t.order_item_id WHERE oi.order_id=?',[held.order_id]))[0].n,0);
  const notices=await q('SELECT notice_id,processed_result FROM payment_notifications WHERE payment_attempt_id=?',[pay.payment_id]);
  assert.equal(notices.length,1); assert.equal(notices[0].processed_result,'PENDING');
  const broken=await inspect(conn); assert.equal(broken.ok,false);
  await q("UPDATE session_seats SET session_seat_status='HELD',holder_order_id=?,hold_expires_at=? WHERE session_seat_id=?",[held.order_id,new Date(held.expires_at),seatId]);
  const recovered=(await api('POST','/admin/payments/'+pay.payment_id+'/reconcile',admin,{})).data;
  assert.equal(recovered.result,'APPLIED');
  const fulfilled=(await api('GET','/orders/'+held.order_id,buyer)).data;
  assert.equal(fulfilled.status,'PAID'); assert.equal(fulfilled.tickets.length,1);
  await api('POST','/admin/payments/'+pay.payment_id+'/reconcile',admin,{});
  assert.equal((await api('GET','/orders/'+held.order_id,buyer)).data.tickets.length,1);
  checks.push('inconsistent paid inventory rolls back fulfilment, retains durable success evidence and recovers once');

  // A formerly interrupted implementation may have committed a success but not the fulfilment.
  const interrupted=await reserve(buyer), p2=await payment(buyer,interrupted), seat2=interrupted.items[0].session_seat_id;
  const body=JSON.stringify({payment_id:p2.payment_id,provider_txn_id:'RECOVERY-'+stamp,result:'SUCCESS',
    amount_cents:interrupted.total_amount_cents,currency:interrupted.currency,order_no:interrupted.order_no});
  await q(`INSERT INTO payment_notifications(source,notification_id,payment_attempt_id,received_at,processed_at,processed_result,payload_digest,payload_json)
    VALUES('mockpay',?,?,UTC_TIMESTAMP(3)-INTERVAL 300 SECOND,UTC_TIMESTAMP(3)-INTERVAL 300 SECOND,'APPLIED',?,?)`,
    ['RECOVERY-'+stamp,p2.payment_id,crypto.createHash('sha256').update(body).digest('hex'),body]);
  await q("UPDATE payment_attempts SET result='SUCCEEDED',handling_category='NORMAL',updated_at=UTC_TIMESTAMP(3)-INTERVAL 300 SECOND WHERE attempt_id=?",[p2.payment_id]);
  await api('POST','/admin/reconciliation/run',admin,{});
  const repaired=(await api('GET','/orders/'+interrupted.order_id,buyer)).data;
  assert.equal(repaired.status,'PAID'); assert.equal(repaired.tickets.length,1);
  assert.equal((await q('SELECT session_seat_status FROM session_seats WHERE session_seat_id=?',[seat2]))[0].session_seat_status,'SOLD');
  checks.push('worker repairs a recorded provider success missing local fulfilment without reissuing on replay');

  const unknown=await reserve(buyer), p3=await payment(buyer,unknown);
  await q('UPDATE payment_attempts SET updated_at=UTC_TIMESTAMP(3)-INTERVAL 300 SECOND WHERE attempt_id=?',[p3.payment_id]);
  const refund=(await api('POST','/orders/'+held.order_id+'/refund',buyer,{reason:'Recovery checks'},201,key())).data;
  await q('UPDATE refunds SET updated_at=UTC_TIMESTAMP(3)-INTERVAL 300 SECOND WHERE refund_id=?',[refund.refund_id]);
  const run=(await api('POST','/admin/reconciliation/run',admin,{})).data;
  assert.ok(run.unknown>=1); assert.ok(run.refunds_checked>=1); assert.ok(run.manual_refunds>=1);
  assert.equal((await q('SELECT result FROM payment_attempts WHERE attempt_id=?',[p3.payment_id]))[0].result,'PENDING');
  assert.equal((await q('SELECT status FROM refunds WHERE refund_id=?',[refund.refund_id]))[0].status,'PENDING');
  const rec=(await api('GET','/admin/reconciliation/status',admin)).data;
  assert.ok(rec.last_run_at); assert.ok(rec.last_summary); assert.equal(rec.interval_seconds,60);
  checks.push('unknown payments remain pending; pending refunds are checked and audited for administrator confirmation');

  // Mimic a stale old order pointing at a seat now represented by a different valid ticket.
  const oldTicket=fulfilled.tickets[0].ticket_id, newItem=(await q('SELECT order_item_id FROM order_items WHERE order_id=?',[interrupted.order_id]))[0].order_item_id;
  const fake=await q('INSERT INTO order_items(order_id,session_seat_id,price_snapshot) VALUES(?,?,0)',[interrupted.order_id,seatId]);
  const fakeTicket=await q("INSERT INTO tickets(order_item_id,ticket_code_hash,status) VALUES(?,?,'VALID')",[fake.insertId,crypto.randomBytes(32).toString('hex')]);
  await q("UPDATE tickets SET status='VOID' WHERE ticket_id=?",[oldTicket]);
  try {
    const rejected=await api('POST','/admin/refunds/'+refund.refund_id+'/resolve',admin,{result:'SUCCEEDED'},409);
    assert.equal(rejected.code,'INVENTORY_INCONSISTENT');
    assert.equal((await q('SELECT status FROM tickets WHERE ticket_id=?',[fakeTicket.insertId]))[0].status,'VALID');
    assert.equal((await q('SELECT session_seat_status FROM session_seats WHERE session_seat_id=?',[seatId]))[0].session_seat_status,'SOLD');
    assert.equal((await q('SELECT status FROM refunds WHERE refund_id=?',[refund.refund_id]))[0].status,'PENDING');
  } finally {
    await q('DELETE FROM tickets WHERE ticket_id=?',[fakeTicket.insertId]);
    await q('DELETE FROM order_items WHERE order_item_id=?',[fake.insertId]);
    await q("UPDATE tickets SET status='REFUND_PENDING' WHERE ticket_id=?",[oldTicket]);
  }
  await api('POST','/admin/refunds/'+refund.refund_id+'/resolve',admin,{result:'SUCCEEDED'});
  assert.equal((await q('SELECT session_seat_status FROM session_seats WHERE session_seat_id=?',[seatId]))[0].session_seat_status,'AVAILABLE');
  checks.push('stale normal refunds cannot release another active sale; ordinary refund release still succeeds');

  const validCode=(await api('GET','/tickets/'+repaired.tickets[0].ticket_id,buyer)).data.qr_token;
  const expired=jwt.sign({typ:'TICKET_QR',tid:repaired.tickets[0].ticket_id,exp:Math.floor(Date.now()/1000)-1},process.env.JWT_SECRET);
  const expiredReply=await api('POST','/admin/checkins',admin,{performance_id:fixtures.paidPerformance,ticket_code:expired},409,key());
  assert.equal(expiredReply.code,'TICKET_QR_EXPIRED');
  await api('POST','/admin/checkins',admin,{performance_id:fixtures.paidPerformance,ticket_code:validCode},200,key());
  const duplicate=await api('POST','/admin/checkins',admin,{performance_id:fixtures.paidPerformance,ticket_code:validCode},409,key());
  assert.equal(duplicate.code,'TICKET_ALREADY_USED');
  await api('POST','/orders/'+unknown.order_id+'/cancel',buyer,{});
  // A PAID order with a VOID ticket and an AVAILABLE seat is inconsistent even if
  // neither side has a duplicate owner. The read-only report must catch the order/ticket mismatch.
  const candidate=(await q(`SELECT t.ticket_id,oi.session_seat_id FROM tickets t
    JOIN order_items oi ON oi.order_item_id=t.order_item_id JOIN orders o ON o.order_id=oi.order_id
    JOIN session_seats ss ON ss.session_seat_id=oi.session_seat_id
    WHERE o.status='PAID' AND t.status='VALID' AND ss.session_seat_status='SOLD'
      AND NOT EXISTS (SELECT 1 FROM checkins c WHERE c.ticket_id=t.ticket_id) LIMIT 1`))[0];
  assert.ok(candidate);
  await q("UPDATE tickets SET status='VOID' WHERE ticket_id=?",[candidate.ticket_id]);
  await q("UPDATE session_seats SET session_seat_status='AVAILABLE' WHERE session_seat_id=?",[candidate.session_seat_id]);
  try {
    const mismatch=await inspect(conn);
    assert.ok(mismatch.checks.ticket_order.count>0);
  } finally {
    await q("UPDATE tickets SET status='VALID' WHERE ticket_id=?",[candidate.ticket_id]);
    await q("UPDATE session_seats SET session_seat_status='SOLD' WHERE session_seat_id=?",[candidate.session_seat_id]);
  }
  checks.push('read-only inspection detects a paid order with a void ticket even when its seat is available');
  const report=await inspect(conn);
  fs.writeFileSync(path.join(__dirname,'../.cache/checks/inventory-consistency.json'),JSON.stringify(report,null,2));
  assert.equal(report.ok,true,JSON.stringify(report));
  checks.push('expired QR is distinct, conditional check-in rejects reuse, and read-only historical inventory checks pass');
  fs.writeFileSync(path.join(__dirname,'../.cache/checks/recovery-integration.json'),JSON.stringify({checks,passed:checks.length},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await conn?.end();for(const x of checks)console.log('PASS RECOVERY '+x);});
