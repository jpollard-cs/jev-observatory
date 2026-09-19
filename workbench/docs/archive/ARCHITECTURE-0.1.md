# Architecture · working release 0.1

## End-to-end path

```text
Validated policy configuration ─┐
Consumer context / source data ─┼─> Native Jev compiler ─> exact payload + receipt
Versioned demonstration banks ─┘              │
                                              ▼
Authored catalog metadata ─> deterministic coverage planner ─> immutable plan
Authored case facts ────────> independent policy oracle ──────> evaluation-only labels
                                              │
                                   explicit CLI approval
                                              │
                            original ledger + locked runner
                                              │
                           raw response + usage + model identity
                                              │
                       native judgments / code decision / scoring
                                              │
                      local evidence dashboard + versioned export
```

## Modules

| Module | Ownership |
|---|---|
| `src/policy.mjs` | Typed configuration, presets, context resolution, rule explanations, materialized policy and code-derived admission |
| `src/catalog.mjs` | 60 versioned cases, taxonomy tags, contrast groups, source references and evaluation-only fact annotations |
| `src/compiler.mjs` | Six focused native questions, 24 scoped demonstration occurrences, example placement, exact material preservation, source-bound receipts |
| `src/planner.mjs` | Deterministic whole-group prefix, mandatory modules, tier/budget coverage, estimates and full plan identity |
| `src/storage.mjs` | Immutable plan files, separate gold, receipts, and execution-source snapshots |
| `src/runner.mjs` | Durable reservations/settlements, recovery rules, native validation and report persistence |
| `src/report.mjs` | Report import, independently recomputed metrics and paired changes; no model grading |
| `server.mjs` | Loopback-only UI API. It cannot invoke inference or read credentials |
| `cli.mjs` | Explicit preparation/approval/run/account commands. Only `run --live` can contact TypeSafe |
| `public/` | Policy editor, planner, evidence explorer and dossier inspection |
| `vendor/` | Original admission experiment, compiler and bound project runtime; retained unchanged |

### No one-prompt source of truth

`workbench-policy/1` is the editable source. Its settings are rendered into actual `state` and typed Jev `questions`. It is not a generic chat prompt translated into Jev. The pre-existing compiler is reused for exact wire handling and receipts.

The six configurable judgments are classification, content relevance, representation relevance, representation compliance, language compliance and native policy disposition. Dossier cases add two independent task-evidence Choices. Simultaneous questions do not consume one another's answers. The code-derived decision consumes recorded findings explicitly after inference.

### Example placement

Both layouts include the same example content, context, per-question label and explanation. They differ in attachment: question instructions versus the corresponding criterion's `examples` array. Assignment hashes assert equivalence at this defined level. They do not assert equal tokenization or model behavior.

The fixed banks do not select examples from the evaluated case's gold. Encoding transformations are authored into specimens, not applied as inference-time preprocessing. The new demonstration banks contain 24 occurrences across six questions; dossier task questions have no hidden answer exemplars.

### Consumer context

The schema resolves shared and entry context through named fields. Entry values replace entire shared values, not arbitrary recursive merges; an explicit empty exception list clears inherited grants. Unknown configuration fields fail. Source material is never searched for replacement policy/context. Eligible exception IDs require policy enablement and matching host task/use/field; actual semantic fit still requires a model judgment.

The present admission target is the entire supplied `material` field as task data. This version is not a general privileged-instruction-field, tool-authorization, or multi-tenant access-control system. Identity/authentication of the caller is an external host obligation.

### Planner

A plan selects whole contrast groups. Mandatory branches are derived from configuration; remaining groups maximize unseen catalog tags, breaking ties deterministically by seed. Bronze and Silver use minimum floors above nominal percentages when necessary. Gold attempts the entire declared catalog. Repetitions and alternate layouts are added only after selecting scenarios. Runtime classification outcomes never alter this frozen order.

Rejected/out-of-policy languages and encodings are retained as enforcement tests, rather than omitted as “irrelevant.” There is no model-based catalog selection in this release. No random global-security confidence score is produced.

Every plan binds policy, options, catalog, execution sources, exact payload hashes, assigned example hashes and authored expected values (stored separately). A changed builder or catalog requires a newly prepared identity. Source-only changes can invalidate previous plans even without changing model semantics; that conservative behavior is intentional in this first release.

### Budget and execution

The runner dispatches sequentially. A reservation is durably appended before transport. Reported token usage settles it. Unknown outcomes retain their reservation; there are no retries to hide uncertainty. Error responses with known usage remain charged. Resumption validates persisted request and response hashes. A previous run's failed stage is not silently reopened.

A local cap bounds reservation-based commitments, not an external invoice. The conservative byte convention is not a formally established vendor token bound. A provider usage anomaly, missing usage, or version change stops further calls. The UI has no execution endpoint: it writes a plan and an explicit approval command.

### Imports and metrics

The current importer supports `consumer-admission-v1` and `policy-workbench-v1`, including their normalized local review snapshots. Other historical protocols remain preserved under their original artifacts; they are not silently scored with the wrong schema. Supplied top-level call counts are compared with reconstructed rows. The newest bundled report's 34 summaries and 480 request bindings were separately audited.

A label is teacher-authored data, not model truth. The oracle and production mapper are independently implemented but can still share conceptual mistakes. Public claims require external review, relevant traffic and repeated/new scenarios—not only internal agreement.

## Versioning

- Workbench application: `0.1.0`
- Configuration: `workbench-policy/1`
- Canonical test catalog: `workbench-catalog/1`
- Coverage planner: `coverage-prefix/1`
- Prepared plan: `workbench-plan/1`
- New execution report: `policy-workbench-v1`
- Historical report displayed at startup: `consumer-admission-v1`, unchanged

None of these new versions retroactively changes the old experiment's policy, labels or results.
