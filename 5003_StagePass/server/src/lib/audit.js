'use strict';

/** Write an audit log; exec may be a pool or a transaction connection */
async function writeAudit(exec, { actorType, actorId = null, objectType, objectId = null, action, summary, requestId }) {
  const sql = `INSERT INTO audit_logs
       (actor_type, actor_id, object_type, object_id, action, state_summary, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`;
  const params = [actorType, actorId, objectType, objectId, action, String(summary).slice(0, 500), requestId || '-'];
  if (typeof exec === 'function') {
    await exec(sql, params);
    return;
  }
  await exec.query(sql, params);
}

module.exports = { writeAudit };
