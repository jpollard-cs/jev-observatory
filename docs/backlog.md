# Research backlog

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
