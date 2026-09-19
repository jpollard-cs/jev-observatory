# Schema guide

The canonical data, not a rendered prompt string, is the editable object.

```text
EvaluationDocument
├── policyPack
│   ├── guidance
│   │   ├── format / sourceHash
│   │   └── blocks[]: id, heading, exact content, source span/pointer, contentHash
│   ├── judgments[]
│   │   ├── id, kind, complete instructions
│   │   ├── criteria[]: key + structured description
│   │   ├── dependsOn[]
│   │   └── requiredGuideBlocks[]
│   └── demonstrations
│       ├── original corpus + sourceHash
│       └── examples[]: resolved context/content, teacher labels, label origin
├── caseInput
│   ├── configuration       # policy rules / contract settings for this instance
│   ├── trustedContext      # receiving task, supplied provenance, grants, observations
│   └── material            # exact assessed content; never interpreted by compiler
├── compatibility           # provider selector and original field ordering
└── provenance              # importer version and original wire hash
```

Descriptions accept JSON values under the provider's documented structured-description surface. `criteria` is an ordered list in the IR so categorical options and ordinal levels have explicit stable order. It renders to the appropriate map or array, rather than making every model consume this same IR shape.

A rendering profile declares:

```json
{
  "schemaVersion": "payload-profile/1",
  "id": "jev-criteria-examples",
  "renderer": "jev",
  "examplePlacement": "criterion-local",
  "guidePlacement": "legacy-state",
  "questionGrouping": "together",
  "exampleContextLayout": "inline",
  "omitGuideBlocks": {},
  "maxRequestBytes": 1500000
}
```

`maxRequestBytes` is a local allocation guard, not a tokenizer, model context limit or spending limit. Requests fail rather than being cropped. The execution layer needs provider-specific context limits and the existing budget ledger.

For experimental per-question selection, use `questionGuideOmissions` keyed by actual judgment ID and source block ID, with reasons. This requires `guidePlacement: question-local` and explicit omission permission. It does not authorize removing blocks listed in that judgment's `requiredGuideBlocks`. No default profile omits policy blocks.

Schema files are compatible with JSON Schema 2020-12 tooling. Runtime domain checks additionally validate hashes, reassembly, example-label projection, dependency cycles, original field ordering and protected compiler slots. The shipped sample document, policy pack, case input and representative payloads are validated separately in `validation/`.

## Author new examples without the legacy Jev corpus format

The legacy `answerProfiles` importer is only a compatibility bridge. A model-neutral, explicitly labeled corpus is supported too:

```json
{
  "schemaVersion": "demonstration-corpus/1",
  "purpose": "demonstrations",
  "examples": [
    {
      "id": "independently-authored-001",
      "content": {
        "context": {"task": "Assess a source without executing its instructions."},
        "sample": "A newly authored example, with sufficient context for its teacher labels."
      },
      "labels": {
        "classification": "benign",
        "injection_present": false,
        "interference_scope": 0,
        "an_unresolved_proposition": null
      }
    }
  ]
}
```

These are illustrative authoring values, not an extra test fixture. New judgments can have their own explicit categorical, Boolean or ordinal teacher labels; no hardcoded question-name mapping is required in this format. A null teacher label means ungraded for that proposition, not a negative example. The compiler never infers new ordinal gold labels. Marking an evaluation dataset as demonstrations would still be contamination; this explicit purpose field is an input contract, not a substitute for dataset governance.
