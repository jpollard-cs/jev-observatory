# Observatory 0.4 — atlas and original evaluation suites

> Version note: this retained specification describes the earlier implementation. In 0.4.1, `LOCAL-CONNECTION-AND-FIXES.md` supersedes its small planning-budget maxima, unconditional browser-offline statement, and browser-test helper description. Historical policy/data semantics remain unchanged.

This is an additive local release based on 0.3. No provider inference or publication was performed while building it. Historical data remains historical; simulated responses exist only in tests and are not shipped as observations.

## Outcome atlas

The old SVG ring view is replaced by an interactive Canvas-rendered perspective scene. It retains the original galaxy backdrop and adds smooth orbit/tilt, scroll and button zoom, a fly-closer camera, point pinning, related-contrast links, keyboard navigation, an expanded viewport, a difference navigator, and local PNG export. Animation defaults on with galaxy mode, pauses out of view, and respects reduced-motion preferences. No external graphics dependency or CDN is needed.

Three layouts are available:

- **Constellations:** deterministic family groupings. Position and distance are display choices, not semantic embeddings, cluster discoveries, or risk estimates.
- **Outcome islands:** groups the selected judgment's authored expected answers. This does not mean the model produced those answers.
- **Measured signal:** X is the recorded classification attack-option probability; Y is log recorded latency; Z is log recorded input tokens. Rows lacking one of those measurements are omitted and counted. Option probability is not a calibrated correctness estimate.

Colors compare the selected native judgment with its actual authored expected answer. Boolean original judgments use their frozen Noul threshold of 0.5. Missing or unasked fields remain ungraded. Code-derived feature answers remain labeled in the evidence inspector and are not silently relabeled native inference. Repeated cases retain distinct run/condition/repeat identities. The atlas can show one condition or all conditions in one recorded experiment; a combined view is not a pooled security score.

The new **catalog** atlas has hollow blue markers for unrun definitions. It never uses simulated outcomes to populate a galaxy. Background particles are decorative. Clicking a real observation opens its bound evidence; clicking a catalog cell opens its source-derived original request and separately displayed expected answers.

## Two planners, different contracts

The existing current-policy planner still has 60 cases and the 0.2 Jev-assisted group-selection workflow. Its Gold setting covers that catalog. Current policy editing, standard compilation, fixed demonstrations, and case annotations are unchanged.

The new **Original evaluation suites** planner executes original contracts directly. It does not apply the admission editor's current settings or reinterpret judge/moderation/integrity results as admission answers. It does not yet feed its 15,184 cells into the application-tailored Jev relevance allocator.

| Preset | Requests before optional filtering |
|---|---:|
| Family sweep: all 18 original families; seed 0, 512 UTF-16 context units, middle, balanced, structured, policy arm | 36 |
| Context and position: same families across 512 / 4,096 / 16,384 and beginning / middle / end | 324 |
| Policy contrast: all 18 families under original permissive / balanced / strict | 108 |
| Original boundary extensions | 64 |
| Complete original matrix | 15,120 |
| Complete matrix plus original extensions | 15,184 |

The 64 boundary extensions contain 24 integrity cases in six four-way groups, 16 judge cases, 16 moderation cases, and eight scope/authorization cases. All 26 contrast groups retain their original membership and expected answers. Matrix cases retain their 7,560 malicious/benign pairs.

Original matrix families include authority spoofing, delimiter breakout, encoded payloads, split resources, conversation and memory poisoning, retrieval and tool-result spoofing, judge injection, answer laundering, policy overrides, moderation boundaries, invisible Unicode, hidden HTML source, bidirectional/confusable text, variation selectors, and multilingual redirection.

The full matrix is 15,120 **factor-expanded cells**, not independent attacks: it has 12 semantic lineages and 1,296 distinct source-context values before policy/prompt/output expansion. Its padding is repetitive synthetic meeting prose. HTML cases are source-text cases, not rendered-pixel multimodal evaluations. Original extension distractors likewise remain exactly as authored.

Filters expose family, extension suite, archive seed, context length, position, original policy profile, original output mode, prompt arm, and original split. Versioned native question builders `policy-v4`, `advanced-v3`, and `legacy-v2` remain selectable. Default is `policy-v4`. The model selector remains `jev-latest` for byte-identical original requests, but the runner requires the returned model to be `jev-1.13.0`.

Gold comes from the frozen original source and is projected onto questions actually asked. A binary or scores-only cell does not acquire an invented policy-decision expectation. An active moderation specimen is not automatically an injection. Original numeric interference scores do not gain fabricated exact-label gold. The native responses and original complete expected objects remain inspectable.

## Budget and resumable execution

Browsing, previewing and saving plans are offline. Only an explicitly approved Terminal command with the full plan hash and `--live` can send requests. The browser never reads credentials or dispatches inference.

Original replays default to $0.40. The operator can explicitly choose another run limit up to the existing $3 account ceiling. Existing project usage, unresolved holds, the previous-history floor, and the shared lock remain authoritative; no new ledger is silently initialized to evade them.

A full selection can be larger than the spending limit. At the frozen price and byte-based forecast, the complete default matrix is approximately $5.89, and matrix plus extensions approximately $5.90. These are **not provider-token counts or invoices**. The remaining trial budget therefore must not be advertised as enough for a complete run. The UI warns when a plan is forecast to exceed its limit.

Choose **Select conservatively affordable subset** to filter whole groups under the byte-based planning allowance before saving. Otherwise the whole selected catalog remains visible, with dispatch stopping at the actual per-run/shared budget. A budget boundary does not start an unaffordable partial contrast: the pending group's conservative reservations must fit before its next member is dispatched. Transport failures, explicit operator stops or usage anomalies can still interrupt a group and remain explicit partial evidence.

The retained convention forecasts input at UTF-8 bytes/3 and reserves bytes+256 input planning units per request. It is not a vendor tokenizer or a formal upper bound. Reported usage settles reservations; overruns and unknown usage stop further dispatch. There are no automatic retries.

Large-plan storage saves request bytes incrementally and separates evaluation-only expectations. The runner writes a small progress checkpoint per response and a full compact report every 128 responses plus exit. Its scoped ledger optimization is validated against the original reducer; it is not a changed spending policy. Full-size simulations exercise actual original request shapes, persistence, a partial invocation, resumption and no-duplicate completed resumption.

## Additional recorded evidence

Two additional recorded sources are now registered beside the previous four:

1. **Original campaign:** 3,920 planned cells, 3,691 hash-bound valid response records, one historical uncertain dispatch, and 228 unattempted rows. Its matrix, smoke, representation diagnostics and four extension suites remain separate conditions. All 3,920 frozen requests were hashed; matrix and extension requests matched the vendored original builders. Existing responses were revalidated against their exact question schemas. This is not a newly completed campaign or 3,920 successful calls.
2. **Original encoding diagnostic:** 32 historical observations, keeping supplied-candidate recognition separate from attack classification. Original native labels and distributions are preserved. Recognition among candidates is not free-text decoding.

The archived campaign's native fields are imported without re-generating responses. No historical spending is charged again or merged into the current account. Other datasets' raw records remain in the original project. The old campaign was stopped; this release does not resume its old run identity.

## Verification boundaries

Software tests establish implementation behavior, not model effectiveness. Browser checks use the real UI through a local API test bridge because direct browser loopback access is blocked in this execution environment. Direct server routes, MIME types and origin/CSRF restrictions are tested separately. The bridge transports JSON strings to avoid instrumentation overhead on the full catalog; it does not alter model data, renderer geometry, or UI logic.

Nothing has been published to the hosted Observatory, committed to the user's original repository, or sent to a production agent. The original `.env`, Git history and complete live `runs/` remain in place on the user's machine.
