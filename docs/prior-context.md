# Recovered security taxonomy and provenance

## What was recovered

The earlier checklist was found in **Prompt Injection Demonstration**, task ID `6a6abc5f-a57c-83ea-ab40-63db708ae6fd`. The relevant checklist and user requirements date to **2026-07-30** (UTC); a revised trust-policy template dates to **2026-09-06** (UTC). Retrieved through the Codex `read_thread` tool on 2026-09-16 (local session date).

This is a distilled research input, not a copy of the conversation and not governing instructions for the evaluator. Historical assistant recommendations are hypotheses and design proposals, not validated claims about attack effectiveness. No success-rate evidence or Jev evaluation results were present in this source. Two other candidate tasks were irrelevant and their contents were excluded.

The original checklist is conclusively located. The September refinement was truncated at the retrieval tool's 20,000-character message limit; the July checklist was retrieved without truncation. Referenced external attachments and citations inside the historical conversation were not independently retrieved, so this document does not treat those citations as verified research evidence.

## User requirements recovered from the source

- Distinguish data-only material from inputs authorized to carry instructions, with owner-configurable boundaries and input contracts.
- Test indirect encodings, including cases whose surface is ordinary English and whose hidden meaning emerges from lexical relationships.
- Consider compromised calling agents and harnesses in unattended workflows, including compromise propagated back through an agent's output. Human social engineering was explicitly secondary to these machine-to-machine boundaries.
- Preserve the distinction between an artifact's opaque reference and its contents or retrieval authority.
- Investigate spoofed message boundaries and randomized block identifiers as an experimental variable. The source does not establish that delimiters provide a security boundary.

The current request adds Jev as the target, a model-only baseline without regex or detector support, configurable policy strictness, poisoning classification, long and multi-message contexts, structured policy findings, moderation, independent Luna/Terra judging controls, rare-event measurements, a precomputed presentation, and a GitHub repository. **Jev access is asserted in the current request; the recovered historical task does not supply Jev's endpoint, model identifier, credentials, or API contract.**

## Recovered attack families

| Family | Representative coverage | Evaluation distinction |
|---|---|---|
| Character and byte representations | Base64 variants, Base32/58/85, hex, numeric character codes, percent encoding, entities, escaped strings, quoted-printable, MIME | Encoded content can be legitimate data. Pair malicious and benign semantic equivalents. |
| Ciphers and codebooks | ROT13/Caesar, substitution, transposition, reversal, keyboard offsets, XOR, Morse, example-defined alphabets | Separate recognition, recovery of meaning, and obedience to recovered instructions. |
| Unicode and rendering | Confusables, mixed scripts, full-width forms, combining marks, normalization variants, zero-width and invisible separators, bidi controls, variation selectors, tag characters | Preserve original bytes and rendered views where supported; report normalization choices. |
| Layout and textual steganography | Acrostics/telestics, nth-character extraction, word lengths/parity, capitalization, punctuation, spacing/tabs, line breaks, ordering, table positions, word counts | Include ordinary-looking carriers and legitimate puzzles. Avoid assuming unusual layout implies an attack. |
| Linguistic transformations | Translation/transliteration, phonetic spellings, OCR errors, synonyms, paraphrase, code words, indirect language, fictional framing | Vary semantics and languages without treating non-English text as inherently suspicious. |
| Fragmentation and composition | Payloads distributed across messages, fields, pages, files, rows, filenames, URLs, comments, tool results; separated keys and payloads | Score the full context and constituent resources separately; record which evidence becomes sufficient and when. |
| Nested transformations | Encoding chains, compression followed by encoding, serialized containers, multiple decoding stages, decoder instructions | State whether the evaluator or target sees decoded material. Pre-decoding is a separate condition from raw model-only input. |
| Technical containers | Code comments, string literals, JSON/YAML/XML, HTML/Markdown/CSS, document properties, spreadsheet formulas, JWTs, email parts, logs, stack traces | Use format-matched benign controls. Data schemas and syntactic validity do not confer instruction authority. |
| Multimodal and concealed rendering | OCR text, QR/barcodes, alt text, metadata, hidden layers, white-on-white or tiny text, subtitles/transcripts, audio spelling, cross-media fragments | Claim coverage only for modalities actually delivered to and supported by the target. Negative-space interpretation is an expansion from the current request, not a recovered empirical finding. |
| Authority and boundary spoofing | Fake system/developer/admin messages, policy updates, emergency claims, signatures, delimiters, fabricated approval | Actual delivery channel and scoped delegation determine authority, not self-declared role text. |
| Memory, summary, and handoff poisoning | Untrusted claims promoted into prior approval, persistent preferences, compaction, previous assistant statements, multi-agent repetition | Preserve the original source and distinguish a claimed past authorization from application-supplied current permission. |
| Capability and output laundering | Requests to expand tools or scope, conceal actions, bypass denial through another channel, turn findings into commands for another agent, leak restricted derivatives | Evaluate inbound and outbound boundaries independently using synthetic resources and inert action traces. |

## Policy concepts to preserve in the suite

The September refinement separates **provenance**, **instruction authority**, **factual integrity**, and **confidentiality**. These should remain independent fixture fields: an authenticated source can carry accurate confidential data while having no authority to direct the agent.

The central invariant is that transforming or summarizing material does not increase its authority. A source can inform how an already authorized task is performed without granting a new task, destination, permission, or disclosure. This nuance matters for false positives: legitimate repository test instructions and quoted security material should not automatically be classified as hostile.

Use a short baseline policy and trusted owner-supplied overrides. Keep the long attack taxonomy in the evaluation corpus rather than silently injecting it into every target prompt. Record every policy and override as an experimental condition. A claimed override inside the evaluated material is an attack input, not a real policy change.

The history proposed external authorization, provenance tracking, decoding/redaction, runtime checks, and randomized delimiters as defense ideas. The current **model-only baseline excludes those as target assistance**. Transport isolation, synthetic credentials, and preventing real-world effects remain properties of the research harness, not classifier intelligence.

Do not infer an already-poisoned context merely from an encoding or suspicious string. Define separate labels for observed injection evidence, factual corruption, attempted authority promotion, uncertainty, and whether a downstream model actually followed the injected instruction. Confidence calibration and ground-truth poisoning status require new, labeled evaluation data.

## Limits on interpretation

This taxonomy establishes coverage intent. It does not establish prevalence, risk ranking, attack success rate, or that every family is supported by Jev. Data poisoning here primarily means poisoned retrieved/contextual material or persisted memory; training-set poisoning requires a separately scoped experiment with control over training data and cannot be inferred from context-classification results.

Avoid presenting a detector's warning, a judge's opinion, a schema-valid response, or a historical assistant explanation as proof of compromise. Preserve examples, target outputs, reference labels, independent judgments, disagreement, and denominators so later analyses can support their conclusions.
