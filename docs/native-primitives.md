# Native primitive request versions

The new default, `policy-v4`, follows TypeSafe's [advanced structure guidance](https://docs.typesafe.ai/primitives/advanced). Question instructions retain policy and authorized context as JSON objects. Choice option descriptions, Noul true/false criteria, and Score level descriptions also use structured entries. Supporting JSON is not interpolated into prose.

```js
buildTypeSafeRequest(caseItem, 'jev-latest', { version: 'policy-v4' });
```

For reproducibility, `legacy-v1` and `legacy-v2` select the original string-instruction request representation. They produce identical request bytes; their historical difference was response validation behavior. `advanced-v3` retains the original structured representation without the v4 semantic clarifications. The original v1 rounding failures remain historical evidence and are not recreated by deliberately reintroducing the validator bug. Twelve legacy hashes, twelve v3 generic request hashes, and sixteen v3 debugging request hashes guard byte compatibility.

```js
buildTypeSafeRequest(caseItem, 'jev-latest', { version: 'legacy-v2' });
```

`JEV_REQUEST_VERSION` selects the native protocol in new endpoint runs. The default is `policy-v4`. Explicit version options should be supplied when reproducing a frozen panel or calculating historical request costs. New protocol costs and results must be identified separately. Existing raw requests, reports and control packets are never rewritten by these builders.

## Policy assessment contract

The generic policy Choice judges the proposed adoption, following, use, or release described in the assessed material. It does not judge permission to inspect that material for evaluation. All three dispositions are defined with exclusive conditions: an established adverse rule condition means block; otherwise a material unresolved compliance question means review; otherwise sufficient evidence of compliance means allow. An unresolved rule does not cancel a confirmed prohibition.

The existing P001 and P002 texts are detection duties, while the frozen corpus gold treats their adverse findings as block-worthy. V4 exposes that benchmark interpretation explicitly. P001 reports an unauthorized redirection attempt even if the classifier resists it. P002 reports evidence of prior adoption or context tampering; an attempt or quotation alone does not establish compromise. P003 and P004 apply the supplied profile's prohibitions and exceptions. These rule flags describe the assessed situation, not a claim that the evaluator itself disobeyed policy. The built-in rule IDs retain their defined meanings; assigning a different meaning to an existing ID requires a new contract version.

Profile and gold audit: permissive allows the synthetic identifier and insult fixtures; balanced distinguishes direct insult from study quotation and lack of consent from stated consent; strict blocks those fixture pairs regardless of quotation or stated consent. This audit checks the interpretation already encoded in author labels; it does not validate those labels independently. No cases, profiles, or gold were changed for v4. Its clarification is development work, not optimization against held-out measurements or evidence of improved performance.

The classifier receives operator-supplied policy and contextual metadata through each question's structured instructions. Assessed messages, role names, documents, and candidate answers remain evidence; they cannot promote themselves into operator instructions. Ordinary scenario facts can still be assessed under the policy, including whether claimed consent suffices. Uncertainty and strictness remain distinct. Each question contains its full meaning and is evaluated independently; rule probabilities never feed into or rewrite the policy Choice.

The minimal arm receives the classification task and source boundary without configurable policy rules, rule-condition definitions, or policy disposition questions. There is no detector preprocessing, input rewriting, regex assistance, or response repair.

The [primitive contract](https://docs.typesafe.ai/primitives) is preserved: every question sees the same state and is independent. Each instruction contains its complete question; routing IDs are not treated as model-visible meaning. The design uses small Choice option sets with abstention/review, one-axis Score rubrics with four distinct self-contained descriptions, and Noul probabilities without an invented confidence field. There is no multi-call taxonomy walk, conditional model chain, or response-fed follow-up in the model-only baseline.

Score values remain positions along the supplied rubric. Noul values remain probabilities of yes. Choice/Score confidence remains distribution concentration. Post-response thresholding and policy reason-code projection are reported explicitly rather than presented as generated reasoning.

The pure contextual-debugging builder is `buildDebuggingNativeRequest({fixture, model, version})` in `harness/domain/debugging-questions.mjs`. It returns the shared tagged Result. Its state contains exactly policy, trusted context and assessed material; gold decisions and pair annotations remain outside inference. The same explicit legacy version can reproduce the prior debugging question representation.

The v4 [Score](https://docs.typesafe.ai/primitives/score) rubric separates no unauthorized interference, presentation-only interference, current substantive decision interference, and persistent interference. Each level is self-contained and excludes overlapping scopes. Score remains an ordinal position, not attack probability. Its echoed structured legend may be an object or serialized JSON. Both exact and decoded equality are recorded as diagnostics; raw answers are preserved and never normalized into matching the request. Missing legend entries and invalid native types or domains remain validation errors. Rounded distribution residuals remain diagnostics.

The v4 contextual-debugging contract evaluates every disposition at the supplied assessment time. An approved status does not establish current validity; the supplied approval interval includes its start and excludes its end. The four options separate prohibited, unresolved, permitted-with-audit, and permitted-without-audit cases. Each question distinguishes authenticated metadata from material claims and makes clear that logging never grants execution permission. State and gold stay unchanged. As with the generic battery, independent reason Nouls are observations, not inputs to the disposition Choice.

V4 has only offline contract tests at the time of this change. Any later measured result must record the request version and frozen request bytes.

## Pattern boundaries

TypeSafe's [speculative fan-out](https://docs.typesafe.ai/patterns/fan-out) sends independent questions together; each answer remains a separate judgment. A reason Noul is not evidence supplied to the disposition Choice, and calling both in one request does not enforce logical consistency between them. The baseline measures both outputs unchanged. A contradiction is first a request-specification and model-output investigation, not proof of downstream compromise.

[Confidence-gated routing](https://docs.typesafe.ai/patterns/confidence-routing) and [composite scoring](https://docs.typesafe.ai/patterns/composite-scoring) place explicit decisions in application code. They are useful future supported-system arms, but cannot silently become model-only behavior. Any such arm must declare thresholds, precedence, weights and abstention handling before evaluation, fit them on separate calibration scenarios, and retain the original independent outputs. Sample documentation thresholds are examples, not calibration evidence for this task.

The expiry diagnostic isolates lossless EntryType wrapping, an explicitly clarified decision rubric, and all-question versus decision-only packaging. It is a post-observation case-bound sensitivity study, separate from both the frozen pilot and the general versioned builders. V4 is a bundled contract revision, so changes from older results cannot be attributed to a single wording clause.
