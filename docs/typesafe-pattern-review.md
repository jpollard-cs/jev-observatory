# Pattern questions to resolve before the next experiment

Checked 2026-09-17. This is a documentation/design note, not a new benchmark. The completed rich pilot remains unchanged.

The pilot sends seven independent questions in one request with shared state. It uses native Choice selections and a predeclared Noul threshold for measurement, but does not combine them into a final application verdict. The reported Choice/Noul disagreement is therefore an observation, not an adapter repair opportunity.

TypeSafe's [composite-scoring pattern](https://docs.typesafe.ai/patterns/composite-scoring) combines normalized dimensions using application-owned weights. Its [fan-out pattern](https://docs.typesafe.ai/patterns/fan-out) batches potentially relevant questions and selects which outputs matter afterward. These are different operations. For this project, any composed policy decision should be a separately reported system-assisted arm. Hard prohibitions and audit requirements need explicit precedence; a weighted average should not silently turn a prohibition into permission. Detection, observed poisoning, requested interference and permission to inspect are different propositions, not interchangeable estimates of one probability.

## Batching arithmetic

Ignoring per-call overhead and discounts, let S be shared-state tokens and Q be the total tokens for all N questions. Separate calls cost proportionally N×S + Q; a batch costs S + Q. The saving factor is (N×S + Q)/(S + Q). Large shared state and small questions move the factor toward N; large questions reduce it. For a purely illustrative S=10,000 tokens and 13 questions of 100 tokens each, the ratio is 131,300/11,300 ≈ 11.62. This is arithmetic, not a measured Jev result.

The [cookbook](https://docs.typesafe.ai/cookbooks/parallel_questions) uses a roughly 54,000-character shared document. At this read its displayed example is 12.2× cheaper and 10.0× faster, whereas the [Primitives overview](https://docs.typesafe.ai/primitives) says 11.5× and 9.6×. The speed comparison sums sequential single-call latencies; the cookbook explicitly says concurrency reduces that gap. These conditions make a large gain plausible. The differing headline figures need reconciliation and should not be treated as universal performance guarantees.

The cookbook measures five repetitions and reduces each Choice to its maximum probability. An independent audit should compare the selected label and complete distribution too: equal maximum probabilities alone cannot prove identical labels. Check behavior over state/question sizes and repetitions before accepting broad answer-equivalence claims. No such paid audit was run here.

Tracked work: [PAT-001, PERF-001 and LOCAL-001](backlog.md). The local-model item remains deferred pending exact checkpoint and memory feasibility verification.
