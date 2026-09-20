# Community policies and contributor-funded verification

Status: 2026-09-20. GitHub remains the review authority. Public submissions must reference owned, saved hosted policy evaluations. The server constructs complete evidence; uploaded answers are not accepted. The host transiently handles a contributor's Jev key during explicitly authorized execution. Independent receipt signing and PR-bound core-suite regression verification remain proposed, not implemented guarantees.

## A library of policies

Use a versioned library of small components and named, compatible profiles, rather than one ever-growing universal prompt. The current workbench already separates language, representation, task relevance, authorized exceptions, uncertainty and source authority. The three existing profiles are strict admission, contextual admission and isolated inspection. Inspection is a separate operation; an “allow” for inspection does not authorize admission or execution.

GitHub is canonical for components, profiles, the compiler, test cases and review. The site displays those definitions and evidence; it does not create an alternative policy editing authority. Changes arrive through PRs. The current component catalog describes the existing workbench implementation; it is not yet a general plugin loader or arbitrary component compiler.

A future composable manifest should pin component IDs, versions and content hashes, declare dependencies and incompatible operations, and record the complete resolved policy and compiler version. Reject conflicting settings rather than relying on merge order. Host-owned source authority and uncertainty rules remain mandatory. A task-specific profile can add debugging, PII, tool authorization, content moderation or memory-integrity rules without claiming those features are already implemented or validated.

Jev may **recommend** components from an application description or trusted task context. The application owner approves the selection. Candidate text must never choose its own defenses, grant exceptions or disable mandatory checks. Evaluate routing misses as well as classification misses. Freeze the selected components before a verification run.

## What an upload proves

A bundle hash establishes the identity of uploaded bytes. Schema validation establishes that the declared suite has one explicit observation per case. Neither establishes that the calls happened, that omitted cases were never planned, that labels are correct, or that the contributor did not fabricate outputs.

The community service now accepts only a saved run ID, display name and privacy-review acknowledgment. It resolves ownership on the server, verifies frozen requests and persisted responses, and packages the full policy, source fingerprint, manifest, request bodies, outcomes and report. It neither reruns the evaluation nor accepts replacement answers, supplied hashes or a contributor's “verified” label. Only terminal policy evaluations with no unresolved dispatch qualify; stopped runs preserve errors and unrun cases. Existing uploaded files become private and cannot be republished. External/local results go through repository review until a separate attestation path exists.

Contributions still start private and need an explicit share action. Anonymous users can read public evidence. The label is **host-observed**, not verified, safe or no-regression. The compiled evaluator controls the case definitions, but users choose policies and run scope; this does not enforce an independent mandatory core suite or expose all of a contributor's private failed experiments. A content hash detects later changes only relative to a trusted stored hash. A compromised service or database remains a threat; hashes alone cannot protect against an attacker who can replace both evidence and its digest.

## Recommended trusted-runner protocol

Contributors still open a PR. A separate trusted service performs verification with their Jev key, so maintainers need not pay the provider bill for every proposal. This has ordinary hosting/operations costs; “no paid Jev CI” does not mean zero cost.

1. Resolve the PR head and comparison base to immutable commits. Take the evaluator and mandatory core suite from a maintainer-approved revision, never the PR's executable code. Accept only schema-validated policy data from the PR. Do not execute contributor packages, scripts, workflow files or URLs.
2. Freeze a manifest containing base/head commit, baseline/candidate resolved policy hashes, component/compiler hashes, mandatory case IDs and case/label hashes, requested model, question schema, thresholds, context lengths, seeds, repetitions, retry policy, scoring protocol, budget and a unique job ID. Show the contributor the estimate and request cap before they authorize spending.
3. Obtain a short-lived, narrowly scoped provider credential if TypeSafe supports one. Otherwise use a dedicated low-balance/revocable key supplied directly to the runner over HTTPS for that job. Do not put it in GitHub, a PR, exported results, URL, browser persistent storage or logs. Keep it only in bounded job memory; discard it at completion or cancellation. The operator necessarily handles the key and sees the test inputs. A provider-supported delegated token would be preferable to this trust relationship.
4. Use a fixed provider endpoint and maintainer-controlled transport. Run both policies over the same frozen cases with counterbalanced ordering and all attempts retained. Bind returned model identities and actual usage to the report. Never silently use `latest`, retry to obtain a favorable result, replace unavailable cases or run contributor code near credentials.
5. Derive the regression report inside the trusted runner. Separate attack misses, benign false alarms, abstentions, policy compliance and transport failures. Report changed cases and uncertainty, not just an aggregate score. Apply predeclared margins per relevant stratum; errors or missing mandatory coverage yield **inconclusive**, never pass.
6. Sign a canonical receipt with the runner's protected signing key (for example, Ed25519). Bind the complete manifest, attempt/result hashes, job ID, timestamps, returned model identities, usage, completion status and regression verdict. Publish its verification key and key ID; support rotation and revocation. Receipt storage should retain aborted/failed attempts too, so a successful rerun cannot hide the run history.
7. CI performs an offline signature and manifest check using trusted verification code and trusted public keys. Require exact PR head/base and the currently required suite/protocol; stale receipts fail. Independently recompute the deterministic summary from the signed evidence. CI must not accept a public key, workflow, verdict or core-suite identity supplied by the PR author. PR review and approval still apply.

A signature makes alterations detectable and attributes the receipt to the runner. It is **tamper-evident, not tamper-proof**: the runner, signing-key security, provider responses and test design remain trust assumptions. The TypeSafe HTTP API documentation describes answers, model identity and usage; it does not document a provider-signed evaluation receipt. Ask TypeSafe whether they offer verifiable receipts or scoped/delegated job credentials before building key custody. [TypeSafe API reference](https://docs.typesafe.ai/api).

A local runner can protect a contributor's key from our service, but its report cannot independently prove honest execution. A workflow controlled by the contributor has the same limitation. GitHub identity/OIDC by itself proves workflow identity, not that arbitrary supplied results came from Jev. Do not use `pull_request_target` to execute PR code with secrets. [GitHub secure-use guidance](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions).

## What “no regression” means

It means no regression **observed under a named protocol on the specified cases and margins**, not universal safety. A public core is a development regression suite and can be overfit. Keep independently authored challenge sets separate; preserve disjoint lineages, benign controls and length/position strata. Finite or correlated tests cannot establish a 1-in-1,000 risk claim by themselves.

Do not compare profiles as if they share one definition of permission. Strict admission, scoped exceptions and isolated inspection have different intended actions. Policy-neutral attack recognition and authority invariants can be shared; policy-specific action labels need reviewed profile-specific expectations. Intentional changes to those expectations require explicit review and must not silently remove protections from the mandatory core.

## Next implementation gates

- Review and freeze the mandatory core, per-profile expectations and regression margins.
- Confirm TypeSafe credential delegation and receipt capabilities.
- Audit the hosted runner and isolate publication/signing authority before relying on it for PR regression verification.
- Implement and audit receipt signing, validation, key rotation, replay/staleness checks and complete attempt accounting before displaying a verified badge.
- Keep GitHub PRs usable without ChatGPT. Hosted sharing uses Sites identity; contributors without ChatGPT can attach external evidence to a PR for review, without automatic public benchmark admission.
