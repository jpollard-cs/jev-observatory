# Reconstruction record · 0.5.0-rebuilt

## Basis

The unavailable 0.5 candidate is not an ancestor of these bytes. Its requirements were reconstructed from the conversation and Codex handoff. The sole source baseline is `jev-policy-workbench-0.4.1.zip`, SHA-256:

`bbaa618f7dfe02af5cbc0a5936ea2036def58f347ef15d1f9db4235036fc9ecf`

All 356 parent-manifest files were checked before editing. Archive equality is not proof of semantic correctness or a security audit.

## Scope and ownership

| Area | Owner in this release |
|---|---|
| Existing deterministic policy, expectations, target payloads | Retained `policy.mjs`, `catalog.mjs`, `compiler.mjs` |
| Setup option library and review transactions | New `src/setup.mjs` |
| Paid setup request persistence/validation | Existing metadata advisor machinery, extended with distinct `mode: setup` |
| Paid transport, durable accounting and pinned response version | Existing local connection and metadata runner |
| Five-step presentation/progress | New `public/workflow-model.js`, `guided.js`, `guided.css`; integrated in `app.js` |
| Historical evidence/atlas/suites | Retained renderers, data and historical runtime |

No step lets the setup assistant supply test gold, register new trusted roles, execute arbitrary code, or create new exceptions. Model output chooses from reviewed options. Explanations are authored option-library text, not a claimed model reasoning trace.

## Setup request schema

The request has native `state` and `questions`, not a generated chat transcript. One physical call contains sixteen independent Choice questions:

| Questions | Options / behavior |
|---|---|
| Task starting point | Incident review, billing support, code review, other/custom, keep current, insufficient evidence |
| Operating contract | Strict, contextual, isolated inspection, keep current, insufficient evidence |
| Language scope | All natural-language content or controlling instructions only, keep current, insufficient evidence |
| Language list | English, English+Spanish, English+French, manual review, keep current, insufficient evidence |
| Seven input surfaces | Present / not indicated / insufficient evidence for each existing surface |
| Five additional capabilities | Present / not indicated / insufficient evidence for each capability |

These are narrow suggestions, not universal natural-language form completion. Other language combinations and unmatched application types require manual review. Surface/capability proposals can add declared coverage needs but grant no runtime capability. Missing corresponding tests remain coverage gaps.

`state` contains the application description, current draft, option-library version and explanatory notice. It does not contain test material, gold labels, account paths or budgets. Do not enter secrets into the application description.

Choices within a request do not consume one another. Code constructs a reviewable change proposal from the saved responses. It does not infer correct settings by multiplying model probabilities. Confidence/gap thresholds are provisional review cues, not calibrated correctness.

## Review and stale-state semantics

- Nothing is sent on page load, typing, or key load.
- Offline preparation binds exact policy, application, question definitions and current execution sources.
- A separately confirmed paid stage uses the existing five-minute, single-use, key-generation/account-bound authorization.
- All changes start unchecked. The UI displays current and proposed values and consequences.
- A changed policy or application makes advice stale; it cannot be selected/applied until new advice is prepared.
- Apply validates an allowlist of writable paths and the exact prior draft. Selection cannot raise budgets, alter model/endpoints, mutate unknown keys, or enable an exception.
- Mode changes explicitly clear previously enabled exceptions. Inspection changes the operation under assessment; it is not a safety upgrade.
- Multiple selected surface/capability additions are merged rather than overwritten by the last item.
- Undo restores the prior transaction only while the draft still matches the applied result. It refuses to overwrite later edits.
- Setup reports are not valid relevance-ranking reports and do not enter that cache. They remain separately identified under `runtime/setup-advice/` and `runtime/setup-reviews/`.

Local hashes detect changes; they are not TypeSafe attestations. Imported proposals still need owner review.

## Progress and navigation

The five-step rail separates three setup checkpoints from actual execution and matching results. Imported old reports cannot satisfy execution of the new plan. A copied command is not a run. Application/rule changes reset relevant checks and saved preview state.

Draft fields and reviewed checkpoints persist in browser-local storage. A prepared plan is immutable on disk; the active plan screen and imported setup review are not automatically reattached after reload. Preserve the printed command or reopen/reprepare the exact plan. This is a known convenience gap, not lost run evidence.

The original atlas, galaxy, charts, linked inspector and source-bound observations remain available without onboarding, keys or budget inputs. The sidebar is viewport anchored; advanced destinations follow the main workflow.

## Budget language

Dollar allowance is primary. The planner separately displays estimated use, conservative preflight commitment, and unused budget. The optional input-size limit applies to the whole test plan, not to a request's context window. Byte/3 usage forecasts and bytes+256 allowances remain historical heuristics, not vendor token counts or invoice guarantees.

The former $0.40 ceiling is not reinstated. Larger values are accepted. This does not raise the account's cumulative authorization, erase existing charges or fill the budget with invented cases. Inspection of old evidence and editing policy do not validate unfinished budget inputs.

## Validation boundaries

Software tests and synthetic provider responses validate mechanics. They do not establish live acceptance, useful suggestions, calibration or adversarial resistance. The actual browser modules were loaded separately; no import/export flattening was used. This environment blocks direct browser navigation to loopback, so acceptance used the documented API-only bridge. That does not validate browser-to-loopback transport or the served CSP. Separate direct HTTP tests cover Host/Origin/CSRF and local endpoints. Direct-browser acceptance on the Mac remains required before production credentials or release publication.

No real credentials or paid calls were used. The sole browser setup execution had an unmistakably synthetic key and injected test transport. Synthetic suggestions are not stored in the historical evidence catalog.

## Reference behavior checked

- TypeSafe Primitives: https://docs.typesafe.ai/primitives — typed choices, independent questions, confidence semantics.
- TypeSafe Advanced primitives: https://docs.typesafe.ai/primitives/advanced — structured descriptions.
- OWASP CSRF Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- W3C APG Tooltip: https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/

These inform the design, not certification of this implementation. No current-price claim is made by the retained historical accounting constants.
