# Hosted transport failure — 2026-09-19

The hosted provider adapter used `redirect: 'error'`. Cloudflare workerd rejects this option while constructing a request, before network dispatch. Node accepts it, and our mocked Node tests did not expose this runtime difference. A production setup-advisor request stopped with the overly broad `transport_or_invalid_response` code. The recorded invocation took 667 ms; it was not a 60-second timeout.

The failure was reproduced with the actual official `workerd@1.20260919.1` runtime. Its [request implementation](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/http.c%2B%2B#L447) explicitly rejects this option. The corrected adapter uses `manual` and rejects every 3xx response without following it, retaining the credential boundary. No actual Jev request or key was used for verification.

The adapter now records fixed failure codes, transport stage, HTTP status when available and response byte count. Raw exception messages and failed provider bodies are never recorded. HTTP, JSON, stream, timeout, size and credential-echo failures remain unscored, with unknown billing held rather than fabricated as zero.

Failed advisor reports previously exposed an “Inspect in workspace” action which called the advice-import validator. Its refusal was correct, but it prevented inspection. These reports now have a read-only evidence view; only usable advice offers the separate review-suggestions action. The import guard remains intact.

Validation: 31 community tests passed, including an actual workerd test whose outbound requests all terminate at an isolated fake service (no internet service). The runtime regression failed against the old adapter and passed after correction. Browser QA exercised a simulated malformed response through setup, run, failure display and evidence inspection without applying suggestions. This is runtime/transport validation, not a claim of a successful live Jev execution.

Existing records are unchanged. The original generic error cannot retrospectively provide the exception or response details it discarded. The local held reservation remains until explicitly reconciled; this fix does not clear balances, retry requests or turn failed advice into a successful model observation.
