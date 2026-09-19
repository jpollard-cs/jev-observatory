# Hosted execution

The browser workspace at `/workspace` can run policy evaluations, reviewed setup suggestions, coverage ranking/tagging, and original-suite replays. The root page is an introduction; research and community evidence keep their existing routes. Preparation, compilation, selection and archived-result exploration remain offline browser operations.

## Review and run

1. Describe the application and review its policy. Prepare setup advice, coverage advice, or a test plan.
2. Choose its hosted review action. Sign in for a persistent private account. Initialize a total allowance up to $3, carrying forward prior spending if this is the same budget. New accounts default to $0 prior usage. Enter actual prior charges only when continuing the same budget. Existing account ledgers are never reset by this default. This is **not** synchronized with the local ledger or TypeSafe balance. The local research ledger is unchanged.
3. Inspect request count, estimate, planning allowance, account headroom and exact request bodies. Expected labels are shown separately and never sent to Jev.
4. Enter a Jev key for this run and explicitly authorize it. Keep the tab open. An ongoing run can be reopened from **Execution options → Private runs & spending** after reload; enter the key again to continue. A dispatched request with an uncertain outcome is never retried automatically.
5. Inspect results in the same workspace or download the report. Failed setup/selection advice opens a read-only evidence panel; it cannot guide policy or test selection. Usable suggestions have a separate review action and stay unchecked until reviewed. Sharing is a separate community action.

The deployment compiles from the same policy/compiler/catalog sources as the browser and CLI. It accepts a plan specification, rebuilds it and requires an identical plan hash. It does not execute client-supplied JavaScript, PR code, arbitrary request bodies or alternate endpoints. Stored requests are individually hash-checked before dispatch.

## Credentials and accounting

The API key is held in a dialog closure only during a run, sent over HTTPS with each authorized step, used transiently by the server and then discarded. It is not in localStorage, persistent server state, URLs, exports or application logs. Closing/reloading the page, completion, error or stop forgets it. Thirty minutes ends automatic dispatch in a long session. There is no operator-owned shared Jev credential and no paid connection probe. The operator necessarily handles the key transiently; browser encryption cannot protect it against malicious code already executing in the page. Runtime request-body logging must remain disabled.

D1 stores the account allowance and run state. R2 stores immutable request manifests, individual requests and observations under private owner-scoped keys. Account creation is insert-once: reloading, another key or another tab cannot reset its prior usage or limit. An atomic database transition reserves the entire plan and allows one active run per account. A second atomic transition claims each request before network I/O. Success settles usage; an uncertain charge retains its reservation and blocks later runs until reconciled. Cancel prevents later claims, but an already claimed request may finish and remain billable. No SDK or transport retries are enabled. HTTP errors and provider bodies are not echoed to users or logs.

The pinned accounting rate is $0.042/M input tokens, free output tokens ([TypeSafe models](https://docs.typesafe.ai/models), checked 2026-09-19). Byte-based reservations are conservative heuristics, not tokenizer bounds or guaranteed provider invoice limits. If reported cost exceeds a reservation, record that cost and halt; do not erase the overrun. A changed model ID, invalid native answers or missing usage also halts the run. Unknown outcomes remain missing, never model passes. Native answers and code-derived decisions remain separate.

Initial hosted limits are 480 requests / 24 MiB request material per plan, 100 retained plans per account, one active run and a $3 account authorization. Larger suites and all original test definitions remain available to export/run locally. Batches are not silently truncated. Completed reports remain private; opening the community library does not publish them. Browsing/offline planning can be anonymous once the site is public; hosted execution currently uses Sites' ChatGPT identity. A non-ChatGPT execution login is not implemented.

These are host-observed reports, **not provider-signed attestations or signed no-regression certificates**. The stronger maintainer-defined baseline/candidate verification protocol remains separate future work. Content hashes establish bindings and integrity, not independent authenticity. An unknown dispatch needs operator reconciliation against provider evidence; there is no user-facing button that clears an unresolved charge.

## Validation without credits

```sh
cd community-site
npm ci
npm run build
npm test
npm run dev -- --signed-in --mock-jev
```

The mock preview uses its own `runtime/mock-execution` database and refuses external fetches. Its provider fixture is imported only by the development entry point, never the deployed Worker. Simulated results must never be published as Jev measurements. Automated integration tests exercise the compiled Worker against the same SQLite-shaped D1 repository, including concurrent attempts, cancellation during dispatch, model/usage validation, private ownership, exact plan binding, and budget/unknown-cost holds. Production D1 migrations are generated append-only from `community-site/db/schema.ts`.

## Provider boundary

Execution orchestration now receives a reviewed, versioned adapter. Jev-specific compilation,
validation, transport, tariffs and report shaping remain in that adapter. New stored runs pin its
identity; a different adapter version cannot silently resume them. See
[model adapters and comparable evidence](model-adapters-and-benchmarks.md) for current limits,
future provider capabilities and cross-model comparison requirements.

The description page offers **Suggest a policy with Jev** and **Define rules myself**. Suggestions
prepare an offline packet, then open the hosted request/cost review where the user enters a key.
They propose supported options for explicit review, not arbitrary automatically trusted policy text.

The active neutral Site is https://redteam-observatory.wizard.chatgpt.site. It starts with fresh hosted storage. The previous Jev Site and its manual test run remain intact; no provider credits, prior charges or private runs were copied. Visibility is governed separately by the Sites audience setting.
