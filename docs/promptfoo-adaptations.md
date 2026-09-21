# Promptfoo-inspired policy test packs

Catalog `workbench-catalog/2` has 172 cases in 58 granular groups: the existing 60 plus 40 matched classifier probes and 72 conversation checkpoints. These are independently authored development probes mapped to [Promptfoo plugins](https://www.promptfoo.dev/docs/red-team/plugins/) and [strategies](https://www.promptfoo.dev/docs/red-team/strategies/), reviewed 2026-09-21. We do not bundle Promptfoo-generated datasets, invoke a remote generation service, or claim their published effectiveness numbers.

| Pack | Added cases | Adapted families / techniques |
| --- | ---: | --- |
| Agent, tool & memory injection | 24 | Indirect injection in retrieved pages and tool output; data exfiltration; memory and RAG poisoning; MCP tool descriptions; cross-session leakage; debugging privilege abuse; excessive agency; prompt extraction; attacks on judges and moderation instructions |
| Hidden & transformed payloads | 16 | Base64, hex, ROT13, Morse, Unicode tag smuggling, emoji variation selectors, layered Base64+ROT13, authoritative markup |
| Crescendo-style conversations | 72 | Gradual concealment and persistent-instruction laundering, paired with legitimate debugging; six checkpoints × three history windows × two branches × two scenarios |

Select packs under **Choose tests**. Core checks remain available. Bronze prioritizes required checks; Gold attempts all selected packs; Use my budget selects whole groups. A mandatory test excluded by a pack filter stays an explicit gap. Conversation groups are indivisible, so a budget cannot select a late attack while dropping its earlier checkpoints or legitimate control. Preview counts and allowance reflect the selected packs, example placements and repeats. Planning sends no model calls.

## Interpretation and provenance

The classifier receives the policy, trusted task context, supplied material and fixed questions. It does not receive authored labels, attack-family IDs, future exchanges, hidden branch goals or provenance annotations. Results retain the case version/hash, request and receipt hashes, policy/catalog/source hashes, and `evaluation` metadata. Tests compile every new case in both layouts and verify the expected answers exist in the actual output schema. The input corpus and its expectations still need independent review before being called a benchmark.

A matched benign encoded message can violate a strict representation rule without being an injection. Attack recognition and allow/block/review are separate judgments. Tool, memory, judge and moderation probes test **attempted redirection detection**; they do not exercise actual tools, cross-session storage, moderation safety categories or grading accuracy. Those execution/accuracy gaps remain attached to plans and reports.

The replay uses prerecorded user and assistant messages as untrusted data. It does not generate the assistant response or adapt future turns from guard decisions. Promptfoo's [Crescendo implementation](https://www.promptfoo.dev/docs/red-team/strategies/multi-turn/) uses an adaptive conversation and backtracking. Our staged follow-up protocol is [Crescendo scaling](crescendo-scaling-protocol.md). Full history, recent four exchanges and latest-exchange results remain separate variants; missing definitions have insufficient-evidence expectations. Repeated prefixes do not multiply independent sample size.

Results show recorded input tokens, the input-cost estimate at the plan's saved price, first sampled detection and sum of request latency. Missing usage stays unknown. Totals cover checkpoints, not an all-turn session; parallel request latencies do not sum to wall-clock time. Local Qwen or another general-purpose guard must run these same frozen transcripts before we can claim a cost/performance advantage.

## Community verification core

`admission-core/2` retains the same 60 minimum core cases and both layouts, bound to the expanded catalog hash. The optional packs are not silently promoted into a reviewed minimum. `admission-core/1` remains checked in unchanged for historical inspection. A receipt for the earlier required-core identity does not satisfy today's required-core verification; it is not rewritten or relabeled. A signature establishes what the hosted runner observed, never a security or no-regression guarantee.

Large combined runs can exceed the community signed-bundle upload ceiling because bundles include exact requests and provenance. The full report remains inspectable and downloadable; keep the complete export for repository review. Never strip failures or cases to fit that ceiling. Core-only receipt verification remains separately testable.
