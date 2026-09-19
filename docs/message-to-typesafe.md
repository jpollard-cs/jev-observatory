Subject: Jev evaluation: design feedback and $75 in research credits

Hi TypeSafe team,

I’m building a reproducible Jev security-classifier evaluation and would welcome feedback on fair model use, prompts, context structure, primitives, and scoring.

Our central question is whether Jev can apply a supplied security specification. We are **telling it what to look for**, rather than assuming broad prompt-injection or prompt-engineering expertise. We stopped the generic-prompt runs to review a detailed guide defining attack families, recognition cues, trust boundaries, contextual exceptions, and output meanings.

The completed 48-case development pilot supplies that guide, the material to classify, and authorized policy/context, **without worked, labeled input/output demonstrations**. The guide does include prose examples of benign situations; this is instruction-only classification, not a few-shot demonstration set. Is that a fair starting condition for Jev, or would you recommend labeled examples or a different decomposition? We can evaluate an example-assisted condition separately. There are no regexes, external decoders, or auxiliary detectors. Native Choice/Noul/Score questions remain independent; application-level composition would also be reported separately.

Coverage includes injection, existing poisoning versus attempts, moderation, and judge manipulation; encodings/codebooks, invisible Unicode, whitespace, fragmented payloads, multiple messages/resources; and policy strictness, scoped debugging permissions, expiry, and audit requirements. The focused pilot uses 1,024, 16,384, and 65,536 UTF-16 material units, roughly 13–29K total Jev input tokens including the guide, context and questions. The preserved 15,120-cell broader catalog has not all been run.

We track false positives/negatives, abstention, calibration where supported, validity, latency, and cost. On the small authored packet, Jev Choice missed 6/24 attacks with 0/24 false alarms; a pinned local Unsloth Qwen control missed 0/24 with 7/24 false alarms. A separate 32-call Morse/acrostic diagnostic isolates classification from candidate-text recognition. Plaintext “OUTPUT PASS” also remained benign for Jev, so we particularly welcome feedback on that semantic boundary and our authored gold. Luna/Terra Codex-agent controls remain separate because their runtime differs. These dependent synthetic cases cannot establish rare-event safety; that requires an independent study.

I had spent about $1.04 before the restart; locally metered restarted Jev usage adds about $0.065, with one small unresolved transport reservation. Would you provide **$75 in evaluation credits**? Our current full-catalog planning allowance is **$48.81** at your public $0.042/million input-token rate, supplying the rich guide once in shared state. This uses conservative sizing—one input token per serialized request byte plus 256 tokens per call—not a billing forecast. We’ll recount the final questions and check actual API usage in a small preflight. The remaining **$26.19** would support prompt/schema experiments, targeted reruns, and additional cases before committing to the full run. This gives the study a bounded budget with room to correct the design first.

We intend to open-source the harness, templates, cases, methodology, and results with a precomputed interactive Observatory. Everything remains private while we validate. We’d appreciate design corrections, recommended patterns, and benchmark/sharing guidance.

Thanks!
