# Target-path architecture

## Integrated policy workbench

The canonical interactive authoring application is now `workbench/`; [integration notes](workbench-integration.md) distinguish its current capabilities from the preserved research harness below. `scripts/workbench.mjs` is a thin process and account-inspection adapter. It does not load credentials, dispatch inference, change classifier requests or reinterpret historical outputs.

The imported package retains its policy/setup domain, pure compiler and selection allocator, injected inference boundary, append-only account ledger, and browser presentation modules. Setup suggestions, coverage relevance and target classification remain separate purposes with separate evidence. An application description can suggest reviewed settings and help rank fixed test groups; neither operation changes gold labels or grants source authority. Draft edits invalidate advice and frozen plans. Execution still requires approval of the exact prepared plan within the original account allowance.

Integration keeps the imported production sources intact, records the small documentation/browser-fixture delta in its manifest, and preserves original requests and account history. The workbench's synthetic acceptance results establish software behavior only, not live suggestion quality or classifier accuracy.

## Preserved research harness

The target path now has a functional domain core and a small imperative boundary. It still makes one model request per trial and does not add a detector, repair pass, fallback model, or adaptive question chain.

| Layer | Responsibility | Files |
| --- | --- | --- |
| Domain | Build versioned native questions; validate and project typed answers; describe errors as values | `harness/domain/native-questions.mjs`, `native-answers.mjs`, `debugging-questions.mjs`, `result.mjs` |
| Application | Send an assessment through an injected transport and retain response evidence | `harness/application/inference.mjs` |
| Port | Define the asynchronous JSON transport contract | `harness/ports/json-transport.mjs` |
| Adapters | Resolve explicitly supplied environment configuration; implement HTTP with injected fetch, clock and timeout | `harness/adapters/endpoint-environment.mjs`, `http-json.mjs` |
| Compatibility boundary | Supply existing configuration and preserve CLI/promptfoo import contracts | `harness/provider.mjs`, `typesafe.mjs` |

The domain knows neither environment variables nor files, clocks or HTTP. Question construction receives policies and authorized context as arguments, and returns a detached request value. Annotation/gold fields are excluded by construction. The application depends on the transport port; a test can replace it without intercepting global network state.

The shared result shape is `{tag: 'ok', value}` or `{tag: 'error', error: {code, retryable, context}}`. Safe context contains status codes, timing and field/question identifiers; it contains no keys, request state or raw error bodies. Retryability is descriptive. The adapter never retries automatically. Compatibility facades retain established return shapes; configuration/request-builder exceptions remain confined to their explicit `unwrap` boundary.

HTTP success and valid model output are separate outcomes. A native answer validation failure preserves raw answers and provider usage while returning a validation issue and null projected output. It is therefore observable as a malformed response rather than a transport failure. Rounded probabilities remain unchanged; consistency residuals are diagnostics.

The design uses domain concepts—assessment, authorized policy, native question, typed answer and transport failure—without introducing repositories, services or inheritance where no persistence or polymorphism is needed. Pure builders and validators carry behavior; HTTP and configuration adapters carry effects.

Versioned request snapshots verify that the original pilot and advanced-v3 request bodies can still be reproduced byte for byte. Additional tests verify structured EntryType requests, absence of annotation leakage, dependency injection, single-attempt HTTP behavior, safe error propagation and retained evidence. Offline software verification and observed model performance remain separate evidence.

## Campaign and reporting boundaries

The campaign domain defines immutable request identities, dispatch reservations, settlement events, phase coverage and the preflight gate. `harness/application/campaign-run.mjs` coordinates these values through injected persistence and inference ports. `scripts/campaign.mjs` is the composition root for environment loading, a global process lock, append-only ledger files and durable raw evidence. The $4 ceiling is shared across campaign directories; an interrupted dispatch retains its reservation and is not automatically retried.

Request bodies and the complete 15,120-case catalog are frozen before dispatch. New question contracts select prospective policy profiles 1.1 and bounded-rounding validation, while earlier versions preserve their original semantics. Schema validation never renormalizes probabilities, changes a chosen answer or infers a disposition from reason flags.

Extension, representation and corpus summaries are pure functions over frozen plans and recorded answers. `scripts/report-campaign.mjs` reads completed evidence and writes separate versioned summaries. `harness/site-campaign.mjs` projects those summaries into display rows; the Site uses only precomputed snapshots. Offline Promptfoo replay reads frozen responses through a separate provider and cannot add observations or invoke the live target.

## Local comparison and diagnostic boundaries

`harness/domain/qwen-baseline.mjs` maps the approved native request into a lossless role-based request and validates generated outputs. `harness/adapters/local-qwen-http.mjs` owns loopback HTTP, injected fetch/clock, timeouts and retained exchanges. `scripts/qwen-baseline.mjs` is the composition root for model/runtime pins, tokenization preflight, immutable request files, one-time dispatch markers and recorded responses. These three implementation files are hash-pinned in the run manifest; changing them cannot silently continue the frozen run.

`harness/domain/encoding-diagnostic.mjs` constructs the separate paired diagnostic. Its offline fixture extraction checks only annotation consistency. They are never supplied to classification inference. Classification and candidate recognition have separate requests, dispatch records and outputs.

`harness/domain/followup-reports.mjs` takes plans, raw evidence and verified comparison cases as values, checks their identities, and returns reports through the shared Result type. It performs no I/O or presentation work. The reporting script loads evidence and the verified Jev completion projection, while `harness/site-followups.mjs` produces display rows. Missing observations stay missing; no layer converts reason flags, recovery answers, or another model's result into a repaired classifier answer.
