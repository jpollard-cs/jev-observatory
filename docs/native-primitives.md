# Native primitive request versions

The new default, `advanced-v3`, follows TypeSafe's [advanced structure guidance](https://docs.typesafe.ai/primitives/advanced). Question instructions retain policy and authorized context as JSON objects. Choice option descriptions, Noul true/false criteria, and Score level descriptions also use structured entries. Supporting JSON is not interpolated into prose.

```js
buildTypeSafeRequest(caseItem, 'jev-latest', { version: 'advanced-v3' });
```

For reproducibility, `legacy-v1` and `legacy-v2` select the original string-instruction request representation. They produce identical request bytes; their historical difference was response validation behavior. The original v1 rounding failures remain historical evidence and are not recreated by deliberately reintroducing the validator bug. Twelve pre-refactor request hashes and the full legacy request-cost fingerprint guard compatibility.

```js
buildTypeSafeRequest(caseItem, 'jev-latest', { version: 'legacy-v2' });
```

`JEV_REQUEST_VERSION` selects the native protocol in new endpoint runs. The default is `advanced-v3`. Explicit version options should be supplied when reproducing a frozen panel or calculating historical request costs. New protocol costs and results must be identified separately. Existing raw requests, reports and control packets are never rewritten by these builders.

The [primitive contract](https://docs.typesafe.ai/primitives) is preserved: every question sees the same state and is independent. Each instruction contains its complete question; routing IDs are not treated as model-visible meaning. The design uses small Choice option sets with abstention/review, one-axis Score rubrics with four distinct self-contained descriptions, and Noul probabilities without an invented confidence field. There is no multi-call taxonomy walk, conditional model chain, or response-fed follow-up in the model-only baseline.

Score values remain positions along the supplied rubric. Noul values remain probabilities of yes. Choice/Score confidence remains distribution concentration. Post-response thresholding and policy reason-code projection are reported explicitly rather than presented as generated reasoning.

The pure contextual-debugging builder is `buildDebuggingNativeRequest({fixture, model, version})` in `harness/domain/debugging-questions.mjs`. It returns the shared tagged Result. Its state contains exactly policy, trusted context and assessed material; gold decisions and pair annotations remain outside inference. The same explicit legacy version can reproduce the prior debugging question representation.

No live request has been made to validate `advanced-v3` during this refactor. Structured Score legend serialization is therefore recorded as a diagnostic instead of assuming the provider echoes an object exactly. Native type/domain checks remain enforced.

## Pattern boundaries

TypeSafe's [speculative fan-out](https://docs.typesafe.ai/patterns/fan-out) sends independent questions together; each answer remains a separate judgment. A reason Noul is not evidence supplied to the disposition Choice, and calling both in one request does not enforce logical consistency between them. The baseline measures both outputs unchanged. A contradiction is first a request-specification and model-output investigation, not proof of downstream compromise.

[Confidence-gated routing](https://docs.typesafe.ai/patterns/confidence-routing) and [composite scoring](https://docs.typesafe.ai/patterns/composite-scoring) place explicit decisions in application code. They are useful future supported-system arms, but cannot silently become model-only behavior. Any such arm must declare thresholds, precedence, weights and abstention handling before evaluation, fit them on separate calibration scenarios, and retain the original independent outputs. Sample documentation thresholds are examples, not calibration evidence for this task.

The expiry diagnostic isolates lossless EntryType wrapping, an explicitly clarified decision rubric, and all-question versus decision-only packaging. It is a post-observation case-bound sensitivity study, separate from both the frozen pilot and the new general `advanced-v3` protocol.
