# Policy Payload Compiler · 0.1.0

An offline source-preserving compiler for the Redteam Observatory. Separate **what is being judged** from **how a model receives it**.

```
original policy / request / demonstration sources
                     ↓ explicit importer
     PolicyPack + CaseInput + provenance (JSON schemas)
                     ↓ versioned rendering profile
        native Jev request(s) / generic message plan
                     ↓ existing budgeted runner — not invoked here
                raw model evidence + evaluation
```

**No live inference, `.env` access, dependency installation, ledger writes, or modification of the existing project.** The current boundary-fewshot-v2 run can remain unchanged. This package does not contain a live runner or a background process.

## Start on the Mac

Unzip `policy-payload-compiler.zip` on Desktop. Then:

```bash
bash "$HOME/Desktop/policy-payload-compiler/run.sh" \
  --project "/Users/jordan/Documents/Codex/2026-09-16/i-g/outputs/jev-redteam"
```

This reads the hash-bound original case builder, builds the unchanged 48 regression inputs under `restored_open_set`, imports them into the canonical schema, and renders three profiles: the exact legacy wire control, examples in each question's instructions, and examples inside the matching criteria. It writes **144 payload files, not 144 API calls**. Its output directory is printed and lives under this package's `rendered/` directory. No installer and no moved credentials are needed.

Every output directory is immutable: an existing destination is refused. Inspect it again rather than overwriting it, or select a new `--out` for a deliberately separate build.

Other offline operations:

```bash
# Portable tests; requires Node.js 20+, not Python or npm installation.
node "$HOME/Desktop/policy-payload-compiler/cli.mjs" self-check

# Also include the 64 extension inputs from boundary-v2 (112 total inputs).
bash "$HOME/Desktop/policy-payload-compiler/run.sh" \
  --project "/Users/jordan/Documents/Codex/2026-09-16/i-g/outputs/jev-redteam" \
  --suite boundary --all-profiles

# View editable profile configurations.
node "$HOME/Desktop/policy-payload-compiler/cli.mjs" profiles
```

`--condition` selects an existing v2 source condition: `rich_control`, `core_fewshot_reference`, `compact_both`, `restored_legacy_examples`, `restored_revised_examples`, `restored_open_set`, or `restored_open_set_diagnostics`. This is an **input-content choice**, kept separate from the rendering profile. Default: `restored_open_set`.

## Persisted data

| Artifact | Contents |
|---|---|
| `policy-packs/<hash>.json` | Losslessly segmented guidance; typed judgments and criteria; independently authored demonstrations and labels. Shared by cases rather than maintained in copies. |
| `instances/case-....json` | Policy-pack reference, exact configuration, supplied trusted context, exact assessed material, and original request provenance. |
| `payloads/<profile>/...json` | Serialized output to inspect or later submit through the correct transport. No experiment labels or fixture names added. |
| `receipts/<profile>/...json` | Source, content and wire hashes; example assignments and label derivations; guide destinations; omissions; byte counts and limitations. |
| `evaluation-only.json` | Test identifiers, expected outcomes, diagnostic annotations and rationales. The core compiler never receives this object. |
| `manifest.json` | Compiler/assets/source/profile identities, complete request inventory and physical request counts. No inferred token counts or performance claims. |

The sample files under `examples/` show real compiled synthetic project inputs, not just a proposed schema. The source snapshot contains no API key.

## Rendering profiles

| Profile | Intervention |
|---|---|
| `jev-legacy` | Reconstruct the exact imported `{model,state,questions}` body, including original ordering and state-based examples. |
| `jev-question-examples` | Resolve example contexts/profiles and place labeled examples in `questions.<id>.instructions.examples`. |
| `jev-criteria-examples` | The same per-question evidence, grouped under `criteria.<option>.examples`, `criteria.true.examples`, or `criteria.false.examples`. |
| `jev-criteria-factored` | Criterion-local examples with explicitly shared per-question context defaults/reference tables; a separate size/indirection comparison. |
| `jev-structured-guide` | Criterion-local examples and the same guide values rendered as an array of named source sections. |
| `jev-question-guide` | Criterion-local examples and original guide blocks in each question's instructions. All blocks remain by default. |
| `jev-criteria-single` | Same native questions individually, with state repeated per request; a batching/cost comparison, not a cascade. |
| `chat-criteria` | Provider-neutral system/user message plan plus an answer JSON schema. Requires a provider-specific transport adapter before live use. |

Resolved examples retain their original teacher answer profiles, semantic annotations, family descriptors and corpus role text, not just a naked payload and a guessed label.

The main controlled placement comparison is **question-local versus criterion-local**. It holds the resolved per-question example contents and labels fixed. Legacy versus either local variant additionally changes profile resolution and default/profile lookup resolution and grouping. Factoring, guide relocation and splitting are separate interventions. Do not collapse these into one claimed "format improvement."

Criterion-local placement is **not assumed to be cheaper**. It repeats examples per independent question; full inline context is especially costly in serialized bytes. The factored profile makes that tradeoff explicit. Receipts report bytes and copies, with tokens set to `null` until measured from the provider.

## Library integration

```javascript
import fs from 'node:fs/promises';
import {compileInferenceJobs} from './src/index.mjs';

const sourceRequest = JSON.parse(await fs.readFile('./examples/source-request.json', 'utf8'));
const profile = JSON.parse(await fs.readFile('./profiles/jev-criteria-examples.json', 'utf8'));
const {jobs, receipt} = compileInferenceJobs(sourceRequest, profile);

// This function does not call any provider. Submit jobs through the existing
// lock / durable reservation / version guard / response-persistence pipeline.
// Only jobs with transport === 'typesafe-systemone' are native Jev requests.
console.log(jobs.map(job => ({hash:job.requestHash, bytes:job.requestBytes})));
console.log(receipt);
```

For standalone source migration:

```bash
node cli.mjs import --input examples/source-request.json --out imported-document.json
node cli.mjs render --input imported-document.json \
  --profile profiles/jev-criteria-examples.json --out separately-rendered
```

`src/index.d.mts` exposes typed declarations. `schemas/` holds JSON Schema 2020-12 contracts. No model must understand the compiler's IR: adapters render only the intended native input values, not internal hashes/source spans/audit metadata.

## Scope and safeguards

The importer **decomposes structure without summarizing policy meaning**. It preserves Markdown blocks, structured guide values, configuration, question definitions and literal case material. It does not claim to automatically translate arbitrary prose into logically equivalent rules. A new semantic interpretation needs a reviewed, versioned source or importer, not a rendering side effect.

There are no runtime decoders, automatic field filtering, label-dependent example retrieval, hidden thresholds, confidence multiplication, or verdict repair. The optional unknown/mixed diagnostic types remain independent questions and cannot gate the attack verdict.

Rule removal is off by default. A custom profile can enumerate `omitGuideBlocks` or (with a question-local guide) `questionGuideOmissions`, with a reason per block. This additionally requires `--allow-policy-omissions`; declared `requiredGuideBlocks` cannot be removed. The importer does not infer an exhaustive dependency graph from prose. Such omissions are information-selection experiments, not automatically certified semantic equivalents. Oversized requests fail rather than being truncated.

Actual dependent questions are represented with `dependsOn`. The renderer refuses to pretend a simultaneous batch implements a dependency. Explicit staged execution must be implemented by the caller before such a document can be rendered.

The schema distinguishes application configuration, supplied context/provenance and assessed material. It does not authenticate a caller's records, make an LLM obey trust boundaries, or turn an encoded/string delimiter into a security barrier. Nested source `role` fields remain data values, not actual chat roles.

Uncertain demonstration outcomes never become Noul `false` merely to fill an array. The explicit importer maps authored `attack/benign` to injection `true/false` and authenticated integrity states to poisoning `true/false`; each derived authoring label is recorded. Missing/uncertain outcomes and ungraded Score examples remain contextual references, without fabricated criterion labels.

Native Jev answers and generated JSON answers have separate normalizers. A generated numeric judgment is not relabeled as a native Jev posterior, and no probability distribution or confidence value is invented. The generic chat profile's joint generated reply is also not equivalent to Jev's independent-question execution semantics.

See [ARCHITECTURE.md](docs/ARCHITECTURE.md), [VENDOR-ALIGNMENT.md](docs/VENDOR-ALIGNMENT.md), and `validation/receipt.json` for details.
