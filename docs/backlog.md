# Research backlog

## WORKBENCH-001 — Description-driven authoring and adaptive selection

The rebuilt 0.5 workbench is integrated; see [current capabilities and rationale](workbench-integration.md). Text descriptions already support reviewed policy suggestions and Jev-assisted selection from the 60-case catalog. Current edits invalidate stale advice; refresh is explicit. Track continuous adaptive authoring as a separate improvement, with visible suggested changes, reuse of matching cached advice, and an explicitly enabled spending allowance for model refresh. Do not silently run paid requests on every edit. Generating new cases/gold and ranking the full original replay catalog are separate coverage/generation work, not existing capabilities. Keep authored and generated discovery cases out of a claimed untouched holdout.

## PROMPT-001 — Compact guide, cascades and evidence localization

Requested 2026-09-17; **compact prompt and ungated two-pass design drafted for user review; no calls scheduled**. See the [reviewable prompt, experiment and offline sizing](compact-two-pass-proposal.md). Preserve the current full guide as the frozen reference. The proposed known-case development comparison precedes any independent held-out evaluation. Compare input tokens, misses and false alarms; do not select wording on the evaluation set.

Start with a second assessment on every case with valid first-pass output, plus a second-call control without prior answers. Gating is a later efficiency experiment: confident first-pass misses must not be hidden. Deterministic policy composition remains a separately named future arm. Preserve raw answers, routing misses and total latency/cost; a weighted average must not cancel a decisive prohibition. See PAT-001 and [TypeSafe composite scoring](https://docs.typesafe.ai/patterns/composite-scoring).

Verify evidence-location capabilities independently. Current native outputs are Choice/Noul/Score, not an established arbitrary-span extraction API. Candidate record/span IDs could be supplied as Choice options or assessed with individual Nouls, but candidate generation, overlapping windows and offsets become disclosed system assistance. Measure evidence recall, exact/overlap span accuracy, cross-resource references, Unicode offset units and redaction leakage/over-redaction. Detection-only fallback can flag residual PII/secrets for review; a detection score alone does not identify what to redact. No automatic redaction implementation or localization claim yet.

## PAT-001 — Raw judgments versus composed decisions

Status: **tracked for design review before the next live plan**. Requested 2026-09-17. The rich pilot already batches seven independent questions, preserves every output, and does not replace raw judgments with a composite verdict.

Review [composite scoring](https://docs.typesafe.ai/patterns/composite-scoring) and [speculative fan-out](https://docs.typesafe.ai/patterns/fan-out). Add a separately named application-composed arm if appropriate, alongside the model-only arm. Define atomic policy predicates, conditional relevance, unknown handling, and precedence before observing evaluation results. Weighted ranking and safety permission are different tasks: an audit score or several permissive signals must not cancel an established prohibition. Do not average overlapping Choice/Noul outputs into an allegedly calibrated probability.

Freeze thresholds and composition on separate development/calibration cases; evaluate on held-out lineages. Preserve the existing disagreements, including acrostic Choice/Noul divergence, and report any system assistance explicitly. No new calls are scheduled for this item.

## PERF-001 — Audit batching cost, speed and answer-equivalence claims

Status: **backlog; documentation checked, empirical audit not run**. Requested 2026-09-17. Source: [parallel questions cookbook](https://docs.typesafe.ai/cookbooks/parallel_questions). See [initial pattern notes](typesafe-pattern-review.md).

Compare one batched request with separate sequential and concurrent calls using identical state, questions, model version, warm/cold conditions and disclosed cache settings. Vary shared-state size and question overhead; retain provider tokens, full answer labels/distributions, wall time, concurrency, errors and all repetitions. Check the differing headline figures between the Primitives overview and cookbook, and distinguish an example's findings from universal independence/equivalence claims. Do not infer dishonesty from an unverified discrepancy.

## LOCAL-001 — Quantized local Qwen control on the user's Mac

Status: **setup and frozen comparison complete — 48/48 valid local responses**. Requested 2026-09-17. The MacBook Pro M4 Max has 128 GiB RAM. The selected conversion is `unsloth/Qwen3.8-Flash-Next-GGUF`, revision `38bb39ee97821de2c9009abb7e93950eec396e66`, quantization `UD-Q3_K_XL`: three files totaling 89,986,353,824 bytes. The runtime is official llama.cpp build `b10964`, commit `b29c606e28a01b1bc8c1351026a0fa6e616bf6c4`. See [Unsloth setup and provenance](local-unsloth-setup.md) and [machine-readable pins](../data/local-unsloth-setup.json).

The superseded Vontra mixed-oQ3 MLX conversion was never loaded. Its 92.5 GB of weights and unused download caches were removed; [historical metadata and runtime notes](local-qwen-setup.md) are retained. The obsolete MLX Python environment was removed after transfer and verification. Ollama and global packages remain unchanged.

The loopback-only launcher pins 32,768 context tokens, one slot, thinking off, no MTP, no automatic context shifting and no warmup. Metadata inspection preserves all PLE tables. All three file hashes verified, and both bounded setup checks passed on one request each: 39 input tokens (0.896 seconds) and 28,019 neutral input tokens (223.465 seconds), with valid expected JSON and no cached tokens. The subsequent [comparison is complete](qwen-baseline-findings.md), and the server is stopped. These checks are separate from classification accuracy; the repeated neutral long input does not establish diverse/adversarial-context performance. Record actual memory and prompt timing; active MoE parameter count alone does not establish fit or speed.

The full local baseline evaluation is separate from setup. Follow the [protocol draft](local-baseline-protocol-draft.md): preserve the complete guide, material, trusted facts and authored gold; disclose generated JSON and joint outputs versus native TypeSafe primitives; freeze tokenizer, quantization, runtime and schema; retain errors and unsupported lengths. Compare hard decisions first and report local/API timing conditions separately. Luna/Terra judge controls remain a distinct experiment.

## CU-001 — Computer-use evaluation

Status: **backlog / not scheduled**. Requested 2026-09-16. No implementation, model calls, or budget allocation is authorized by this item alone.

Question: Can Jev make computer-use decisions more efficiently while preserving task success, authorized behavior, and recovery quality? Greater efficiency is a hypothesis to measure, not an established result.

Before starting, verify supported observation/input types and action-output contracts against current documentation. Separate selecting from supplied candidate actions from end-to-end computer use; record who generates candidates and whether the correct action is available. Do not infer screenshot or visual-grounding capability from text classification results.

Proposed scope:

- Compare Jev and controls on the same sandboxed tasks, observations, action opportunities, executor, and stopping rules. Record every additional planner, OCR/parser, candidate generator, or model call as part of the system being measured. Keep Codex subagent and direct API comparisons separate.
- Measure task completion, incorrect/unauthorized actions, recovery after errors, action/model-call counts, latency distributions, and total cost per successful task. Include failed attempts, retries, observation processing, and orchestration overhead; distinguish model latency from end-to-end time.
- Pair clean tasks with prompt injection in UI text, documents, tool results, and previous actions/messages. Evaluate rendered visual or hidden-layer attacks only when the actual observation path supports them. Include legitimate debugging and policy-context counterfactuals.
- Vary task horizon and observation/history length. Preserve independent task lineages, reviewed success criteria, raw action traces, and per-task denominators. Freeze the comparison before measuring it.
- Keep the model-only decision arm separate from any explicitly supported routing/enforcement arm. Shared sandbox permissions and executor constraints must be identical and disclosed across systems.

Next step when prioritized: propose a small capability check and pilot, with controls and a cost cap, before any broader run. Reuse the Observatory's evidence ledger and uncertainty conventions; publish no efficiency claim without a matched quality comparison.
