# Local Qwen baseline — integration draft

Status: evaluation integration remains an offline design. Unsloth runtime setup is complete, with two successful toy/neutral setup checks; no classification benchmark has run. The full baseline evaluation still needs a frozen adapter/configuration and exact rich-request compatibility checks.

## Minimal adapter path

Reuse the injected JSON transport in `harness/ports/json-transport.mjs` and `harness/adapters/http-json.mjs`. If the selected local server exposes compatible Chat Completions, a small composition root can supply a localhost endpoint and an already-built request to the nonnative branch of `evaluateAssessment` in `harness/application/inference.mjs`. Verify the server's actual request/response contract during setup; compatibility is not established by this draft.

The current endpoint resolver recognizes only Jev/Luna/Terra and requires an API key. Add a separate explicitly named local-Qwen resolver or injected endpoint value; do not label Qwen as Luna/Terra. Permit HTTP only on a configured loopback address and omit authentication when the local server does not require it. The existing application always builds a bearer header, so its HTTP boundary needs that small optional-auth adjustment or a local transport adapter. Keep filesystem/environment/HTTP concerns outside the pure request mapper.

Avoid `infer({caseItem})` and `requestPayload` for this comparison: those build the older generic control prompt, not the rich seven-question packet. The proposed path is:

`frozen rich request → pure Qwen message mapper → injected local HTTP transport → raw generated text → strict schema validator → separate baseline report`.

Return existing tagged Results for transport/schema failures. Retain raw response, finish reason, usage, timing and errors before parsing. No retries, verdict repair, detector, decoder, or fallback judge belongs in this path.

## Preserve the evaluated content

Use the 48 frozen requests under `runs/rich-template-pilot-v1/requests/`, with plan hash `e6b111a1b48421abcaee8377835c8241a3df9dbfe7c49ce8ef4e3077c73088ef`. The approved 47,739-byte guide has hash `56b77c5efa6b4df0da9a240284a532da5b9d21e35e2450976da98a27718de3f0`.

Copy `state.classifierGuide`, `state.policy`, `state.trustedContext`, `state.material`, and all seven questions' instructions/criteria without rewriting their content. A minimal chat mapping places the guide, policy, authenticated facts and question map in the system message, and `material` in the user message, with a short explicit authority/output wrapper. Record this role/serialization adaptation: native state and chat roles are different interfaces. Hash every copied source field and the complete rendered chat request; preserve question/option order. No expected labels, rationale, case IDs, splits, historical results or preferred answers enter inference. Do not regenerate cases from a newer template.

## Outputs and comparability

Start with one generated JSON object containing all seven judgments:

| Question | Local generated value | Primary comparison |
|---|---|---|
| `classification` | Same three option labels | Native selected Jev Choice versus local selected label |
| `injection_present` | Boolean judgment | Jev Noul at fixed `>= 0.5` versus local Boolean |
| `integrity` | Same four option labels | Exact selected labels |
| `poisoning_evidenced` | Boolean judgment | Jev Noul at fixed `>= 0.5` versus local Boolean |
| `policy_decision` | Same four option labels | Exact selected labels |
| `input_contract` | Same three option labels | Exact selected labels |
| `interference_scope` | Ordinal rubric level 0–3 | Descriptive only; no accuracy gold |

This preserves the propositions while explicitly changing the output mechanism. Jev's Score is a probability-weighted ordinal value; a local selected rubric level is not the same statistic. If a later arm asks Qwen to generate probabilities or option distributions, name them **self-reported generated probabilities** and keep them separate from native Noul/distribution measurements. They are not calibrated by their presence in JSON, and neither native concentration nor self-reported confidence is correctness probability. Do not compare their calibration without a separate preregistered analysis.

One Qwen generation answers seven questions jointly: later output tokens can depend on earlier judgments. Jev's native questions are independently evaluated against shared state. Asking Qwen to answer independently does not reproduce that architecture. Disclose the difference and compare hard decisions first. Seven separate Qwen calls would be a different, separately budgeted arm, not a silent implementation change.

Require one complete JSON object, exact keys/types/enums, and no extra text. Keep unparsed/missing/truncated outputs as failures; no regex extraction, code-fence stripping, coercion, label inference or retry-until-valid. Preserve typed fields separately where a declared field-level report permits it, alongside complete-output validity. Unconstrained JSON generation is the initial format arm; runtime-enforced JSON schema/grammar, if used, is an explicitly separate constrained arm with its exact schema and enforcement method pinned.

## Freeze before evaluation

Record model repository and immutable revision/artifact hashes; tokenizer files/revision and chat-template hash; quantization type, bit width and artifact; runtime/package versions; hardware; context configuration; generation/token limits; temperature/top-p/seed/stop behavior; question/JSON key order; reasoning or thinking mode; and schema mode. Record cache/warmup policy and concurrency. Pin supported values from the actual installed runtime rather than assuming Qwen variants expose identical switches. Preserve separate reasoning fields if supplied, but grade only the declared final output; reasoning tags mixed into invalid final JSON are not stripped to rescue it.

Keep the three material lengths and all content identical. Tokenizers and chat wrappers differ, so local token counts will differ from Jev's; report each measured count under its own tokenizer. Count the full rendered guide, state, questions and wrapper plus output allowance against the configured context window. Never silently truncate or shorten the guide/material to fit. Unsupported lengths and truncation are recorded outcomes, not model successes or measured injection misses.

## Smoke first; evaluate separately

1. Establish the local server/model identity and basic response format using a dedicated setup request. This is runtime setup, not evidence of classification quality.
2. Freeze the mapper and config; validate one short and one largest-input smoke request for exact content hashes, context fit, output parsing, usage and failure capture. Retain these separately, including failures; do not use them to tune thresholds or select a favorable prompt.
3. Run the fixed packet only after compatibility is established. Keep setup/smoke costs and warmup separate, all attempted evaluation rows visible, and the first Jev DNS failure in its original denominator. Report matched available pairs and all-attempt results separately; local availability cannot retroactively repair Jev evidence.

The packet has eight dependent authored lineages, one poisoned/block scenario per length, and only compliant input-contract labels. Even a complete local comparison remains a development baseline rather than a robustness ranking or broad policy-compliance claim.
