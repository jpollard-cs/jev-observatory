const columns =
  'id,owner,evidence_kind AS evidenceKind,source_run_id AS sourceRunId,author,policy_name AS policyName,policy_hash AS policyHash,title,model,suite_hash AS suiteHash,bundle_hash AS bundleHash,source_revision AS sourceRevision,object_key AS objectKey,bytes,total,completed,incomplete,exact_matches AS exactMatches,visibility,created_at AS createdAt';
export function repository(db) {
  return {
    list: async (owner, offset = 0) =>
      (
        await db
          .prepare(
            `SELECT ${columns} FROM community_results WHERE ${owner ? 'owner=?' : "visibility='public' AND evidence_kind IN ('hosted-run','signed-run')"} ORDER BY created_at DESC,id LIMIT 51 OFFSET ?`,
          )
          .bind(...(owner ? [owner, offset] : [offset]))
          .all()
      ).results,
    get: (id) => db.prepare(`SELECT ${columns} FROM community_results WHERE id=?`).bind(id).first(),
    // Quota and insert share a statement: concurrent requests cannot overshoot the limit.
    insert: async (r) => {
      const result = await db
        .prepare(
          'INSERT INTO community_results(id,owner,evidence_kind,source_run_id,author,policy_name,policy_hash,title,model,suite_hash,bundle_hash,source_revision,object_key,bytes,total,completed,incomplete,exact_matches,visibility,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM community_results WHERE owner=?)<200 AND (SELECT COALESCE(SUM(bytes),0) FROM community_results WHERE owner=?)+?<=104857600',
        )
        .bind(
          r.id,
          r.owner,
          r.evidenceKind,
          r.sourceRunId,
          r.author,
          r.policyName,
          r.policyHash,
          r.title,
          r.model,
          r.suiteHash,
          r.bundleHash,
          r.sourceRevision,
          r.objectKey,
          r.bytes,
          r.total,
          r.completed,
          r.incomplete,
          r.exactMatches,
          r.visibility,
          r.createdAt,
          r.owner,
          r.owner,
          r.bytes,
        )
        .run();
      return result.meta.changes === 1;
    },
    visibility: (id, owner, visibility) =>
      db
        .prepare('UPDATE community_results SET visibility=? WHERE id=? AND owner=?')
        .bind(visibility, id, owner)
        .run(),
    remove: (id, owner) =>
      db.prepare('DELETE FROM community_results WHERE id=? AND owner=?').bind(id, owner).run(),
  };
}
