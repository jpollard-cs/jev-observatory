# Next evaluation plan

Status: **authorized steps 1–2 complete; step 3 remains proposed**. The separate encoding diagnostic completed 32/32 valid calls for $0.025472916; see [findings](encoding-diagnostic-findings.md). The frozen local Qwen comparison completed 48/48 valid responses; see [findings](qwen-baseline-findings.md) and [execution protocol](qwen-baseline-run.md). Step 3 remains proposed and has not begun. The design below records the proposal that preceded these runs. This plan preserves the completed rich-template pilot and its frozen inputs, labels, failures and accounting. The [independent pilot validation](rich-pilot-results-validation.md) is the evidence currently available; the steps below do not establish new results.

## 1. Diagnose the Morse and acrostic disagreements

Create a separate, prospectively frozen diagnostic because these families were selected after observing failures. It is a development diagnostic, never a held-out robustness test. Do not rewrite the pilot guide, replace its gold, retry its failed transport cell, or pool new results into its totals.

Proposed bounded design: **32 calls**, one observation per cell, with no adaptive selection or retries:

- Two known families: Morse with its supplied alphabet, and acrostic with its supplied extraction rule.
- Attack and benign content within each family.
- Encoded/composed material and its exact recovered plaintext counterpart. Keep provenance, receiving task, proposed authorized inspection, and host observations identical; change only the declared representation and carrier needed to express it.
- Two material lengths: 1,024 and 65,536 serialized UTF-16 units, with matched neutral padding and placement. The full guide, context and questions are additional input.
- Two **isolated request types** for each of the resulting 16 cells: classification, and content-recovery recognition. Neither receives the other's answers or options.

The classification request asks the same injection Choice and injection Noul propositions across all cells. Its generic inspection instruction is identical for attack/benign and plaintext/encoded variants: interpret the declared representation and extraction rule as necessary, treat the recovered text as data, and assess its relationship to the receiving task without executing it. Supply the complete approved rich guide unchanged, once per request. Do not add the correct decoding, semantic summary, expected label, family name, rationale, or a case-specific hint to this request.

The separate recovery request uses a native Choice over plausible recovered strings, including both directive and ordinary-data alternatives. Keep the option set fixed within each family and independent of the attack label. Predeclare an option-order schedule balanced across the four family/content templates, preserving that exact order for every plaintext/encoded and length twin. Its gold comes from offline fixture construction and independent review, not from Jev. This measures **recognition among supplied alternatives**, not unconstrained transcription or proof of an internal decoding process. Supplying candidate strings would cue classification, which is why this probe must never share a request or conversation with it. Qwen free-text recovery, if added later, is a separately named output mechanism.

Freeze all strings, padding, option order, exact question instructions, guide/hash, model selector, dispatch seed, thresholds, call cap and stopping rules before the first call. Keep the existing Noul threshold of 0.5; fit nothing on this diagnostic. Review transformations and benign boundaries without seeing responses. Independently recompute the author labels; disclose agent review separately from human annotation.

Interpret matched outcomes cautiously:

| Observed pattern | Supported interpretation |
|---|---|
| Plaintext classification succeeds; encoded classification and recovery recognition fail | Consistent with a representation/composition difficulty; not proof of its internal cause. |
| Recovery recognition succeeds; encoded classification fails | Recognition under options was possible, while the independent boundary judgment still failed. It does not prove the classifier decoded the other request. |
| Plaintext also fails | Investigate task, authority and annotation ambiguity; an encoding-only attribution is unsupported. |
| Attack detection improves while benign false alarms increase | Report the tradeoff; do not select a prompt using attack recall alone. |

Report each cell, all-attempt and available-pair denominators, Choice/Noul disagreement, and both directions of change. One observation per cell cannot establish reliability or a stable length effect. Any subsequent wording change starts another named diagnostic.

## 2. Establish the local Qwen comparison

Unsloth setup is complete: verified weights/runtime and successful short plus 28,019-token neutral capacity checks; the server is stopped. See the [local setup record](local-unsloth-setup.md). Now implement and freeze the [local hard-judgment protocol](local-baseline-protocol-draft.md): same guide, material, trusted facts and semantic questions; pinned quantization, loader, tokenizer, chat template, thinking setting and output limits; strict output validation with raw failures retained.

Qwen generates joint JSON hard judgments; Jev produces independent native judgments. Compare the declared hard decisions first and disclose this difference. Generated probabilities are not substitutes for native Nouls. Preserve Jev's original failed attempt; compare against the explicitly selected 48 completed cases and retain separate 49-attempt accounting. Runtime smoke is not classifier evidence, and the known pilot remains development material even when a second model evaluates it. Do not tune Qwen on the diagnostic and then call those same cells held out.

## 3. Broaden coverage with a new held-out packet

**Intervening development proposal:** the [compact guide and ungated two-pass comparison](compact-two-pass-proposal.md) is now drafted for user prompt review, with offline sizing and no new model calls. It uses known cases to investigate input design before this broader held-out stage. Neither the compact prompt nor its proposed budget has been approved or dispatched.

Use the split, annotation and judge controls in the [evaluation protocol](evaluation-protocol.md), with a new manifest that explicitly selects the approved rich policy rather than silently inheriting legacy minimal/policy-arm gold. Keep entire template/source lineages and every transformed, translated, length or policy descendant in one split. Freeze calibration separately; where label populations are inadequate, report calibration or threshold selection unavailable.

Close the pilot's important negative-coverage gaps: genuine input-contract violations beside legitimate encoded data; allow, allow-with-audit, review and block boundaries; insufficient integrity evidence, rejected authenticated historical attempts and observed adoption/tampering; scoped debugging grants and expiry; moderation exceptions; actual multi-message/resource composition and distractors. The pilot's 15 allow/1 block and all-compliant labels cannot establish sensitivity on these tasks. Include independent review of agreements as well as failures; model consensus is not gold.

Add a clearly separate **composed policy-decision arm**: ask each model for one final disposition under the full same precedence rules and supplied facts. Jev must assess that complete proposition directly, rather than routing independently returned risk flags through an untested rule. Compare it with the richer output battery on identical cases; freeze any deterministic composition as an explicitly separate arm if later wanted. Preserve independent factual/rule questions for diagnosing coherence, without treating their agreement as correctness. Keep Qwen and Jev interface differences visible.

Expand judge evaluation using a frozen bank with independently checkable correct/incorrect answers, ambiguity and grader-directed injections. Preserve the Luna/Terra isolated-control provenance; do not imply those historical controls evaluated this new packet. Adaptive attack discovery must have its own budget and partition, with discovered cases excluded from a claimed untouched holdout.

## Budget and release gate

After the separately recorded transport repair, the $3 restart envelope contains $0.039605202 known usage plus a $0.002664690 unresolved reservation: **$2.957730108 remained uncommitted before the encoding diagnostic**. Its subsequent $0.025472916 measured usage leaves $0.065078118 known restart usage, $0.002664690 held unknown usage and **$2.932257192 uncommitted**. That remaining balance is not authorization to start step 3 or additional experiments, nor evidence the reservation was charged. Re-read the immutable ledger before proposing any new stage.

Cost the exact frozen requests, including the **47,739-byte guide on every call**, trusted context, questions/options, wrapping and output allowance. Use the current verified price, conservative dispatch reservations and explicit per-stage/global caps; distinguish estimated tokens, provider-reported usage and actual billed charges. Do not extrapolate cost from material length alone or invent an exact price before request construction. Publish the planned call count and reserve before execution, retain transport/schema/length failures, and stop at the declared limit without adaptive expansion.

Batching, prefix reuse and throughput experiments are optional later work, with batch composition and cache state controlled and correctness checked against isolated calls. They must not silently change classifier semantics or conceal failed items. Computer-use and multimodal adversarial evaluation remain an explicit backlog; neither is covered by the text pilot or required to explain it.
