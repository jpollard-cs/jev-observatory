# Model-specific language options

The model capability catalog is in `workbench/src/model-capabilities.mjs`. It is shared by the manual language picker and the bounded setup-advisor vocabulary. The selected policy model resolves its own record; unknown models receive no default model's language options. A capability record alone does not enable execution: a reviewed provider adapter is still required.

## What TypeSafe actually claims

Checked 2026-09-19: https://docs.typesafe.ai/models#language-support describes English as Jev's primary training language and strongest accuracy, with other languages including CJK scripts handled unevenly. It does not enumerate every supported language.

Accordingly Jev has an **open multilingual** capability record. The 36 named choices are an Observatory exploration menu, not 36 independently certified provider capabilities. English is marked primary; every other option is marked exploratory in the capability data. An adapter for a provider with an explicit list can use an **enumerated** record, whose menu and setup options contain only that list. The UI retains custom/imported tags with an unverified-support warning rather than silently rewriting policy permissions.

## Coverage and provenance

Authored matched language probes currently exist for English, Spanish, French and German. This describes fixture availability, not successful execution, equal model accuracy, or native-speaker adjudication. More multilingual attacks and benign controls, regional variants, mixed-language content, and native-speaker review remain necessary for coverage claims.

Setup option library version 3 supports each offered language alone, the existing English/Spanish and English/French pairs, unrestricted input languages, and manual review for other combinations or output-language requirements. Manual selection can compose any combination; a single-language suggestion replaces the old list and never implicitly retains English. All suggestions still require explicit review. The descriptive language of the application does not grant permission for that language.

The exact request includes the target's dated capability record; the frozen source manifest also hashes the catalog. Old advice cannot silently be reinterpreted under new options. Policy model, selected language tags, compiler sources and requests remain bound to their plans. Adding menu options does not fabricate, rerun or relabel historical results.

These changes were checked offline and with synthetic provider responses. No live language-accuracy measurements were made.
