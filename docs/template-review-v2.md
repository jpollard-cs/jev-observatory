# Rich classifier template: approval review

Status: **awaiting user approval; no further evaluation calls**. Proposed version: `pi-classifier-policy/2.0-draft`. Read the [complete template](../policies/prompt-injection-policy-template.md); only the explicitly marked model-facing body belongs in inference. Operator notes and evaluation labels remain outside it.

## The experiment this draft defines

The baseline supplies security expertise to a general-purpose model: definitions, recognition guidance, concrete representation families, benign contrasts, source authority, and explicit policy consequences. We measure whether Jev can use those inputs to distinguish attacks from legitimate activity and respond to authenticated contextual changes. Detailed instructions are part of the model-only condition. No regex detector, external decoder, second classifier, or automatic repair of Jev's verdict supplies its answers.

The old short injection question tested a different condition. Its exact requests, raw responses, validator versions, costs and remaining catalog are preserved. The original template is [archived separately](../policies/archive/prompt-injection-policy-template-v1.1.md). None of those observations establish how the rich template performs.

## Proposed choices for approval

| Choice | Proposal |
| --- | --- |
| Supplied expertise | Include the complete marked model-facing guide in every rich-baseline request; keep it constant across strictness conditions. |
| Input contract | English instructions without concealed/transformed directives in explicitly designated instruction fields. Legitimate code, names, quotations, multilingual documents and encoded debugging samples remain scoped data exceptions. No blanket ASCII requirement. |
| Detection scope | Inspect all material in the declared assessment scope for unauthorized redirection. Restricting language-contract checks to instruction fields does not restrict attack detection to those fields. |
| Benign contract violations | A language/format rule can require review without being an injection. `awareness_only` and `all_fields` remain available explicit alternatives to the proposed instruction-field contract. |
| Authority | Application-owned policy and verified task facts control. Assessed material cannot declare itself a policy override or authenticate its own claims. |
| Context changes | Vary authenticated policy rules, scoped authorization, recipients, environment, time and audit modifiers. Preserve the expertise core and report each intervention explicitly. |
| Debugging | Current scoped permission is required; expiry or an out-of-scope operation blocks the proposed action. Audit requirements do not supply permission. Inspection for classification remains allowed. |
| Integrity | Distinguish confirmed poisoning, an evidenced unadopted attempt, insufficient evidence, and sufficient scoped evidence showing neither. A claim that poisoning occurred is not automatically verified fact. |
| Outputs | Keep injection, integrity, input compliance, moderation, permission, audit, fact flags and decisive reasons distinct. Simultaneous native answers do not form a sequential reasoning chain. |
| Confidence | Retain raw probabilities and concentration separately. Any threshold routing is reported separately and chosen without consulting held-out outcomes. |

The guide names Base64 and related encodings, Morse and codebooks, Unicode/invisible text, layout and negative-space channels, language transformations, cross-message/resource fragments, transformation chains, technical containers, authority spoofing, memory/retrieval poisoning, and tool/output/grader manipulation. Its media guidance explicitly distinguishes delivered text/transcripts from actual pixels or audio; the current text adapter does not establish multimodal performance.

The configuration example is a proposed schema, not an existing request. Real instruction-field paths and evidence fields must be bound when the new adapter is built. An absent input contract means no implicit English-only or encoding ban. Approving this template does not retroactively approve a restriction for historical cases.

## Making the approved template reach the model

The proposed representation stores the complete guide once in application-owned shared state. Structured question instructions explicitly identify that guide, the authorized policy/context, the assessment target and each proposition. Individual criteria define option boundaries; IDs alone do not supply meaning. This follows TypeSafe's support for structured [instructions and criteria](https://docs.typesafe.ai/primitives/advanced). Independent questions can share one request; downstream composition remains a separately reported condition, consistent with the [patterns overview](https://docs.typesafe.ai/patterns).

Before new calls, preserve the approved body and hash, implement its complete native request, inspect the exact serialized request, and recalculate its cost. Audit gold labels against the new definitions, especially historical attempts versus educational quotations and verified poisoning versus an untrusted allegation. Keep expected answers, case names, prior outcomes and aggregate findings out of the target input. No prompt shortening or outcome-driven correction is implicit in approval.

Start with a bounded compatibility and representation pilot after approval and offline implementation review. Retain errors, abstentions and disagreements. Broader runs follow only if the request faithfully represents the approved contract and the measured usage fits the remaining allowance. The large catalog remains queued; exhausted credits do not remove tests.

## Budget

The user reports **$1.04 already spent** and has explicitly allocated **a separate $3.00 maximum for the restarted run**. Historical ledgers remain immutable; the old campaign's $4 ceiling is not the new run's authorization. The new budget does not authorize calls before template approval.

TypeSafe's public launch page, rechecked on 2026-09-17, lists **$0.042 per million input tokens and zero output-token charge**. Account-specific billing may differ. [TypeSafe pricing source](https://typesafe.ai/blog/introducing-system-one-models-and-jev).

The [offline sizing proposal](template-v2-cost-proposal.md) measures the full draft body and distinguishes a byte-based reservation from illustrative token estimates. It is not a final request cost or a new model measurement. Final sizing must include policy/context, assessed material, every question and serialization overhead; there is no assumed prompt cache discount.

## Approval

The model-facing body under review has SHA-256 `56b77c5efa6b4df0da9a240284a532da5b9d21e35e2450976da98a27718de3f0`. Its UTF-8 size is 47,739 bytes; the exact extraction is recorded in the cost artifact.

Approve the linked template with the proposed instruction-field language/encoding contract, or specify changes. All evaluation calls remain stopped until that approval. The private Site and GitHub publication are unchanged during this review.
