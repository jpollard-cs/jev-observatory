# Independently verifying hosted evidence

New hosted runs receive Ed25519 receipts at preparation, response recording, and completion. A downloaded version-3 evidence bundle carries those receipts plus a signature covering its entire contents. This is a statement by the Observatory runner, not by TypeSafe, and not a security or no-regression certification. Older runs remain explicitly unsigned; they are never retroactively promoted to signed execution.

## Verify without trusting an upload

Use Node 24+ and a **trusted checkout of this repository**. Do not run a contributor's verifier or accept a public key included with their report. Verification is offline, makes no provider calls, and uses the checked-in public-key registry and required core definition.

```sh
node community-site/scripts/verify-receipt.mjs downloaded-evidence.json
node community-site/scripts/verify-receipt.mjs downloaded-evidence.json \
  --require-core \
  --policy-hash EXPECTED_CANONICAL_POLICY_SHA256 \
  --evaluator-revision EXPECTED_HOSTED_SOURCE_COMMIT \
  --max-age-hours 168
```

The second command is intentionally stricter. Obtain expected identities from the policy/release you are reviewing, not from the submitted bundle. `--run-id UUID` additionally binds verification to a specific run. The policy hash is SHA-256 of the full resolved policy serialized with the repository's canonical JSON routine. The evaluator revision identifies the hosted source repository commit; when requested, it must match every receipt stage. Without that constraint, cross-deployment runs expose all participating revisions; the manifest also retains the compiler's source-file fingerprint. Neither is a claim that a GitHub PR was automatically reviewed. A changed policy must be run again.

Exit status 0 means the requested signature and identity/coverage checks passed. Exit status 1 rejects unknown/revoked keys, corrupted data, missing signatures, unsupported core definitions, unexpected identities, and any requested freshness/coverage constraint. Freshness uses the sealed **completion time**, so downloading an old run again does not refresh its age.

## What the receipt binds

- The runner issuer, signing-key ID, hosted source revision and signing time.
- Unique run ID, full policy, frozen manifest, selected case IDs, authored expectations, exact wire request hashes, model selection and run settings.
- Every provider observation, including invalid responses, with its run, request and position. No contributor-supplied replacement answers are accepted.
- A sealed terminal record containing completion status, accounting and the complete ordered observation hashes.
- Every planned request, including cases not run, the native/derived report, and core-coverage accounting.

The service checks each signature before assembling new evidence and verifies the bundle again before accepting, publicly sharing or downloading it. A later storage edit cannot be blessed merely by recomputing a database digest. No generic signing endpoint accepts user content. A public readiness endpoint signs only a fixed service-status object in a separate signature domain.

## Core coverage is separate from correctness

`admission-core/3` pins the existing 60 minimum cases and their content hashes against the expanded 196-case catalog, both `question` and `criteria` layouts, and at least one repetition: 120 required observations. Optional attack packs are outside this minimum. Versions 1 and 2 remain unchanged for historical inspection; their receipts do not satisfy the current required-core identity. CI fails if the catalog silently changes. A new catalog needs an explicit new core version and review. See [attack-pack scope and provenance](promptfoo-adaptations.md).

Smaller, stopped, invalid or mismatched-catalog runs can preserve authentic signed evidence but do not satisfy `--require-core`. A core-complete run means these observations are present and structurally valid; it does **not** mean the model answered correctly. The receipt always reports `regressionVerdict: not_evaluated`. Paired baseline/candidate regression criteria, PR head/base binding and reviewed per-profile margins remain a separate step. These authored development cases are neither independent adjudication nor a hidden challenge set.

## Keys, rotation and trust

Public keys live in `community-site/trust/receipt-keys.json` and are served at `/.well-known/observatory-receipt-keys.json`. The active public site has its own key. The unused key reserved for the retired host is marked retired and was removed from that host’s runtime configuration. Private signing material is a Sites runtime **secret**, `OBSERVATORY_RECEIPT_SIGNING_KEY`; it is absent from source, build output, exported evidence, browser storage and database blobs. The secret is JSON containing `keyId` and an Ed25519 private `jwk`, whose public `x` must match the pinned registry. Keys are imported as non-extractable Web Crypto keys. This is software isolation, not an HSM or independent signing service.

For planned rotation, generate a new Ed25519 key in a secure operator environment, add its public key and validity interval to the registry, deploy it, then switch the runtime secret and redeploy. Mark the previous key `retired` to permit verification of historical receipts while prohibiting new signatures with it. For suspected compromise, mark it `revoked` and deploy/publish the updated registry; verifiers must refresh their trusted checkout. Revocation rejects all signatures from that key, including old ones. Do not rewrite old receipts or reuse key IDs. Lost private keys need replacement, not recovery from source control.

`/.well-known/observatory-receipt-status.json` demonstrates that the deployed key can sign a fixed status message. It contains no model evidence, costs no Jev credits, and cannot certify a run. Production preparation fails before a provider request if signing is unavailable. Failures after provider dispatch retain spending holds rather than silently retrying or inventing a signed result. An absent completion seal prevents attested export; this requires operator investigation, not client reconstruction.

## Remaining assumptions

A compromised runner or signing secret can produce false attestations. Public-key verification protects against subsequent alteration and untrusted contributors; it cannot prove an uncompromised host or honest provider. The host currently transiently handles Jev API keys. Operators must control deployment access, dependency changes, key custody and incident response.

Users can choose which private runs to share. Completion receipts prevent editing a shared run's contents, but there is no append-only public log of every private attempt. Replays of the *same* authentic run remain authentic: consumers must use the expected run/policy identity and freshness constraint for their application. Preventing selective reporting across runs requires a consented campaign registry or independently maintained transparency log. Public data is still rendered as inert text with authorization, CSP and resource limits; a model's policy judgment is never the website's security boundary.

Implementation uses standard [Web Crypto Ed25519](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/), also available in [Node's Web Crypto API](https://nodejs.org/api/webcrypto.html). Signatures establish provenance rather than safety, as described in [GitHub's attestation guidance](https://docs.github.com/en/actions/concepts/security/artifact-attestations).
