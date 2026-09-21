// D1 statements are single-statement atomic transitions. No in-memory locks.
import { MAX_PARALLEL } from './limits.mjs';
export function executionRepository(db) {
  const first = (sql, ...v) =>
    db
      .prepare(sql)
      .bind(...v)
      .first();
  const change = async (sql, ...v) =>
    (
      await db
        .prepare(sql)
        .bind(...v)
        .run()
    ).meta.changes > 0;
  return {
    account: (owner) =>
      first(
        `SELECT a.*, COALESCE(SUM(r.known_nano),0) AS known_nano, COALESCE(SUM(r.held_nano),0) AS held_nano FROM execution_accounts a LEFT JOIN execution_runs r ON r.owner=a.owner WHERE a.owner=? GROUP BY a.owner`,
        owner,
      ),
    initialize: (owner, maximum, prior, now) =>
      change(
        'INSERT OR IGNORE INTO execution_accounts(owner,maximum_nano,prior_nano,created_at) VALUES(?,?,?,?)',
        owner,
        maximum,
        prior,
        now,
      ),
    list: async (owner) =>
      (
        await db
          .prepare('SELECT * FROM execution_runs WHERE owner=? ORDER BY created_at DESC LIMIT 100')
          .bind(owner)
          .all()
      ).results,
    get: (id, owner) => first('SELECT * FROM execution_runs WHERE id=? AND owner=?', id, owner),
    pending: (owner, key) =>
      first(
        `SELECT * FROM execution_runs WHERE owner=? AND preparation_key=? AND status IN ('ready','running') LIMIT 1`,
        owner,
        key,
      ),
    blocker: (owner, excludeId = '') =>
      first(
        `SELECT * FROM execution_runs WHERE owner=? AND id<>? AND status='running' ORDER BY created_at LIMIT 1`,
        owner,
        excludeId,
      ),
    // Limit retained manifests before storage growth. Creation itself never authorizes dispatch.
    create: (r) =>
      change(
        `INSERT INTO execution_runs(id,owner,plan_hash,status,object_key,prepared_hash,requests,reserve_nano,created_at,updated_at,preparation_key) SELECT ?,?,?,'ready',?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM execution_runs WHERE owner=?)<100 AND NOT EXISTS(SELECT 1 FROM execution_runs WHERE owner=? AND preparation_key=? AND status IN ('ready','running'))`,
        r.id,
        r.owner,
        r.planHash,
        r.objectKey,
        r.preparedHash,
        r.requests,
        r.reserveNano,
        r.now,
        r.now,
        r.preparationKey ?? null,
        r.owner,
        r.owner,
        r.preparationKey ?? null,
      ),
    // Stopped holds consume budget, but are not active execution locks. Capture
    // the actual retained reservations in the same transaction as the new one.
    start: (id, owner, now) =>
      change(
        `UPDATE execution_runs SET status='running', held_nano=reserve_nano, updated_at=?, retained_holds_json=(SELECT json_group_array(json_object('id',r.id,'heldNano',r.held_nano,'updatedAt',r.updated_at)) FROM execution_runs r WHERE r.owner=? AND r.status='stopped' AND r.held_nano>0) WHERE id=? AND owner=? AND status='ready' AND NOT EXISTS(SELECT 1 FROM execution_runs WHERE owner=? AND status='running') AND reserve_nano <= (SELECT maximum_nano-prior_nano FROM execution_accounts WHERE owner=?) - (SELECT COALESCE(SUM(known_nano+held_nano),0) FROM execution_runs WHERE owner=?)`,
        now,
        owner,
        id,
        owner,
        owner,
        owner,
        owner,
      ),
    claim: (id, owner, index, reserve, count, now) =>
      change(
        `UPDATE execution_runs SET inflight=?,inflight_count=?,inflight_reserve=?,updated_at=? WHERE id=? AND owner=? AND status='running' AND next_index=? AND inflight IS NULL AND ? BETWEEN 1 AND ? AND next_index+?<=requests`,
        index,
        count,
        reserve,
        now,
        id,
        owner,
        index,
        count,
        MAX_PARALLEL,
        count,
      ),
    settle: (id, owner, index, { cost, reserve, unknown, count, reason }, now) =>
      change(
        `UPDATE execution_runs SET known_nano=known_nano+?, held_nano=CASE WHEN ? IS NOT NULL OR status='stopped' THEN ? ELSE held_nano-?+? END, next_index=next_index+?, inflight=NULL,inflight_count=1,inflight_reserve=0, status=CASE WHEN ? IS NOT NULL OR status='stopped' THEN 'stopped' WHEN next_index+?=requests THEN 'complete' ELSE 'running' END, reason=COALESCE(reason,?),updated_at=? WHERE id=? AND owner=? AND inflight=? AND inflight_count=?`,
        cost,
        reason,
        unknown,
        reserve,
        unknown,
        count,
        reason,
        count,
        reason,
        now,
        id,
        owner,
        index,
        count,
      ),
    stop: (id, owner, now) =>
      change(
        `UPDATE execution_runs SET status='stopped',reason='operator_stop',held_nano=inflight_reserve,updated_at=? WHERE id=? AND owner=? AND status IN ('ready','running')`,
        now,
        id,
        owner,
      ),
    cancelRuns: async (owner, ids, now) =>
      (
        await db
          .prepare(
            `UPDATE execution_runs SET status='stopped',reason='operator_stop',held_nano=inflight_reserve,updated_at=? WHERE owner=? AND id IN (SELECT value FROM json_each(?)) AND status IN ('ready','running') RETURNING *`,
          )
          .bind(now, owner, JSON.stringify(ids))
          .all()
      ).results,
  };
}
