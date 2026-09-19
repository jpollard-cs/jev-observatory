# Browser workspace restoration

The hosted root is the full policy workbench again. Community evidence sharing is an additional area at `/community`; the original research publication remains at `/observatory`, including old `/?tab=...` links.

Available without a local server or API key:

- Describe an application, choose a starter, compose rules and preview the exact Jev request.
- Adapt coverage to the chosen policy and application using the existing deterministic allocator; preserve mandatory groups, matched controls, limits and explicit gaps.
- Prepare optional Jev setup/ranking/tagging requests; import source-matched advice, review proposed changes and undo them.
- Preview the original 15,184 historical definitions under their original contracts.
- Explore selected test requests in a clickable coverage atlas. They remain **not run**, with no fabricated outcomes.
- Browse all six frozen experiments, their actual outcome atlas, condition comparisons, confusion matrices, latency charts and exact row evidence.
- Import/export policies and reports. Save a plan in the current session and download its exact requests, evaluation-only expectations and pinned source as a portable ZIP.

Paid hosted execution remains unfinished. The browser does not collect a Jev key or call a provider. The local workbench still supports explicitly approved setup/advisor calls and the existing evaluation runner. Downloaded plans are checked by the same local loader; preparing, viewing or exporting never spends credits. This boundary is visible in the workspace, not hidden behind a nonfunctional credential form. Contributor-funded, signed regression receipts remain a separate planned backend.

## Implementation boundaries

`community-site/scripts/workspace/build.mjs` packages the existing `workbench/` source, reviewed fixtures and reports. The policy compiler, planner, source hashes, oracle and report normalizer are shared, not rewritten for the browser. A dedicated browser worker performs computation off the UI thread. Small crypto, byte, path and read-only file adapters replace Node-specific capabilities. The legacy corpus hash includes `splitFor.toString()`; the build explicitly preserves that original source string so bundling/minification cannot change historical protocol identity.

Static report data loads on demand and is checked against its original SHA-256. Archived request bytes are checked before looking up a request. Uploads and provider errors are not executable code. Local draft values remain device-local browser state; imported reports, advice and prepared request bundles are held in tab memory until export. Community publication is a separate explicit action. Browser storage encryption is not represented as a defense against already executing same-origin JavaScript.

Every template HTML sink in the hosted workbench build is routed through DOMPurify, including in browsers without Trusted Types. CSP restricts scripts, connections and workers to this origin; a named Trusted Types policy accepts only the fixed workspace worker URL. Sanitization permits the reviewed SVG charts but excludes active SVG elements, embedded documents and source-driven remote media. The community UI continues to use text nodes. Existing research HTML receives script nonces only after its full pinned artifact hash matches.

## Validation (2026-09-19)

The compiled-browser tests compare all three policy contracts and both example placements with native compiler requests/receipts; compare a selected plan and original family sweep byte identities; export and load an executable frozen plan; and compare all six normalized historical reports with native reconstruction. Community/API security tests cover cross-origin writes, ownership, quotas, tampered hashes, active payload strings, nonce integrity and download headers.

Manual local browser checks exercised description → rules → coverage → exact test inspection → plan review, switched historical runs, and verified the atlas canvas and SVG charts. Changing a recorded experiment keeps its selector bound to the currently displayed data until the new report is loaded. No model inference was performed for these checks.

## Hosted execution and introduction (2026-09-19)

The root route now introduces the experiment in three steps; the complete workspace remains at `/workspace`. The browser planner and coverage/evidence views are preserved. The five-step workflow is always visible; advanced navigation and Terminal commands use progressive disclosure.

Hosted paid execution is now available after a separate request-and-budget review. See [hosted execution](hosted-execution.md) for credential handling, private persistence, accounting and limits. Earlier notes above about hosted execution being unavailable describe the preceding release.
