import { canonical, sha256, validateBundle, ok, error } from '../domain/contracts.mjs';
import { assertReceipt } from './crypto.mjs';
import { coreCoverage } from './core.mjs';

export async function verifySignedBundle(bundle, trust, requiredCore, constraints = {}) {
  try {
    const valid = await validateBundle(bundle);
    if (valid.tag === 'error') throw Error(valid.error.message);
    if (bundle.version !== 3) throw Error('This run predates signed evidence');
    const { attestation, ...content } = bundle;
    await assertReceipt(content, attestation, trust, 'bundle', constraints);
    const settings = bundle.provenance.settings,
      p = settings.prepared;
    const { attestation: planProof, ...prepared } = p;
    if (settings.runId !== planProof.runId) throw Error('Run identity mismatch');
    await assertReceipt({ runId: settings.runId, prepared }, planProof.receipt, trust, 'plan', {
      ...constraints,
      issuer: attestation.issuer,
    });
    if (
      canonical(settings.manifest) !== canonical(p.manifest) ||
      canonical(bundle.policy.document) !== canonical(p.manifest.policy) ||
      bundle.provenance.sourceStamp !== p.manifest.sourceStamp ||
      bundle.suite.definition.planHash !== p.manifest.planHash
    )
      throw Error('Policy, evaluator or plan mismatch');
    if (canonical(p.verificationCore) !== canonical(requiredCore))
      throw Error('Receipt uses a different required core suite');
    if (constraints.policyHash && constraints.policyHash !== bundle.policy.hash)
      throw Error('Unexpected policy hash');
    if (
      constraints.evaluatorRevision &&
      constraints.evaluatorRevision !== planProof.receipt.evaluatorRevision
    )
      throw Error('Unexpected evaluator revision');
    if (constraints.runId && constraints.runId !== settings.runId)
      throw Error('Unexpected run identity');
    const cases = bundle.suite.definition.cases,
      observations = settings.observations;
    const completion = settings.completion;
    await assertReceipt(completion.record, completion.receipt, trust, 'completion', {
      ...constraints,
      issuer: attestation.issuer,
    });
    const closed = completion.record;
    if (
      closed.runId !== settings.runId ||
      closed.planHash !== p.manifest.planHash ||
      closed.planned !== p.jobs.length ||
      closed.recorded !== observations.length ||
      !['complete', 'stopped'].includes(closed.status) ||
      closed.status !== settings.report.status ||
      closed.reason !== settings.report.stopReason ||
      closed.knownNano / 1e9 !== settings.report.budget.bundleKnownUsageUsd ||
      closed.heldNano / 1e9 !== settings.report.budget.bundleHeldUsd ||
      canonical(closed.observationHashes) !==
        canonical(await Promise.all(observations.map((o) => sha256(canonical(o)))))
    )
      throw Error('Run completion or accounting changed');
    if (
      constraints.maxAgeMs !== undefined &&
      Date.now() - Date.parse(completion.receipt.issuedAt) > constraints.maxAgeMs
    )
      throw Error('Run completion is too old for this verification');
    if (
      cases.length !== p.jobs.length ||
      observations.length > p.jobs.length ||
      new Set(p.jobs.map((j) => j.id)).size !== p.jobs.length
    )
      throw Error('Incomplete or duplicate planned requests');
    for (let i = 0; i < p.jobs.length; i++) {
      const job = p.jobs[i],
        c = cases[i],
        o = observations[i];
      if (
        c.id !== job.id ||
        c.requestHash !== job.requestHash ||
        (await sha256(c.requestBody)) !== job.requestHash ||
        canonical(c.expected) !== canonical(job.expected)
      )
        throw Error('Frozen request or expectation changed');
      if (o) {
        const { attestation: proof, ...observation } = o;
        await assertReceipt(
          { runId: settings.runId, planHash: p.manifest.planHash, index: i, observation },
          proof,
          trust,
          'observation',
          { ...constraints, issuer: attestation.issuer },
        );
        if (o.evidence.requestHash !== job.requestHash || o.evidence.jobId !== job.id)
          throw Error('Response bound to another request');
      }
    }
    const coverage = await coreCoverage(p, observations, requiredCore);
    if (canonical(coverage) !== canonical(bundle.verification.core))
      throw Error('Core coverage summary changed');
    if (constraints.requireCore && coverage.status !== 'complete')
      throw Error('Required core has missing or invalid results');
    return ok({
      signature: 'valid',
      issuer: attestation.issuer,
      keyId: attestation.keyId,
      runId: settings.runId,
      policyHash: bundle.policy.hash,
      evaluatorRevision: planProof.receipt.evaluatorRevision,
      evaluatorRevisions: [
        ...new Set(
          [
            planProof.receipt,
            ...observations.map((o) => o.attestation),
            completion.receipt,
            attestation,
          ].map((r) => r.evaluatorRevision),
        ),
      ],
      core: coverage,
      regressionVerdict: 'not_evaluated',
    });
  } catch (cause) {
    return error('invalid_receipt', cause.message);
  }
}
