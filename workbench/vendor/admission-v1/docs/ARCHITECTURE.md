# Consumer scope adapter and compiler integration

## Data flow

```text
consumer policy registry + AssessmentBatch
                  |
           resolveBatch()
                  |
      per-entry resolved consumer scope
                  + fixed question definitions / per-proposition example banks
                  |
        compileConsumerEntry()
                  |
       existing Policy Payload Compiler IR
                  |
        native Jev request + receipts
                  |
       existing project transport / lock / ledger
                  |
   native judgments + separate code-based disposition
```

`schemas/consumer-batch.schema.json` describes the consumer envelope: `policyId`, `sharedContext`, and `entries[]` with `id`, optional `context`, and `material`. A context contains a complete task object, expected representation, requested exception IDs and caller-supplied source metadata. The resolver allows only those known fields. A source field named `policy` or `context` has no special authority.

## Deterministic merge

Each context field is inherited from `sharedContext` unless the entry explicitly supplies that field. Task objects replace the entire task object; partial task objects fail validation rather than produce mismatched IDs and descriptions. Arrays replace, not union. `exceptionIds: []` clears shared grants for that entry. Explicit null task/format context is retained as missing evidence, not filled from another entry.

The registry filters enabled IDs by the actual consumer task ID, operation and assessed path. This is structural eligibility only. The model must still assess substantive purpose and representation applicability. Caller identity/authentication is outside this adapter; schema validation is not cryptographic verification or an authorization service.

`compileConsumerEntry()` resolves a batch, selects one entry and passes no sibling material to inference. The public input path never accepts evaluated-case expectations. `fixtureBatch()` is only the experiment adapter: it projects material/context, excluding author labels and notes. Material stays byte-equivalent after JSON value reconstruction; no decoding, searching, filtering or normalization is used at inference time.

## Model-specific rendering

The existing compiler is frozen under `vendor/compiler`. Its original source is preserved. The new consumer adapter supplies native structured question definitions and small proposition-specific example banks. It places the same resolved example content either under `instructions.examples` or `criteria.<label>.examples`, then imports/render-preserves that native request through the compiler's existing IR. It does not use the earlier shared 34-example corpus or repeat it across every question.

Each compiler receipt adds a `logicalAssessmentHash` independent of layout, consumer-context source origins, and a demonstration assignment/content hash. Native criterion examples are already part of the structured definitions when imported; the internal preserve-layout profile is not a claim that examples reside in state. The receipt's explicit destinations and saved request show their actual placement.

This per-proposition bank is a new information-selection/content treatment relative to the old corpus. Only the two new local layouts are a content-matched placement comparison. Neither is a controlled placement-only comparison against the older rich/compact controls. Future model adapters may render the same reviewed policy/context data differently; this package implements only the current Jev surface.

## Source and execution integrity

The two old inspection controls reproduce original request hashes. All new source assets, relevant compiler code and original dependency hashes enter the new plan identity. Requests and receipts are immutable. Reports are recomputable from saved records and authored label matrices. The current live path delegates HTTP parsing, answer validation, shared locking, durable reservations and pricing to the same hash-verified project code as the prior experiments.

No ordinary missing response becomes an automatic retry. Reservations without responses remain unknown; durable saved responses can be settled on resume without resending. Budget limits apply before each dispatch, including in-flight holds. The run refuses a live ledger missing the already completed v2 spending floor, protecting against launching an older copied workspace as a fresh account. No credential values enter the plan or receipts.

## Context and cost screens

New requests are locally screened at 56,000 total serialized bytes and 28,000 bytes for state plus the longest question. This is a deliberately conservative allocation screen, NOT a tokenizer or proof of compliance with TypeSafe's token limits. The first twelve calls exercise two largest requests in each new condition. Acceptance, reported model and usage are checked before execution can continue. This is technical validity/capacity checking, not selection based on classification outcomes.

The schedule then interleaves conditions deterministically. All 480 jobs are predeclared; no test is omitted because its prediction was difficult. Default concurrency is two with 300 ms minimum start spacing. The fixed run allowance is $0.40 inside the unchanged shared $3 envelope, settled from actual provider input tokens at the frozen price. Price changes require review rather than silently assuming the forecast is a bill.

## Outcomes

The new report separately counts semantic detections/misses/false alarms, contract judgments, native admission outcomes, and derived code outcomes. Unsafe allows and unnecessary holds are distinguished. Correct policy rejection of benign encoded content can coexist with an incorrect attack label. A `review` does not count as an attack detection. Native output and probabilities remain unchanged in evidence; the derived disposition is another field, not a repair presented as the model answer.

This is a research gate evaluation. Neither native nor derived choices are connected to a real receiving agent.
