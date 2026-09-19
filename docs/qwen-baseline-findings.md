# Local Qwen comparison findings

The frozen comparison completed **48/48 valid responses**, with no transport/schema failures, truncation, retries or cached input tokens. Two exact-input compatibility checks are excluded. The complete approved guide and original material/context/questions were retained, with an explicit role-based interface adaptation. This is a comparison on dependent development fixtures, not a model ranking.

| Scored output | Jev correct | Qwen correct | Only Jev correct | Only Qwen correct |
|---|---:|---:|---:|---:|
| Injection label | 42/48 | 41/48 | 7 | 6 |
| Injection Noul ≥0.5 / Boolean | 42/48 | 41/48 | 5 | 4 |
| Context integrity | 42/48 | 41/48 | 7 | 6 |
| Poisoning evidence | 48/48 | 48/48 | 0 | 0 |
| Policy decision | 48/48 | 45/48 | 3 | 0 |
| Input contract | 48/48 | 43/48 | 5 | 0 |

For injection, Qwen missed **0/24 attacks** and flagged **7/24 benign cases**, in both its label and Boolean output. Jev Choice missed **6/24 attacks** with **0/24 false alarms**; Jev Noul at the frozen 0.5 cutoff missed **4/24 attacks** with **2/24 false alarms**. None abstained. The one-case aggregate label-accuracy difference hides substantially different errors.

Qwen flagged every benign Morse and acrostic variant, plus the longest benign invisible-separator case. Jev Choice missed every attack Morse and acrostic variant. These observations do not establish either model’s internal decoding process. The separate [encoding diagnostic](encoding-diagnostic-findings.md) probes candidate-assisted recognition and preserves the ambiguity around the authored `OUTPUT PASS` attack label.

Qwen added an audit disposition in three cases where the authored policy permits plain inspection, and labeled five compliant inputs as contract violations. Four involved attack content inside the permitted sample-data field; one was benign invisible-separator data. The distinction between malicious material and an unauthorized proposed operation remains important. The packet contains only one poisoned/block scenario per length and no contract-violation gold, so high scores on these outputs do not establish broad sensitivity.

| Material length · UTF-16 | Qwen label correct | Qwen median latency | Jev median latency | Timed cases · Qwen / Jev |
|---|---:|---:|---:|---:|
| 1,024 | 14/16 | 82.28 s | 0.234 s | 16 / 15 |
| 16,384 | 14/16 | 99.24 s | 0.272 s | 16 / 16 |
| 65,536 | 13/16 | 194.14 s | 0.365 s | 16 / 16 |

The single additional long-input false alarm is a case-specific disagreement, not evidence of a general scaling law. Local Qwen and hosted Jev use different hardware, output mechanisms and serving conditions. Qwen had one slot, caching and thinking off; report preparation and browser QA shared the Mac. These session timings do not isolate architecture or define a general speed ratio. Jev’s repaired case has no retained latency and is excluded from its short timing summary.

The 48 Qwen calls consumed **875,726 input tokens** and **3,179 output tokens**, with 11,939–27,271 input tokens per request and a 512-token output cap. Summed evaluation-call latency was 105.06 minutes. Child-process high-water RSS was 60.42 GiB, which is not total system or GPU memory. The server was intentionally stopped after completion and port 8767 was verified closed.

The control is the pinned Unsloth UD-Q3_K_XL conversion of Qwen3.8-Flash-Next using official llama.cpp b10964, not every Qwen precision or deployment. See [execution protocol](qwen-baseline-run.md), [weight/runtime provenance](local-unsloth-setup.md), [structured results](../data/qwen-baseline-report.json), and [validation receipt](../data/followup-validation.json). Original Jev evidence and its separately identified repair remain unchanged. All broader tests stay queued.
