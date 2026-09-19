# Jev architecture article: evidence and evaluation implications

Reviewed 2026-09-17. Source: Archer Hume, [“Jev’s Architecture Unmasked”](https://archerhume.com/posts/jevs-architecture-unmasked/?v=3), dated 2026-09-17. This is a bounded literature review, not an independent replication. No inference calls, benchmark changes, or architecture-dependent scoring changes were made.

## What is established, and what remains inferred

| Claim | Evidence status |
|---|---|
| Jev returns typed probabilities in parallel rather than generating their textual representation token by token. | Explicit [TypeSafe product description](https://typesafe.ai/blog/introducing-system-one-models-and-jev). This verifies the published claim, not an inspection of the private implementation. |
| Question IDs are output-mapping keys, not inference inputs. | Explicit [API contract](https://docs.typesafe.ai/api). Instructions must contain the actual question semantics. |
| Choice `confidence` is distinct from the leading answer probability. | Verified in the [official adapter at revision fb52b103](https://github.com/typesafe-ai/system-one-adapter-python/blob/fb52b1030b7fc1f4f1cf39910afa5da54f9835e3/src/system_one_adapter/_utils/confidence_metrics.py): after normalization, `(max(p) - 1/K) / (1 - 1/K)` for `K > 1`. Score uses another concentration formula. Adapter code does not independently disclose Jev's private training or server implementation. |
| Questions are behaviorally isolated; choice order and choice-set composition can affect probabilities. | Article-reported interventions on `jev-1.13.0`, with linked requests/responses. Not independently rerun or comprehensively audited here. |
| Shared KV cache, causal decoder, final-position or pointer readout, sparse MoE backbone, exact RLCD objective. | Architectural explanations, not established internals. The author explicitly leaves alternatives open; MoE is particularly speculative. Latency cannot identify hardware or parameter count. |

The article's server timing uses an upstream response header with unknown queueing boundaries. Its experiments share items, conditions, and one account/region; total API calls are not independent samples. Its calibration results do not establish calibration for our security contexts. A typed output can still be semantically wrong. The reported failure of tested fake-option strings to alter option boundaries does not prove that arbitrary text cannot affect the legitimate answers.

## Consequences for our work

**No immediate change to frozen pilot results, gold, or the approved rich template is warranted.** The article supports evaluation precautions already relevant to the project; it does not explain our Morse/acrostic misses or prove that decoding/composition is impossible for Jev.

1. Keep each primitive self-contained using the shared authenticated state. A final decision cannot consume sibling answers in the same request. Evaluate a composed decision as a separately specified arm with explicit second-stage inputs or one complete joint question, preserving the independent-question arm.
2. Keep option order and option membership frozen. Future matched sensitivity checks should compare the same semantic task under preregistered permutations and distractor changes; report both improvements and regressions. Do not select the best ordering after observing outcomes.
3. Evaluate probability calibration on sufficiently populated held-out workflow labels. Keep native `confidence`, Choice probabilities, Noul values, missing responses, and policy thresholds separate; do not retrofit thresholds to this pilot.
4. Preserve request batching as a future efficiency experiment, with question-isolation checks and unchanged semantics. Report client wall latency and any server timing separately. Never label serialized `output_tokens / latency` as neural decoding throughput.
5. Keep the proposed decoding-versus-boundary diagnostic first in the research queue. The article adds motivation for placement/composition controls, not a reason to broaden or rerun the campaign now.

These are backlog implications only. This note does not authorize spending, implement new experiments, amend the shared backlog, or merge the article's data with our measured results.
