// A durable admission port for expensive new work. Ordinary reads, stopping a
// run, and completing an already-authorized run do not consume these limits.
export function writeLimits(db, { now = () => Date.now() } = {}) {
  const claim = async (bucket, limit) => {
    const window = Math.floor(now() / 60000);
    return Boolean(
      await db
        .prepare(
          `INSERT INTO write_limits(bucket,window,hits) VALUES(?,?,1)
       ON CONFLICT(bucket) DO UPDATE SET window=excluded.window,
         hits=CASE WHEN write_limits.window=excluded.window THEN write_limits.hits+1 ELSE 1 END
       WHERE write_limits.window!=excluded.window OR write_limits.hits<?
       RETURNING hits`,
        )
        .bind(bucket, window, limit)
        .first(),
    );
  };
  return async (operation, owner) => {
    if (!owner || !['prepare', 'upload', 'share', 'account'].includes(operation)) return false;
    // Stable keys bound growth to authenticated accounts, not arbitrary URLs/time windows.
    if (!(await claim(operation + ':owner:' + owner, operation === 'prepare' ? 10 : 20)))
      return false;
    return claim(operation + ':global', operation === 'prepare' ? 60 : 120);
  };
}
