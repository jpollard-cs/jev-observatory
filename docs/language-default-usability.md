# Language setup usability check

Six real Jev 1.13.0 setup requests on 2026-09-20 exercised the browser workspace and its local hosted-service preview. These are targeted usability observations, not an accuracy benchmark or general language-support claim. No customer data was used.

The intended behavior is to retain the exact current input-language rule when none is specified, disclose the default, and offer owner-reviewed Keep/English/Any/custom choices. A fresh policy starts with English. All changes remain unapplied until reviewed.

| Scenario | Language answer (confidence) | Scope answer (confidence) | Known USD |
|---|---|---|---:|
| Generic code review, English default | not_specified (1) | natural_language_content (0.63) | 0.000312102 |
| Explicit Spanish-only inputs, current Any | spanish (0.99) | natural_language_content (0.51) | 0.000312522 |
| Generic code review, existing Spanish | not_specified (0.99) | natural_language_content (0.55) | 0.000312270 |
| Spanish replies only, before clarification | not_specified (0.71) | controlling_instructions (0.26) | 0.000313152 |
| Same Spanish-replies-only fixture, after clarification | output_language_only (0.84) | output_language_only (0.91) | 0.000319536 |
| Generic code review, final prompt, existing Spanish | not_specified (0.99) | natural_language_content (0.38) | 0.000318654 |

Total known usage: **$0.001888236**, no unresolved holds, within a $0.03 usability cap. Confidence is the provider-reported distribution value, not calibrated correctness.

The fourth request exposed output/input confusion: output-only Spanish instructions produced an uncertain controlling-input-scope proposal. It was not applied. Adding an explicit output_language_only option to both questions corrected this particular fixture on request five. If paired answers disagree about output-only scope, the application now retains both input-language settings and flags the reply requirement separately. The compiler does not implement generated-output language enforcement.

Generic-template scope answers did not reliably choose not_specified; they matched the current natural_language_content scope and produced no scope edit. That is preserved as a model limitation, not counted as correct inference of an unspecified scope.

Browser checks covered successful Spanish-only application without English, retention of Spanish with a generic description, explicit Any-language application, reuse of the session key, and 390px mobile layout. A presentation bug found while applying Keep was fixed with a regression check so reply-language warnings persist even if the applied policy is unchanged. No extra live call was needed for that presentation-only fix.

Regression checks also cover stale reports, changing selections during application, owner/model choice conflicts, supported target language lists, contradictory output/input answers, low-confidence defaults, raw report preservation, undo, and applying unrelated proposals.

## Exact request identities

- Generic code review, English default: `ed2f4940fcd293f63dc6b999089b1e86bef98663615d82d656d8646de14e024b`
- Explicit Spanish-only inputs, current Any: `41a8679dc88150f3c90a37e10730e38e75de9b27b31b3375a4390225dbdf2633`
- Generic code review, existing Spanish: `e97b98a4fa0d03f39fa4878f17a288d5dd3ce5900ae0322b125196bebb04accf`
- Spanish replies only, before clarification: `24ec32ba52d5625049c4ab81245e9dd4fadd90b541f72527d455ef8c08dcfd20`
- Same Spanish-replies-only fixture, after clarification: `b9f18bccd61c2ee83cf46c0875411a6855426704bcf387b0eb2ceb4c8c9b52c0`
- Generic code review, final prompt, existing Spanish: `136c028e0137906577fe68e238c7b4c1ebb9e93f6eea64c58320b6a7fc15bed1`

The six immutable request/response records remain in the ignored local preview evidence store; no credentials are included in this document or source control. The temporary testing key was disconnected and the QA tab closed after the last request.
