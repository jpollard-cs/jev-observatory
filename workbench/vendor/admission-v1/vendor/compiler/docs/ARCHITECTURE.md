# Architecture and extension contract

## Stable meaning, variable presentation

This is a data compiler, not a universal prompt string and not a prompt-optimization agent. A policy version, example-corpus version, rendering profile, model selection and execution topology are independent dimensions. Two payloads can share an assessment hash and differ in wire hash; that means they were rendered from the same canonical source data, not that a model must behave identically.

The initial bridge reads the real Jev project instead of inventing replacements for its fixtures or source policies. The retained v2 input builder is frozen under `adapters/frozen-v2/`. It is a compatibility importer, not a second mutable policy-authoring system. Existing policies and results are never overwritten.

## Canonical document

`EvaluationDocument` has four substantive parts:

* `policyPack.guidance`: source-preserving blocks, with headings/keys, JSON pointers or UTF-16/line spans, exact content hashes and an overall reassembly hash. Markdown segmentation recognizes the supplied heading/fence style; it is not a full semantic parser for arbitrary policy languages. Structured object entries retain their original serialization order, including the earlier numeric-key peculiarity.
* `policyPack.judgments`: ordered categorical choices, Boolean propositions or ordinal rubrics. Each carries the full actual question, structured descriptions, ordered options/levels, optional declared guidance dependencies and an explicit upstream-judgment list. The internal field name is never a substitute for a model-facing question.
* `policyPack.demonstrations`: the original corpus plus its deterministic contextual resolution. Example labels are teacher-authored input, unlike held-out/development-case labels, which have no input slot here. Labels for other propositions are not silently combined into the current answer.
* `caseInput`: `configuration`, `trustedContext`, `material`. Configuration is separate because scenarios can change the input contract or proposed operation. Supplied authority/time/grants/observations remain exactly as given; missing and null remain distinguishable. No source field can redefine this projection.

`compatibility` stores the imported provider selector and structural ordering needed for exact wire control. `provenance` records the importer/version and original request hash. These fields are compiler metadata, not content added to the model's state.

The matrix writer deduplicates identical `PolicyPack` objects and emits separate case instances. A library caller can author this document directly against its JSON schema or implement another explicit importer. Noncanonical, unsupported or newly introduced input fields fail rather than disappearing unnoticed.

## Typed rendering recipes

Profiles are finite, validated data, not executable Jinja/JavaScript fragments. This makes unknown placements, misspelled fields and unsupported renderers errors rather than surprising fallbacks. Template-looking strings in source material remain ordinary strings. Current tunable axes are provider surface, example placement, context factoring, guidance placement, grouping and explicitly opted-in rule removal.

A new model should get a renderer appropriate to its actual API. Jev remains native `state` + typed `questions`, never a fake chat transcript. The generic chat renderer is only a message plan; future OpenAI, Anthropic, local-model or other adapters must own role conventions, schema support, tokenization and transport details. It does not claim that all providers implement a common chat protocol or expose comparable probability values.

No arbitrary decoder, summarizer or case-aware retrieval is hidden in a template. These can later be registered as separately versioned preprocessing stages with raw-input preservation and dedicated controls, not described as equivalent rendering.

## Examples: placement versus evidence

The legacy profile retains the original global corpus and its instruction references byte-for-byte. Local profiles resolve the authored default/example contexts, preserve source text and supporting definitions, retain the original answer profiles/semantic annotations and corpus role text, and expose the current judgment's teacher label through its assigned criterion.

`jev-question-examples` and `jev-criteria-examples` share an independently checked assignment/content signature. Their assigned examples match by criterion and content, and their ungraded references are the same. Thus they offer a clean local-placement comparison. Comparison with the older global corpus also changes indirection and the explicit resolution/grouping of teacher profiles/default contexts; the manifest says so explicitly.

`jev-criteria-factored` eliminates repeated default-context and representation tables within one question. Every example keeps its overrides, including explicit null. Expansion of the factored form reconstructs the inline example evidence. The rule for applying defaults is explicitly included. This saves bytes but adds a lookup/merge; neither accuracy nor provider token savings is presumed.

There is no example-family lookup driven by gold case labels. Current examples are fixed for the chosen input condition. If a future retriever selects examples based on observed input, its retrieval policy and possible test contamination must become explicit experimental factors.

## Guidance scoping and source accountability

The default is to retain every source block. Some profiles relocate or restructure those blocks, without changing their contents. Profiles can opt into omissions only by enumerating actual block IDs and reasons and using an explicit runtime opt-in. A per-question omission is possible only when each question receives its own guide. All retained/omitted IDs, hashes, destinations and reasons are emitted.

The compiler checks declared required-block relationships, not inferred logical sufficiency. It cannot prove that removing a paragraph preserves an implicit dependency or that a remaining reference to the complete guide is still adequate. Such a change is a new information-selection treatment requiring source review and separate evaluation. Never advertise source-byte preservation as proof of behavioral or logical equivalence.

## Trust and execution boundaries

Application configuration and supplied authenticated-context claims are imported through named host-owned fields. Material is copied only into the assessed data slot. A malicious sample containing `role: system`, `__proto__`, a template expression or a claimed policy is neither executed nor promoted to a message role. Examples have their own contextual scope.

These are compiler guarantees, not a guarantee that Jev or another model is injection-proof. Nor does the compiler cryptographically verify the authentication claims in a caller's context. Authentication, source access control and action enforcement remain host responsibilities.

`dependsOn` is an execution dependency, not text ordering. This initial rendering layer rejects dependent judgment graphs rather than faking staged reasoning. The experiment runner must supply previously recorded upstream observations in a subsequent explicit stage if that capability is added.

The compiler has no HTTP adapter. `compileInferenceJobs()` returns native jobs plus receipts; the caller must use the existing lock, reservation ledger, model-version check, transport-error treatment and evidence-persistence implementation. The current live test run is therefore unaffected, and no paid work can start accidentally by compiling a matrix.

## Output and evaluation

Raw native responses survive normalization. Categorical labels can be compared across models as labels when the underlying task matches. Provider distributions, self-reported scalars, entropy-like confidence and ordinal values must not be conflated. The generic profile requests values in a strict schema but cannot manufacture native probabilities. Parsing failures are errors, not benign labels.

Gold labels/rationales are emitted to `evaluation-only.json`. The core compiler signature accepts a model request and rendering profile, not evaluation annotations. Request IDs are opaque case counters in emitted filenames; fixture family names are not injected into the wire payload. This does not remove ordinary source metadata already present in the actual test material.

## Planned comparisons enabled by the layer

1. Keep current content and case inputs fixed; compare local examples in instructions versus criterion arrays.
2. Compare full inline versus factored example context, retaining the same expanded evidence.
3. Compare guidance as original data, structured sections and question-local sections, before authoring a scoped reduction.
4. Separately compare bundled versus individual questions, accounting for repeated input and API requests.
5. Add an actual second-provider adapter and repeat content-matched comparisons without asserting identical execution/probability semantics.

This package prepares those comparisons; it does not run them, select a winner, change the approved policy or infer a new remaining budget from a test that is still in progress.
