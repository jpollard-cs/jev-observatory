# Frozen local Qwen comparison

The user authorized the proposed comparison and targeted Jev diagnostic with “do it.” The guide and original 48 pilot requests remain unchanged. This is a local hard-judgment comparison, not a population robustness ranking.

`qwen-rich-baseline-v1` preserves each original request's guide, policy, trusted facts, material and question definitions, with field hashes and complete rendered request hashes. The authenticated guide/context/questions are mapped to a system message and material to a user message; that interface adaptation is explicit. No gold, rationale, fixture identifier, earlier answer, external decoder or detector enters inference.

The pinned Unsloth UD-Q3_K_XL model generates seven values in one unconstrained JSON object. Choice labels are compared directly; Jev Noul at ≥0.5 is compared to a Qwen Boolean. Qwen's ordinal interference rating is descriptive and is not the same statistic as Jev's weighted Score. The runtime does not enforce a JSON grammar in this initial arm. Invalid JSON, duplicate keys, wrong types/enums, extra text, reasoning/tool outputs and truncated completions remain failures; nothing is stripped or repaired.

The complete 48-case packet fits the configured 32,768-token context: 11,939–27,271 rendered input tokens, plus a 512-token output limit. Temperature0, seed0, top-p1, top-k0, min-p0, repetition penalty1, reasoning off, one slot and concurrency1 are frozen. Prompt caching is off and reported cached-token counts must remain0; automatic context shifting is disabled. The Mac's local timing is not directly comparable to a hosted service's serving conditions.

Report preparation, source editing and browser QA ran concurrently on the same Mac. Local latency therefore describes this session, not an isolated hardware benchmark. The observed control is this specific quantization, chat template and no-thinking configuration; it is not an estimate for every Qwen deployment or precision.

Two separately recorded exact-input compatibility requests passed before evaluation: the first short benign case and the largest rendered request. These are excluded from baseline metrics. The 48 evaluation requests follow the original frozen order and run once each. Raw evidence precedes scoring, dispatch markers prevent retries after interruption, and infrastructure/protocol failures halt further dispatch. The full guide and request size are never silently shortened to fit.

The first-run Jev DNS failure remains in original 49-attempt accounting; model comparison uses the explicitly repaired 48 completed cases. Local completion cannot erase historical Jev evidence. Policy/poisoning/contract coverage remains narrow, and all descendants of eight authored lineages are dependent development observations.

Reproduce from the repository with:

```sh
python3 scripts/serve-local-unsloth.py --serve --run-name rich-baseline-v1
node scripts/qwen-baseline.mjs --prepare
node scripts/qwen-baseline.mjs --smoke --max-requests 2
node scripts/qwen-baseline.mjs --live --max-requests 48
node scripts/report-followups.mjs
```

Existing artifacts are immutable. Already completed evaluation records are loaded without resending; an incomplete dispatch is not retried. Stop the local server when the run is finished. The model weights/runtime are separately documented in [setup notes](local-unsloth-setup.md).
