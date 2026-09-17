# Jev Redteam Observatory

A reproducible, model-only prompt-injection and policy-steering lab with a precomputed observatory. The first authenticated **development pilots are recorded**, including disagreements and an initial adapter-validation defect. These tiny synthetic samples do not establish robustness or model rankings. Jev uses the documented TypeSafe native API; responses identified `jev-1.13.0` behind the `jev-latest` alias.

Start with [expiry specification diagnostic](docs/expiry-diagnostic.md), [pilot findings](docs/pilot-findings.md), [cost proposal](docs/full-run-cost.md), the [reusable policy](policies/prompt-injection-policy-template.md), and [evaluation protocol](docs/evaluation-protocol.md). GitHub publication is deferred; the local repository and owner-private Site are the current deliverables.

[Open the owner-private Observatory](https://jev-redteam-observatory.wizard.chatgpt.site/?view=1&tab=policy). ChatGPT sign-in is required. The [publication receipt](data/site-publication.json) records matching hosted HTML/data readback; local desktop/mobile rendering was checked. Authenticated hosted rendering and owner editing have not been verified in this browser session.

## Start here

Use Node **22.22+**, preferably Node 24. The built-in harness has no dependencies; promptfoo is pinned to **0.123.0** with a lockfile.

```sh
npm ci
npm test
npm run corpus
npm run plan
npm run promptfoo:prepare
npm run aggregate -- --out work/design-only-report.json
```

These commands make **no inference calls**. The plan shows the exact case IDs, split, repeats, request count and cost cap. `npm ci` downloads packages. The optional `npm run corpus -- --write-cases` writes the expanded corpus into ignored `cases/generated/`.

1. Copy `.env.example` to `.env` if it does not already exist. `.env` is automatically loaded by both live runners and is ignored by Git. Do not commit keys.
2. Set `TYPESAFE_API_KEY`, `JEV_INPUT_USD_PER_MILLION`, and `JEV_OUTPUT_USD_PER_MILLION`. Jev uses `POST https://api.typesafe.ai/v1/systemone` with `state`, `model: jev-latest`, and typed `questions`. Optional `JEV_BASE_URL` and `JEV_MODEL` overrides are available for an authorized compatible deployment. Jev is **not** an OpenAI Chat Completions model.
3. Either use fresh Luna/Terra Codex subagents via [the blinded panel workflow](docs/agent-controls.md), or configure independent direct-API identities. The completed control pilot used subagents without a separate API key. Their runtime is different, so results are separate from native API metrics.
4. Run a bounded pilot:

```sh
JEV_INPUT_USD_PER_MILLION=0.042 JEV_OUTPUT_USD_PER_MILLION=0 npm run pilot -- --live --models jev --split pilot --limit 12 --repeats 1 --max-requests 12 --max-cost-usd 0.05
```

Or evaluate the same reviewed cases through promptfoo:

```sh
npm run promptfoo:eval -- --models jev --split pilot --limit 12 --max-requests 12 --max-cost-usd 0.05
```

The runners send requests serially, do not retry, enforce a request cap, and reserve cost before every request. Control Chat Completions calls receive an output-token cap. The documented native TypeSafe endpoint has no configurable output-token cap; use provider account limits for a hard monetary ceiling. Pricing must be explicit, including `0` for a known free endpoint. The byte-based input reservation is conservative for ordinary byte-token APIs, **not a guarantee about provider billing or hidden reasoning charges**. Usage exceeding a reservation stops subsequent calls. `.env` and raw request/response material stay local in ignored paths. The promptfoo wrapper disables telemetry, update checks and remote generation and places its state inside `.promptfoo/` in this repo.

Export one or more completed runs:

```sh
npm run aggregate -- --input runs/RUN_ID/raw.jsonl
# Include calibration and test together to fit thresholds on calibration only:
npm run aggregate -- --input runs/CALIBRATION_RUN/raw.jsonl --input runs/TEST_RUN/raw.jsonl
node scripts/sync-site.mjs
```

`data/report.json` publishes aggregate measurements, denominators, uncertainty, protocol hashes and limitations. It never contains prompts, responses, keys, endpoint URLs or raw error bodies. The site reads this precomputed report; it has no live model access. `sync-site` may also be run with `node scripts/sync-site.mjs` if no package alias is configured.

The implementation follows a functional domain core with injected application ports and HTTP/environment adapters. See [architecture](docs/architecture.md) and [native primitive versions](docs/native-primitives.md). New general requests default to `advanced-v3`; historical pilot requests remain reproducible with explicit `legacy-v2`. The focused expiry diagnostic is a separate version, not a measurement of the whole advanced-v3 suite.

## What is implemented

- **15,120 synthetic cells across 18 vector families**: authority spoofing, boundary escape, encoded and fragmented payloads, poisoned history/memory/retrieval, tool-result spoofing, judge contamination, citation laundering, policy overrides, moderation boundaries, zero-width text, hidden HTML, bidi/confusable text, emoji variation selectors and multilingual redirection.
- Matched malicious/benign examples, 512 / 4,096 / 16,384 context-character targets, beginning/middle/end positions, four archive variations, three policy profiles, three output shapes and two prompt arms. The minimal arm has task/output semantics only; the policy arm adds authorized policy and contextual metadata. Moderation compliance is scored only when policy was supplied.
- A trusted baseline policy and editable strictness in `policies/profiles.json`. Additional authorized domain, task, principal, permitted operations and source-trust metadata lives in `config/trusted-context.json`, supplied system-side in the policy arm and hashed into the protocol. The assessed content cannot override it.
- Three logical output modes, with explicit transport differences: Jev binary uses native Choice; scores uses Choice plus Noul attack/poison probabilities and a separate ordinal Score; structured uses an independent native question battery for decisions, each policy rule, and judge verdict. Controls generate literal labels or JSON. Control JSON-schema enforcement is **off by default**; `*_JSON_SCHEMA=true` creates a separate constrained arm. Native Jev structure is inherently typed and never presented as freeform JSON generation.
- Exact-label/schema scoring after inference, independent reference answers for judge fixtures, model-vs-model control comparisons, error/malformed/abstention accounting, all-attempt policy and judge scores, Brier score, ECE, ROC AUC, and family-cluster bootstrap intervals when enough clusters exist.
- Calibration-only attack and poison thresholds applied separately to held-out test probabilities. Raw labels remain separate; threshold metrics include probability-bearing abstentions and report label/probability disagreement.
- Native provider-reported token usage where available, with character and UTF-8-byte measurements separately named. A context-character target is not a token count.

**There is no regex, keyword detector, payload stripping, decoder, rewrite, second-model prefilter or fallback classifier in the target path.** Unicode and resource text are forwarded as data. Offline schema validation and comparisons score the model response; they do not help the model detect an input. The target path makes one request per trial. Native Jev can evaluate several independent questions in that request, with question counts recorded. Jev's returned typed answers are projected into the common reporting schema after inference; this is output assembly, not an input detector.

## Evidence boundaries

This starter corpus is **development and integration evidence**. Seeds change archive/padding details, not independent real-world scenarios. Shared canonical payloads and their encoded descendants are grouped into one semantic lineage and one split. There are 12 template lineages, not 15,120 independent attacks. Before confirmatory conclusions, import independently authored external scenarios, review labels, freeze the protocol and collect adequate samples. See `docs/evaluation-protocol.md` and `docs/prior-context.md` for the fuller research plan and recovered earlier checklist.

Current split allocation is 6,048 pilot cells, 2,592 calibration cells, and 6,480 test cells. Pilot and calibration families intentionally differ from held-out test lineages. More complete strata need a larger `--limit` and an explicit larger request cap. A 12-case pilot checks plumbing and is not a coverage or ranking claim. Repeats measure completion variability; they do not multiply independent evidence.

Native result semantics matter: Noul is probability of yes; Choice/Score confidence measures distribution concentration, **not correctness probability**. The normalized `uncertainty` field for Jev is `1 - Choice.confidence` and is labeled accordingly. Ordinal interference Score is preserved separately, never converted to attack probability. Native per-policy Noul outputs are thresholded at 0.5 for the violation list; reason codes are policy metadata, not generated model explanations, and their consistency is excluded from native quality scoring. Control generated-JSON validity and native typed-response validity are different properties.

Known scope limits:

- Poisoning here is **inference-context contamination**, not training-time data poisoning. Binary poison probability plus uncertainty is implemented; four-state integrity labels are not yet implemented.
- Multi-message contexts are fixed snapshots. Adaptive stateful conversations, live tools, memory writes, arbitrary resource ingestion and actual tool execution need separate adapters.
- Hidden HTML and invisible Unicode are evaluated as source text. Pixel-rendered negative-space, image/audio/video attacks need multimodal transports and matching benign controls.
- Judge fixtures use deterministic answer/reference equality with correctness crossed against injected candidate explanations. Subjective human-aligned judge quality needs blinded independent human labels and disagreement adjudication; Jev never supplies its own gold labels.
- The small moderation seed set is a strictness-control test, not a comprehensive safety-category benchmark.
- Paired cells permit authorized steering analysis; sparse or incomplete pilot cells do not establish a causal steering effect. The minimal and policy arms change both policy and extra context, so additional isolated context ablations are needed to attribute their individual effects.
- Zero observed failures do not establish safety. At a 0.1% target failure rate, **2,995 independent zero-failure trials** are needed for a one-sided 95% upper bound. Correlated transformations and repeated completions do not count as independent trials.

## Promptfoo exploration

`config/redteam-exploration.yaml` records verified optional plugin IDs (`indirect-prompt-injection`, `policy`) and static strategies (`basic`, `base64`, `rot13`). It is an **exploration template**, intentionally missing an attacker provider. Choose and budget an attacker before generation, review output, label it independently and freeze new lineages before evaluation. Generated attacks or LLM-generated grades never silently replace held-out gold. Adaptive `jailbreak:meta` and `jailbreak:hydra` need additional generation budgets and stateful-target support.

Promptfoo's primary eval configuration is generated locally by `npm run promptfoo:prepare`; its provider and post-hoc exact-reference assertion are in `harness/promptfoo-*.mjs`. The provider refuses unreviewed/generated cases and refuses inference without the explicit live flag and caps. Raw promptfoo output is ignored by Git.

Official references: [TypeSafe HTTP API](https://docs.typesafe.ai/api), [TypeSafe primitives](https://docs.typesafe.ai/primitives), [JavaScript providers](https://www.promptfoo.dev/docs/providers/custom-api/), [red-team configuration](https://www.promptfoo.dev/docs/red-team/configuration/), [indirect prompt injection](https://www.promptfoo.dev/docs/red-team/plugins/indirect-prompt-injection/), [strategies](https://www.promptfoo.dev/docs/red-team/strategies/). These describe integration behavior, not evidence about Jev's performance.

## Matched judge and contextual debugging pilots

The separate bounded runner binds the eight exact source cases from a frozen `work/agent-panel/` control packet, then evaluates 16 contextual-debugging cases across eight paired interventions. It sends only `policy`, `trustedContext` and `material` from each debugging fixture. Gold labels and changed-path annotations stay outside inference. Each request asks independent native decision, audit and decisive-reason questions. Audit probability and reason probabilities are projected at a disclosed 0.5 threshold; distribution concentration is not a probability of correctness.

```sh
# Offline plan; preserves existing reports:
node scripts/special-pilot.mjs
# Explicit live run; up to 24 requests, no retries:
JEV_INPUT_USD_PER_MILLION=0.042 JEV_OUTPUT_USD_PER_MILLION=0 node scripts/special-pilot.mjs --live --suite all --max-requests 24 --max-cost-usd 0.05
```

Results go to `data/special-pilot-report.json`; raw evidence goes to a separate ignored run directory. Existing reports are not overwritten. This report is not pooled with the main classifier matrix. Subagent controls retain their different runtime/batching conditions and are not represented as direct endpoint measurements. Price overrides above reflect the [2026-09-15 launch pricing](https://typesafe.ai/blog/introducing-system-one-models-and-jev); verify current pricing before future runs.

Native adapter v2 preserves rounded probability values and records their sum and weighted-score residuals instead of treating ordinary rounding as a schema failure. It retains successful-HTTP answers and usage even when a native type/domain check fails. Earlier runs remain unchanged; adapter versions are separated during aggregation.

## Repository map

`harness/` — target transport, prompts, schemas, corpus and metrics. `cases/` — reviewable synthetic fixtures. `policies/` and `config/` — authorized policy/context and frozen design. `scripts/` — offline generation, bounded execution, aggregation and site sync. `tests/` — split integrity, error accounting, threshold leakage, schema, provider and rare-event math tests. `data/` — sanitized published aggregates. `runs/` — private raw artifacts, ignored by Git. `site/` — static presentation. `docs/` — study plan and sources.
