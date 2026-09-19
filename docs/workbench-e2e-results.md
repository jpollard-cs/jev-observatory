# Policy and suite generation E2E · 2026-09-19

The end-to-end generation path works through the production HTTP endpoints and the live Jev API. This validates the integration; it is not a general accuracy result.

## Repeatable software checks

Run `node --test tests/workbench-e2e.test.mjs` from the repository root. No dependencies, credentials or provider calls are needed. Three authored workflows exercise billing support, incident review and code review with explicitly synthetic provider responses. The checks also pass from a clean Git checkout without the local `.env`, account ledger or raw research runs.

Each workflow prepares setup advice, connects an isolated synthetic account, executes one setup request, reviews unchecked suggestions, applies only selected fields, ranks all 32 coverage groups in six requests and freezes a suite. Assertions check one-use execution confirmations, mandatory attack/control coverage despite low relevance answers, frozen-request reload, no automatic evaluation dispatch, stale advice rejection, and visible blocking gaps for unsupported external actions. No synthetic suggestion is presented as a model observation.

The existing 197 research tests also passed. Earlier integration evidence separately records 326 workbench/compiler tests, 242 browser assertions and a full 15,184-job synthetic replay; those earlier checks were not new live tests.

## Bounded live smoke

One authored read-only bilingual billing application was sent to `jev-1.13.0`, followed by ranking from its reviewed policy. The four review fields were specified before dispatch: billing task, contextual admission, English/Spanish and controlling-instruction language scope. All four selected outputs matched those expectations.

- **Seven live requests:** one setup request and six ranking requests.
- **21,475 reported input tokens; $0.00090195** at the frozen historical accounting rate, within a $0.02 combined stage cap. No retries or new unresolved holds.
- Ranked all **32 groups**: 28 direct and four adjacent. This broadly positive ranking does not establish that the advisor usefully distinguishes relevance across arbitrary applications.
- Generated a **41-case suite across 22 groups**, with all mandatory coverage included and no blocking coverage gaps. The suite was frozen and reloaded successfully; **no classifier evaluation requests were sent**.

Jev also suggested a retrieved-document surface even though retrieval was not explicitly declared. That suggestion remains in the raw evidence and was left unapplied. The operating-mode suggestion was flagged uncertain by the existing review rule (confidence 0.54); we accepted it because the authored description explicitly requested contextual admission. Confidence here is distribution concentration, not correctness probability.

See [summary and accounting](../data/workbench-generation-smoke-v1/summary.json), [reviewed policy](../data/workbench-generation-smoke-v1/policy.json), [application](../data/workbench-generation-smoke-v1/application.json), [setup response](../data/workbench-generation-smoke-v1/setup-report.json), [ranking response](../data/workbench-generation-smoke-v1/ranking-report.json), and [frozen suite manifest](../data/workbench-generation-smoke-v1/suite-manifest.json). Existing historical reports remain unchanged. The local raw evidence and original spending ledger stay in ignored `runs/`.

## GitHub and credentials

The project is checked into the private [jpollard-cs/jev-observatory](https://github.com/jpollard-cs/jev-observatory) repository. `.env` and `.env.*` are ignored at the project and workbench boundaries; only `.env.example` is tracked. The initial scan covered candidate files, reachable Git history and nested ZIP/gzip provenance artifacts, with no configured-secret or common credential-signature matches. That is a bounded automated check, not a security certification.
