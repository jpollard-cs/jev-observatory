# Source basis and verification

## Local sources

- Supplied `jev-workspace-20260918-090952.tgz`, especially the original rich-pilot builder, fixtures, transport, native-answer validator, lock and append-only budget ledger. Exact dependency hashes are in `assets/project-bindings.json`.
- Previously supplied `policy-payload-compiler.zip`, retained under `vendor/compiler`.
- Previously supplied `jev-boundary-lab-v2.zip`: exact richer-boundary restoration blocks and selected encoded source specimens. These source specimens are reused under explicitly NEW consumer contracts/contexts, with newly reviewed expectation matrices. Old labels/results are not overwritten.
- Completed `boundary-fewshot-v2` report: 928 valid calls; known shared spending 1.273317318 USD and held amount 0.002664690 USD. This supplied report motivates the minimum prior-charge floor, NOT a live-account claim. The CLI always reads the actual local shared ledger.

## TypeSafe primary documentation, checked 2026-09-18

- https://docs.typesafe.ai/api — native endpoint, state/questions, response identity and reported token usage.
- https://docs.typesafe.ai/primitives/advanced — structured instructions and criterion descriptions, including definition/examples. No undocumented special-processing guarantee is assumed for a field called examples.
- https://docs.typesafe.ai/concepts/state — questions see the same state and are evaluated independently. Separate entry requests avoid submitting unrelated sibling material; this is not a claim that prompt paths isolate shared state.
- https://docs.typesafe.ai/models — documented model jev-1.13.0, input list price 0.042 USD/Mtoken, 64k per-request context and 32k state-plus-longest-question context. The run retains the original alias for unchanged controls and validates the returned version. It stops on a different model or configured price rather than silently accepting a changed comparison.

The consumer policy itself is a newly authored experimental implementation of the approved proposal. The documentation supports the API use, not proof that the new policy/renderer performs correctly. Mock transport tests establish software behavior only.
