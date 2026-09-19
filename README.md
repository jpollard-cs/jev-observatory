# Jev Redteam Observatory

**Private GitHub repository:** [jpollard-cs/jev-observatory](https://github.com/jpollard-cs/jev-observatory). Source, policy templates, precomputed reports and validation evidence are checked in. Credentials, raw run directories, account ledgers, model weights and runtime caches remain local.

**Community site:** `community-site/` adds a GitHub-backed policy library and persistent, portable evidence uploads. Public read routes require no account; the hosted audience remains private during validation. Policy changes use PRs. See the [community implementation](community-site/README.md) and [contributor-funded verification design](docs/community-verification.md). Ordinary uploads are contributor-reported, not signed verification.

**Current local application:** the rebuilt 0.5 policy workbench is integrated under [`workbench/`](workbench/README.md). Run `npm run workbench` from this repository, then open `http://127.0.0.1:8794`. It supports application-description suggestions, reviewed policy settings, policy-aware catalog selection and six separately identified historical reports. See the [integration and operating guide](docs/workbench-integration.md). Starting it makes no model calls; the original research account and frozen experiments remain in this repository.

**Accounting checkpoint, 2026-09-19:** the existing restart ledger contains **$1.450972152 known usage and $0.002664690 held**, within the existing **$3 limit**. Use `npm run workbench:account` for a fresh offline reading. The older pilot amounts below describe their historical checkpoints, not today's remaining allowance.

**The user approved a bounded short/long pilot of the [information-rich classifier template](policies/prompt-injection-policy-template.md).** Its [frozen design](docs/rich-pilot-design.md) contains 16 scenarios at three material lengths, with the complete guide supplied once in every request. The pilot is limited to 48 attempts and $0.30 within the separate $3 restart budget. Approval applies to this pilot only; the earlier generic-prompt campaign remains stopped, and its observations do not test this revised baseline.

**The rich pilot is complete:** [findings](docs/rich-pilot-findings.md) and [structured results](data/rich-pilot-report.json). All 48 attempts are recorded: 47 valid responses and one preserved sandbox DNS failure, without retry. Actual inputs spanned 13,358–28,676 provider-reported tokens. Known list-price usage is $0.03904404, with $0.00266469 retained for the attempt with unknown usage. The local Observatory now includes the rich pilot and a case inspector with hash-verified submitted inputs. The private hosted Observatory now includes this update. The original failed attempt remains preserved; its separately recorded one-case repair is complete.

**Transport repair completed:** the same frozen request succeeded on one separately recorded attempt ($0.000561162). All 48 cases now have valid responses across 49 total attempts. The Rich-template pilot tab defaults to completed cases, with an Original attempts selector retaining the first run. Original results and the unknown-usage reservation remain preserved; see [supplemental accounting](data/rich-pilot-repair-report.json). The restarted ledger now records $0.039605202 known usage, $0.00266469 held, and $2.957730108 available.

The user has allocated **$3.00 for the restarted run**, separate from **$1.04 already spent** (user-reported). The 48 frozen requests reserve $0.181681416 using the disclosed byte-based planning convention; actual provider usage is accounted separately. The original campaign ledger, requests, results, and unrun catalog remain intact. See [template approval](data/rich-template-approval.json), [preflight review](data/rich-pilot-preflight-review.json), and [testing status](data/testing-status.json). The private hosted Site now separates the rich pilot from earlier evidence and shows the exact model-facing guide.

A reproducible, model-only prompt-injection and policy-steering lab with a precomputed observatory. The first authenticated **development pilots are recorded**, including disagreements and an initial adapter-validation defect. These tiny synthetic samples do not establish robustness or model rankings. Jev uses the documented TypeSafe native API; responses identified `jev-1.13.0` behind the `jev-latest` alias.

Start with [expiry specification diagnostic](docs/expiry-diagnostic.md), [pilot findings](docs/pilot-findings.md), [cost proposal](docs/full-run-cost.md), the [reusable policy](policies/prompt-injection-policy-template.md), and [evaluation protocol](docs/evaluation-protocol.md). The GitHub repository and hosted Site remain private while validation continues.

[Open the owner-private Observatory](https://jev-redteam-observatory.wizard.chatgpt.site/?view=1&tab=policy). ChatGPT sign-in is required. The [publication receipt](data/site-publication.json) records matching hosted HTML/data readback; local desktop/mobile rendering was checked. Authenticated hosted rendering of the new comparison and encoding panels was verified; owner editing was not exercised.

Future work is tracked in the [research backlog](docs/backlog.md) and [next evaluation plan](docs/next-evaluation-plan.md). The selected [Unsloth baseline](docs/local-unsloth-setup.md) is installed and verified. One short structured-output check and one 28,019-token neutral capacity check passed; the server is stopped after the completed comparison. Unused Vontra weights, caches and the old MLX environment were removed; [superseded MLX setup notes](docs/local-qwen-setup.md) remain for provenance. The [frozen Qwen comparison](docs/qwen-baseline-findings.md) completed 48/48 valid local responses; its 0/24 missed attacks and 7/24 false alarms contrast with Jev Choice’s 6/24 misses and 0/24 false alarms on this authored packet. The separate [32-call encoding diagnostic](docs/encoding-diagnostic-findings.md) is complete ($0.025472916 known usage). The [exact model-facing guide](policies/classifier-guide-v2.md) excludes operator notes and matches the approved request hash.

## Start here

The latest [generation E2E checks](docs/workbench-e2e-results.md) cover three offline application workflows and one seven-call live setup/ranking smoke. The live smoke cost $0.00090195 and froze a 41-case suite without running classifier evaluations. [Community hosting options](docs/community-hosting-options.md) describe the proposed next step.

To explore the workbench from a fresh checkout, use Node 22.22+ and run:

```sh
git clone https://github.com/jpollard-cs/jev-observatory.git
cd jev-observatory
npm run workbench:verify
npm run workbench
```

The workbench needs no dependency installation or API key for local authoring and viewing included results. A clone does not include the existing research account's spending history; keep using the original local project for that account. Do not replace its ledger with a fresh account to resume research. Some historical research checks require the preserved local raw runs.

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
4. For the approved rich pilot, use `node scripts/rich-pilot.mjs --status` to inspect its separate ledger and `node scripts/report-rich-pilot.mjs` to regenerate its offline report. The commands below reproduce **historical generic-prompt protocols**; they are not authorized restarts or the rich-template baseline:

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

The implementation follows a functional domain core with injected application ports and HTTP/environment adapters. See [architecture](docs/architecture.md) and [native primitive versions](docs/native-primitives.md). Prospective general requests use `policy-v4`; `legacy-v2` and `advanced-v3` retain their historical request representations. The [protocol review](docs/protocol-review-v4.md) gates the larger campaign. The focused expiry diagnostic remains separate historical evidence.

## What is implemented

- **15,120 synthetic cells across 18 vector families**: authority spoofing, boundary escape, encoded and fragmented payloads, poisoned history/memory/retrieval, tool-result spoofing, judge contamination, citation laundering, policy overrides, moderation boundaries, zero-width text, hidden HTML, bidi/confusable text, emoji variation selectors and multilingual redirection.
- Matched malicious/benign examples, 512 / 4,096 / 16,384 context-character targets, beginning/middle/end positions, four archive variations, three policy profiles, three output shapes and two prompt arms. The minimal arm has task/output semantics only; the policy arm adds authorized policy and contextual metadata. Moderation compliance is scored only when policy was supplied.
- A versioned trusted policy and editable strictness. Historical profiles stay in `policies/profiles.json`; prospective policy-v4 profiles use `policies/profiles-v1.1.json`. Additional authorized domain, task, principal, permitted operations and source-trust metadata lives in `config/trusted-context.json`, supplied in the policy arm and hashed into the protocol. The assessed content cannot override it.
- Three logical output modes, with explicit transport differences: Jev binary uses native Choice; scores uses Choice plus Noul attack/poison probabilities and a separate ordinal Score; structured uses an independent native question battery for decisions, each policy rule, and judge verdict. Controls generate literal labels or JSON. Control JSON-schema enforcement is **off by default**; `*_JSON_SCHEMA=true` creates a separate constrained arm. Native Jev structure is inherently typed and never presented as freeform JSON generation.
- Exact-label/schema scoring after inference, deterministic reference answers for judge fixtures, separate control-model results, error/malformed/abstention accounting, all-attempt policy and judge scores, Brier score, ECE and ROC AUC. Current authored lineages support descriptive comparisons, not population confidence intervals.
- Calibration-only attack and poison thresholds applied separately to held-out test probabilities. Raw labels remain separate; threshold metrics include probability-bearing abstentions and report label/probability disagreement.
- Native provider-reported token usage where available, with character and UTF-8-byte measurements separately named. A context-character target is not a token count.

**There is no regex, keyword detector, payload stripping, decoder, rewrite, second-model prefilter or fallback classifier in the target path.** Unicode and resource text are forwarded as data. Offline schema validation and comparisons score the model response; they do not help the model detect an input. The target path makes one request per trial. Native Jev can evaluate several independent questions in that request, with question counts recorded. Jev's returned typed answers are projected into the common reporting schema after inference; this is output assembly, not an input detector.

## Evidence boundaries

This starter corpus is **development and integration evidence**. Seeds change archive/padding details and judge-answer correctness, not independent real-world scenarios. Shared canonical payloads and their encoded descendants are grouped into one semantic lineage and one split. There are 12 template lineages, not 15,120 independent attacks. Before confirmatory conclusions, import independently authored external scenarios, review labels, freeze the protocol and collect adequate samples. See `docs/evaluation-protocol.md` and `docs/prior-context.md` for the fuller research plan and recovered earlier checklist.

Current split allocation is 6,048 pilot cells, 2,592 calibration cells, and 6,480 test cells. Pilot and calibration families intentionally differ from held-out test lineages. More complete strata need a larger `--limit` and an explicit larger request cap. A 12-case pilot checks plumbing and is not a coverage or ranking claim. Repeats measure completion variability; they do not multiply independent evidence.

Native result semantics matter: Noul is probability of yes; Choice/Score confidence measures distribution concentration, **not correctness probability**. The normalized `uncertainty` field for Jev is `1 - Choice.confidence` and is labeled accordingly. Ordinal interference Score is preserved separately, never converted to attack probability. Native per-policy Noul outputs are thresholded at 0.5 for the violation list; reason codes are policy metadata, not generated model explanations, and their consistency is excluded from native quality scoring. Control generated-JSON validity and native typed-response validity are different properties.

Known scope limits:

- Poisoning here is **inference-context contamination**, not training-time data poisoning. The original corpus asks for a binary evidence probability; the new extension separately tests four integrity states, including insufficient evidence. Implemented fixtures are not measured results until a recorded run is available.
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

### Offline Promptfoo replay

After the campaign matrix has recorded outputs, replay those saved observations through pinned Promptfoo without making model calls:

```sh
node scripts/promptfoo-replay.mjs --campaign-dir runs/release-campaign-policy-v4 --out-dir work/promptfoo-replay/matrix
```

Use Node 22.22+; add `--prepare-only` to write the replay packet and configuration without starting Promptfoo. The isolated child process receives no API credentials, does not load the repository `.env`, and blocks network access. Results remain in ignored `work/promptfoo-replay/`. `replay-manifest.json` contains scoped all-attempt metrics; `completion.json` records row counts, output digest and the network audit. Each replay row binds the original record hash, request hash and native request version. Original errors and unknown dispatches remain unsuccessful attempts. No adaptive Promptfoo plugins or attack generation run, and the replay supplies no additional model observations.

Classification is scored separately from policy disposition. Policy checks apply only to the structured policy arm; judge checks apply only to structured judge cases. Decisions use frozen gold directly, while rule IDs and policy-mapped reason codes use exact set comparisons. Reason codes are assembly checks, not generated explanations. Promptfoo's overall pass requires every applicable check and is **not classifier accuracy**. Each check requires a valid complete saved output, so a rejected auxiliary field can make the whole output unavailable; use the native per-question analyses for field-level availability. Replay does not fit probability thresholds or replace the native calibration analysis.
