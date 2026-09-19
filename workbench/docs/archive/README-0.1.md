# Jev Policy Workbench · 0.1.0

A local-first, working policy-authoring and evaluation application. It builds on the Observatory's admission experiments and native Jev compiler. This is an **experimental developer workbench**, not a certified guardrail, a deployed agent gateway, or a general-purpose policy optimizer.

## Start

Node.js 22 or later is required. There are no packages to install for the local app.

```bash
bash "$HOME/Desktop/jev-policy-workbench/run.sh"
```

Open the printed address, normally **http://127.0.0.1:8787**. The process binds only to loopback. `Ctrl-C` stops it. Use `node server.mjs --port 8788` for another port.

**Starting the app does not read `.env`, call a model, spend money, or publish anything.** Keep the original project and its credentials where they are; this folder can remain on Desktop. There is no installer.

## What works

- Strict, contextual, and isolated-inspection presets with explicit task description, language allowlist or any-language setting, language scope, representation restrictions, consumer-owned exception modules, relevance requirement and configured violation disposition.
- Versioned rule cards explaining purpose, tradeoff, limits, and associated tests.
- Actual native Jev payload preview, including `criteria.<outcome>.examples` or question-local examples. The two renderings preserve the same per-proposition examples.
- Custom material/context preview without automatically assigning expected answers.
- A deterministic Bronze/Silver/Gold planner with mandatory coverage, complete contrast groups, seeded nested selections, conservative dollar/token reservations, a visible exclusion list, and optional repeated observations.
- Immutable execution plans: exact request bytes, hashes, compiler receipts, evaluation-only labels, and a source snapshot.
- A command-line live runner using the original append-only ledger, model/version validation, request/response persistence, shared locking, explicit full-plan confirmation, no automatic retries, and safe resumption of known completed calls.
- An evidence explorer with the supplied 480-call report, recomputed metrics, native versus code-derived decisions, false-alarm filters and inspectable cases. Import reports locally; export a review snapshot.
- A context laboratory with three coherent synthetic dossiers, each with clean, fictional-quotation, early/middle/late injection and split-instruction variants. Each has two separate task-evidence questions.
- A source-bound handoff and an additive data/presentation adapter for the existing Observatory. The hosted site was not modified or published.

## First workflow

1. Open **Policy builder**. Select a preset and review the rule cards. Any edits remain an **unmeasured draft**, even with historical evidence on screen.
2. Compile a catalog preview or supply your own material/context. Inspect the resulting JSON and receipt. Compilation is offline.
3. Open **Evaluation planner**. Choose coverage, budget, layouts and repetitions. Preview what will be included and what remains untested.
4. Freeze the plan. The application writes immutable files under `runtime/plans/<plan-hash>/` and displays an explicit CLI command. It does not execute that command.
5. Review that command and its cap before running it in Terminal. On completion, use **Import report** in the evidence explorer to open the reported `report.json` path.

## Existing project / paid execution

The generated command points to the original project:

```text
/Users/jordan/Documents/Codex/2026-09-16/i-g/outputs/jev-redteam
```

It reads that project's `.env` only when the operator invokes `run --live` with the exact plan hash. It preserves the same `runs/rich-restart-budget-v1` ledger and lock used by previous experiments; it verifies bound source files and refuses to run against a missing prior-spend history. It does not reset the old unresolved hold.

```bash
node cli.mjs run \
  --plan '/absolute/path/to/runtime/plans/<hash>/manifest.json' \
  --confirm '<full plan hash>' \
  --project '/absolute/path/to/outputs/jev-redteam' \
  --live --limit 12
```

`--limit 12` is an optional bounded invocation. Resume with the **same plan** and no limit to dispatch the remaining unattempted jobs. Completed identities are not retried. A failed or uncertain request requires evidence reconciliation; restarting does not erase it.

New output directory:

```text
<project>/runs/policy-workbench-<first-20-characters-of-plan-hash>/
```

The initial runner is deliberately **sequential**, with at least 300 ms between a completed response and the next start, a 30-second transport timeout, and no automatic retries. All model calls are to the first-party TypeSafe endpoint. A model-version change stops the run. `Ctrl-C` waits for the current request to be recorded and stops new dispatches; a forced kill can leave a reservation requiring manual reconciliation.

The frozen accounting price is $0.042 per million input tokens, zero for output, sourced from TypeSafe documentation on 2026-09-18. A conflicting configured price stops the run. Dollar limits are local accounting controls, not a promise about the provider's invoice. Token forecasts use bytes/3; reservations use bytes+256 per request. Neither is a vendor tokenizer. Actual usage is reconciled from the response; an over-reservation usage anomaly halts the ledger.

## Explicit standalone accounts

For a different developer without this original project:

```bash
node cli.mjs init-account --directory "$HOME/jev-test-account" --cap-usd 1
```

Place their own API configuration in that account's `.env` or process environment, then use `--account /path/to/jev-test-account` instead of `--project`. Initialization is explicit and refuses to replace an existing account. It is not a workaround for resetting the original shared budget. The server never receives credentials.

## Catalog and coverage

The versioned catalog contains **60 case/context combinations in 21 contrast groups**:

- 32 inherited admission cases, retaining their original material/context and authored annotations;
- 8 matched language probes in English, Spanish, French and German;
- 2 message-level Unicode-concealment probes;
- 18 coherent-dossier variants over three documents.

Seven inherited examples are ordinary-style synthetic usability probes. None of this is sampled production traffic or independently adjudicated gold.

Bronze/Silver/Gold target nominal 5%/20%/100% of **groups**, not rows, but mandatory coverage takes precedence. For this small catalog the minimum is much larger than 5%. With the default strict profile, both layouts, one observation, $0.15 / 3,000,000 reserved-token caps:

| Tier | Cases | Groups | Physical requests | Forecast USD | Conservative reservation USD |
|---|---:|---:|---:|---:|---:|
| Bronze | 28 | 9 | 56 | ~0.0148 | ~0.0450 |
| Silver | 37 | 12 | 74 | ~0.0209 | ~0.0634 |
| Gold | 60 | 21 | 120 | ~0.0361 | ~0.1095 |

These planning figures are not live usage. Exact figures are recomputed when a plan is prepared. Gold covers the declared catalog, not all attacks. Smaller caps produce an explicitly partial or non-dispatchable plan rather than a misleading grade.

## Important scope limits

**Task configuration versus test contexts:** the custom task is used for custom previews and export. The built-in catalog supplies its own authored task contexts; it does not automatically validate arbitrary prose a user typed into the task field. User-specific scenario synthesis and independent label review remain future work.

**Language setting versus validated competence:** “any” means no language restriction in this contract, not evidence of universal model capability. Four languages have new authored probes and no new live observations in this release. Other language tags are permitted in configuration but explicitly shown as uncovered. No automatic language-family or region fallback is applied.

**Context panel:** the dossiers are roughly 900–1,400 words each, not 32k/64k-token workloads. They contain relevant distributed facts and no inert filler. They remain synthetic small task-grounded tests, not full-window or end-to-end agent evaluations.

**Admission versus inspection:** an `allow` for isolated analysis is never permission to forward or obey the source. The code-derived decision is an evaluated comparator over fallible findings; it is not deployed as a production enforcement service.

**Deferred:** automatic Jev-based catalog tagging, autonomous policy optimization, arbitrary-language gold generation, a public upload backend, user accounts, a real production gateway, and other model providers. The optional Observatory JSX section still requires the original website's integration/build/publication workflow.

## Validation and provenance

```bash
npm test
npm run verify
node scripts/audit-report.mjs --project vendor/legacy-runtime
```

- `docs/ADMISSION-RESULTS.md`: the latest measured results and their limitations.
- `docs/ARCHITECTURE.md`: contracts and module boundaries.
- `docs/SECURITY.md`: trust, storage, network and credential behavior.
- `docs/HANDOFF.md`: reconciliation with the original Codex project.
- `validation/receipt.json`: actual validation runs and scope.
- `provenance/`: retained prior handoff/clarification and source checksums.

The new workbench code and catalog have **not been measured with live Jev inference here**. Offline tests, simulated transport tests, and historical report audits are separate evidence categories.
