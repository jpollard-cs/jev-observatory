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
