# Observatory presentation and data-binding review · 0.3

## What was actually wrong

The original report did **not** contain only `allow` expectations. The 0.2 UI read `expected.policy_decision` directly, with an `ungraded` fallback—not an `allow` fallback. Its initial state chose contextual admission. However, importing any report unconditionally changed the selected condition to the first condition in that report (`public/app.js`, original line 124). For the latest report that was the historical rich inspection control. The first displayed records in that condition are predominantly authorized inspections, including specimens containing attacks. The operation being allowed was not sufficiently prominent.

That reproduces a misleading selection path, not proof of the user's exact previous screen state. The repair does not rewrite gold labels to force a desired distribution.

## Counts verified against the unchanged admission report

| Recorded condition | Allow | Review | Block | Observations |
|---|---:|---:|---:|---:|
| Rich historical control | 45 | 0 | 3 | 48 |
| Restored compact historical control | 45 | 0 | 3 | 48 |
| Inspection, question-local | 64 | 0 | 0 | 64 |
| Inspection, criterion-local | 64 | 0 | 0 | 64 |
| Strict admission, question-local | 16 | 4 | 44 | 64 |
| Strict admission, criterion-local | 16 | 4 | 44 | 64 |
| Contextual admission, question-local | 26 | 6 | 32 | 64 |
| Contextual admission, criterion-local | 26 | 6 | 32 | 64 |

Source: `data/consumer-admission-v1.report.json`, protocol `consumer-admission-v1`, plan `4bc192ef661de84e70299f0e1bd140a7cdd7c3321de7c5fe958620b3db79ae60`. Inspection means isolated analysis, not admission, obedience, or successful prevention. The three historical block expectations concern unauthorized memory use; do not reinterpret those rows as ordinary inspection.

## Repairs

- Selected recorded run and condition are distinct from the policy-editor draft. A fresh admission-report view starts on contextual admission; an explicit saved condition is respected on re-import.
- Each condition displays its operation and its **complete expected-decision distribution**. The filtered table separately reports filtered counts and supports expected-decision filters.
- Imported reports with the same protocol but different identities remain separate runs. Four prior protocols are now available from frozen report files, without needing a new model run.
- Explicit aliases normalize the older `policyDecision` and `inputContract` names. Conflicting aliases are rejected. Missing expectations stay missing/ungraded; no safe or allow answer is invented.
- Stable observation keys include run, plan, condition, case and repeat identity. Table rows, orbital points, matrix filters and the inspector share these keys. Repeated IDs no longer open the first matching observation accidentally.
- The inspector no longer loads a current-catalog case merely because its name matches a historical row. Frozen admission specimens require protocol/plan/condition/case/request-hash agreement and a hash-checked fixture snapshot. The base specimen is clearly distinguished from a complete padded wire request. Other unmatched specimens remain unavailable.
- Original expected objects and raw answers remain available in the inspector. Deterministic feature classifications are explicitly labeled code-derived rather than fabricated native answers.
- Physical requests, display observations and historical-reference rows are separate. The compact rerun has 48 requests, with 48 additional baseline rows displayed as reference—not 96 new calls.

## Visual restoration

The project name is **Observatory**, with **Jev policy workbench** as its description. The invented corporate-style “by Observatory” attribution is removed.

The galaxy painter is ported from the original `site/src/content/dashboard/CosmicBackdrop.jsx`, retained verbatim under `provenance/original-observatory/`. It is on by default, has a saved off switch, and honors reduced-motion/visibility settings. The background is decorative: it does not claim to encode evaluation data.

The observation atlas maps each plotted point to one recorded row, grouped by family and context variant. It supports automatic rotation, drag/tilt controls, hover, keyboard selection, and an exact-row inspector. Its distances are categorical display positions, not semantic embeddings or security probabilities. Confusion-matrix cells filter the corresponding records; comparison bars keep policy-specific denominators; the latency plot uses recorded token counts and timings only.

The sidebar is fixed to both viewport edges. Its navigation can scroll independently; the footer remains reachable. On narrow screens the same menu becomes a full-height drawer with focus containment and Escape dismissal. Tall portrait and short landscape viewports were tested explicitly.

## Validation and limits

`validation/data-binding-audit.json` records 2,272 display-row bindings across four archived reports: source expectations and raw answers are identical to the corresponding original rows. This number includes reference/reused evidence; it is not a count of new requests or independent scenarios.

The audit compares 360 compiled requests (60 cases × three presets × two layouts) against extracted release 0.2. They are unchanged. Sixteen core/data/selection files and all 170 vendored files match the parent checksums. This release does not change the policy, test material, oracle, coverage allocation, budget ledger or paid-call execution behavior.

Software tests and browser checks are recorded separately. Browser QA executed the real UI modules through a local HTTP bridge because this environment blocks direct browser navigation to loopback. No browser policy was bypassed. Direct HTTP routing, MIME types, origin/CSRF boundaries and static module availability were independently tested. The archived provider report is evidence supplied by the user, not a provider-signed attestation; raw HTTP response files on the Mac were not rehashed here.

No live inference, ledger edits, original-site publication or production deployment occurred. Frozen plans from 0.2 should be resumed using their matching 0.2 source folder; a new release has a different source identity even where the compiled model requests are unchanged.

## Reproduce

```sh
npm test
node --test vendor/admission-v1/vendor/compiler/tests/compiler.test.mjs
node scripts/audit-ui-data.mjs
# Optional: unzip provenance/parent-workbench-0.2.zip into another directory first.
node scripts/audit-ui-data.mjs --baseline /absolute/path/to/jev-policy-workbench-0.2
```

The optional baseline argument adds exact rebuilt-request comparisons to the file/report audit. None of these commands contacts Jev.
