# Target-path architecture

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

Versioned request snapshots verify that the original 12 pilot request bodies can still be reproduced byte for byte. Additional tests verify structured EntryType requests, absence of annotation leakage, dependency injection, single-attempt HTTP behavior, safe error propagation and retained evidence. These are offline checks; the new protocol is unmeasured until explicitly evaluated.
