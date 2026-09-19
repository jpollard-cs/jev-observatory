> **0.4 extension:** The foundational architecture below is retained for continuity. The current historical replay and atlas contracts are specified in `ATLAS-AND-SUITES.md`. New modules are `src/history/{catalog,planner,runner}.mjs`, `replay.mjs`, `public/{atlas,atlas-data,library}.js`. Historical execution is separate from the 60-case policy-aware planner.

> Version note: this retained specification describes the earlier implementation. In 0.4.1, `LOCAL-CONNECTION-AND-FIXES.md` supersedes its small planning-budget maxima, unconditional browser-offline statement, and browser-test helper description. Historical policy/data semantics remain unchanged.

# Architecture · Jev Policy Workbench 0.2

```text
Policy + application selection context   Owner-reviewed granular registry
                 \                         /
               Native Jev relevance request plan
                         | explicit CLI / same ledger
               Frozen advisor evidence + distributions
                         |
        Mandatory rules + independent exploration + constrained allocator
                         |
        Unchanged case compiler + evaluation-only oracle
                         |
               Frozen evaluation plan + source receipts
                         | separate explicit CLI / same ledger
             Raw observations + native / code-derived decisions
                         |
                    Evidence explorer
```

Optional metadata tagging runs beside this path: group descriptors → independent facet suggestions → human/source review. It cannot automatically change the authoritative registry.

## Modules added

| Module | Ownership |
|---|---|
| `src/selection/registry.mjs` | 12 facets; 32 small units over existing 60 cases; dependencies and shared controls |
| `src/selection/application.mjs` | Closed host selection-context schema, not source authority or target context rewriting |
| `src/selection/advisor.mjs` | Native ranking/tagging requests, immutable metadata plans, bounded confidence heuristics, report validation |
| `src/selection/allocate.mjs` | Pure cost/coverage allocation; model-independent floor, exploration, shared-cost accounting |
| `src/selection/planner.mjs` | Policy-aware required coverage, compatibility gaps, unchanged compiler/expected-answer integration |
| `src/selection/runner.mjs` | Explicit metadata execution through shared ledger, preserved evidence and no-retry recovery |
| `src/sources.mjs` | Common execution-source binding |
| `selection.mjs` | Prepare, run, inspect and compose from advice; explicit live approval |
| `public/selection-ui.js` | Advisor UI and review-only tags |
| `integrations/historical/` | Read-only original-family metadata export, not full replay integration |

## Existing integration

`src/planner.mjs` retains the original strategy and routes plan/2 validation to the new planner. `src/runner.mjs` retains original target transport/scoring, rejects missing mandatory coverage, links advisor response hashes to the same account, and subtracts advisor committed cost from the workflow's evaluation allowance. `server.mjs` adds offline preparation/import/cache/plan endpoints only. There is no live execution endpoint.

The policy builder, 60 test cases, compiler, fixed demonstration banks, case oracle and vendor snapshots remain unchanged. The new application context is a selector input only; it cannot silently replace a fixture's receiver context or attach answers. Existing version-1 plans should continue to be run with their original frozen source release, rather than rewritten under version 0.2.

## Version identities

- App: `0.2.0`.
- Active case content remains `workbench-catalog/1`.
- Granular registry: `granular-workbench-catalog/1`; facets `coverage-facets/1`.
- Application metadata: `selection-application/1`.
- Advisor plan/report: `catalog-advisor-plan/1`, `catalog-advisor-report/1`.
- Assisted plan: `workbench-plan/2`; existing evaluation report protocol stays `policy-workbench-v1` with new design provenance.
- Policy schema and original target rendering semantics remain unchanged.

See `SELECTION.md` for actual thresholds, scope/coverage limitations, cost accounting and validation boundaries. The full 0.1 architecture is retained under `archive/ARCHITECTURE-0.1.md`; old notes describe their own source version only.


## 0.3 evidence and Observatory presentation

`src/evidence-library.mjs` is an allowlisted registry of four immutable historical report files. Each is projected through explicit protocol adapters in `src/report.mjs`. Display rows preserve source expected objects, raw answers, original source hashes, physical-stage references and request hashes. Known camelCase expected-label fields are normalized explicitly, without a default allow. Code-derived classifications retain their origin and are not represented as native answers. Repeated observations receive distinct report/plan/condition/row/repeat identities.

The evidence UI uses recorded report and condition state separate from the editable policy. Its full-condition counters, filtered table, matrix cells, orbital points and detail view share the same normalized rows. Switching condition clears incompatible filters. Report imports retain a saved condition for that report identity; the latest admission report defaults to contextual admission, not the first historical inspection control. A same-protocol report with a different source identity remains a separate run.

Exact historical specimen display is intentionally narrower than report import. The archived admission fixture is shown only when protocol, plan, condition, row, specimen ID and request hash match and the frozen fixture file matches its registered hash. This displays the exact base specimen and authored context, not a claim to reconstruct the full padded HTTP body. Other sources remain explicitly unavailable rather than being replaced with a current editable catalog match.

`public/cosmos.js` ports the original Observatory canvas painter, retained in `provenance/original-observatory/CosmicBackdrop.jsx`. It is decorative and separate from evaluation data. `public/observatory.js` renders categorical observation orbits, interactive confusion matrices, per-condition comparisons and recorded token/latency plots. Orbital spacing is not an embedding or security score. Every plotted observation has a stable row link. Animation respects reduced-motion and visibility; a saved galaxy toggle defaults on.

The navigation is fixed to both viewport edges using dynamic viewport height, with independently scrolling menu content and an anchored footer. Small viewports use a full-height drawer with focus trapping and Escape dismissal. No external chart service, fonts, runtime dependencies, inference routes or authenticated publishing connection are introduced.

Release 0.3 changes package/source identities, so frozen 0.2 plans still belong to the original 0.2 directory. No historical model request, policy definition, catalog expected-answer implementation, coverage allocator or paid-call runner was changed for this release.
