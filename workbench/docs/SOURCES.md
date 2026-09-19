# Source and evidence references

Primary vendor documentation checked 2026-09-18:

- TypeSafe, Advanced primitive descriptions: https://docs.typesafe.ai/primitives/advanced
- TypeSafe, Models, pricing and limits: https://docs.typesafe.ai/models
- TypeSafe, Jev 1.13 jaggedness and limitations: https://docs.typesafe.ai/model-jaggedness/jev-1.13

The native renderer follows structured `state`, typed questions and definition/example criteria. “Examples” is not treated as an undocumented guarantee of special processing. The model documentation's English-language strengths do not establish universal language coverage or better attack detection merely from restricting languages. The jaggedness documentation cautions against relying on adversarial-state judgments as an entire security boundary.

The historical report remains user-supplied evidence, with independent local arithmetic/request-binding checks described in `validation/report-audit.json`. It does not authenticate a provider invoice or substitute for raw-response verification on the original machine.

All new source language probes, question demonstrations, dossier text and labels are authored development data. They are not presented as real customer documents, native-speaker adjudications, public benchmark results or hidden-test performance.

The original admission bundle, compiler and bound runtime are retained in `vendor/`. Their source identities and the parent handoff are recorded under `provenance/`. No live website publication or Git history merge has occurred.
