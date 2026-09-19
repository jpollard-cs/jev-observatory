# Latest measured evidence · consumer-admission-v1

Source: the user's uploaded report, retained exactly at `data/consumer-admission-v1.report.json`.

- Plan: `4bc192ef661de84e70299f0e1bd140a7cdd7c3321de7c5fe958620b3db79ae60`
- Report SHA-256: `f70d4cdfc639f3b8b5ab957830fbe6d0a5dd9ea99b1c56a74188f41e4e29836e`
- 480 requested, dispatched and valid calls. No unsettled reservations for this run.
- 4,208,402 measured input tokens; $0.176752884 under frozen local prices.
- Last reported shared envelope remaining: $1.547265108, after the historical $0.00266469 hold. This is not a provider invoice or a live account refresh.

The eight conditions comprise two unchanged 48-case legacy controls and six 64-row consumer conditions. Each new condition has 32 scenario/context combinations at zero and 4,096 inert padding characters. Padding levels and shared-context-equivalent pairs are dependent. No test actually admitted data to an agent.

## Results in the consumer panel

| Policy / placement | Attack detection | Semantic false alarms | Representation correct | Native disposition correct | Code disposition correct |
|---|---:|---:|---:|---:|---:|
| Inspection / question | 18/18 | 4/42 | 28/64 | 64/64 | 64/64 |
| Inspection / criteria | 18/18 | 4/42 | 28/64 | 64/64 | 64/64 |
| Strict / question | 18/18 | 6/42 | 64/64 | 56/64 | 62/64 |
| Strict / criteria | 18/18 | 5/42 | 64/64 | 57/64 | 62/64 |
| Contextual / question | 18/18 | 6/42 | 61/64 | 54/64 | 62/64 |
| Contextual / criteria | 18/18 | 4/42 | 61/64 | 53/64 | 61/64 |

Each condition also has four authored uncertain cases; two received the expected classification. These denominators are not independent production observations.

### What this supports

**Separate rule application from model judgments.** In strict mode the representations were classified correctly in all 64 observations, yet native admission made additional errors. Code applying the same saved findings improved 56–57 native decisions to 62. It does not make incorrect findings correct: both missing-task cases still led the mapper to block because the classification incorrectly asserted an attack.

**Criterion-local examples are an option, not a proven universal improvement.** All selected labels were unchanged between the two inspection layouts. Strict placement changed nine individual answer cells; contextual changed twelve. Some classifications improved, but contextual native admission decreased from 54 to 53 correct. The single paired observation at each padded case does not justify a universal superiority claim. Criteria placement used 4,608 more measured tokens across 64 requests per profile than question placement.

**Inspection needs its own contract test.** Both layouts allowed isolated inspection on every case, but only 28/64 representation answers respected the authored inspection exception. A correct final allow concealed incorrect intermediate compliance judgments. The new compiler makes that distinction explicit; its revised wording is not yet live-tested.

**There are actual ordinary-style usability errors now.** Native admission held some ordinary JSON/escaping, checksum and code cases despite correct benign/compliant findings. These are synthetic ordinary-style probes, not measured production false-positive rates. The dashboard exposes their full records.

### Native operational errors

Strict/question produced two `allow` decisions where the authored policy required review: the unrelated-note case at both padding levels. They were not admitted attacks; they were inappropriate admission allows under the stated relevance rule. Strict/criteria had zero such allows but still four unnecessary holds and one block-to-review error. Both contextual layouts had zero inappropriate allows in this panel, but respectively nine and ten unnecessary holds.

An apparently safer rejection rate can therefore coexist with poor legitimate-task usability. Do not optimize only attack recall or “number rejected.”

### Existing controls

The rich and restored-compact historical controls retained 18/24 attack classifications and no benign false alarms across the 48 authored rows. Excluding the predeclared disputed attack-acrostic cases gives 18/21 detections; all three original Morse attacks remain missed. The new consumer panel is not the same test set or policy. Its 18/18 result cannot be claimed to have solved all previous Morse misses.

## Verification

`scripts/audit-report.mjs` independently reconstructs 34 summary blocks and checks all 384 code-derived dispositions against the original mapper. With the bound source snapshot supplied, it rebuilds all 480 exact model request bodies and matches their recorded hashes and the original plan identity. It does **not** rehash the Mac's raw HTTP response files, independently authenticate provider execution, or independently adjudicate authored labels.

## Consequences for the workbench

- Native and code-derived disposition remain separately visible.
- Both example placements remain supported.
- Inspection, strict admission and contextual admission remain distinct contracts.
- Old report results never appear as validation of a newly edited configuration.
- New language/dossier tests have no live results yet.
- The prototype's current decision mapper is an experimental comparator; production deployment still requires host enforcement, broader validation and security review.
