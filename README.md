# Redteam Observatory

[Open the Observatory](https://redteam-observatory.wizard.chatgpt.site) · [Browser workspace](https://redteam-observatory.wizard.chatgpt.site/workspace) · [Community evidence](https://redteam-observatory.wizard.chatgpt.site/community)

A policy workbench and research observatory for prompt injection, source integrity, policy steering and model judgments. Describe an application, review its rules, choose tests and inspect exact requests and recorded evidence. The current execution adapter uses Jev through TypeSafe's native API.

## Use the browser workspace

Policy authoring, coverage planning, request inspection, archived results and downloads need no API key or model calls. Optional setup suggestions, coverage advice and evaluations require your own Jev key, sign-in and explicit review of the requests and spending allowance. Results start private; sharing them is a separate action.

The hosted service handles your key transiently when dispatching authorized requests. It does not save the key to browser storage, persistent server storage or exports. The tab session expires after 30 minutes and is forgotten on reload or disconnect. See [hosted execution](docs/hosted-execution.md) and the [current credential workflow](docs/inline-assisted-workflow.md) for accounting, resumption and operating limits. Hosted execution currently uses ChatGPT sign-in.

Public community evidence must come from owned, saved hosted policy evaluations. The service assembles the frozen plan and all observations; arbitrary uploaded result files are rejected. Reports are **host-observed**, not provider-signed or proof of no regression. External/local evidence needs repository review. See the [community implementation](community-site/README.md) and [verification design](docs/community-verification.md).

## Run locally

Use Node.js 24 or later for all components. The local workbench needs no dependency installation or API key for authoring and viewing included results:

```sh
git clone https://github.com/jpollard-cs/jev-observatory.git
cd jev-observatory
npm run workbench:verify
npm run workbench
```

Open `http://127.0.0.1:8794`. Starting the server makes no model calls. See the [local integration guide](docs/workbench-integration.md) for execution options and account boundaries.

To develop the browser/community application locally:

```sh
npm ci --prefix community-site
npm run build --prefix community-site
npm run dev --prefix community-site
```

Open `http://127.0.0.1:8795`. Node 24 is required by its SQLite development adapter. The [community README](community-site/README.md) describes local preview identities, storage and deployment requirements. Rehosting requires an appropriate trusted identity adapter and persistent storage; a source checkout does not copy hosted private runs or uploads.

## Evidence and limitations

The workspace includes six separately identified historical experiments. These authored, dependent synthetic cases are development evidence: they do not establish real-world robustness, rare-event safety or a general model ranking. Model judgments, code-derived dispositions and software tests remain distinct.

The recorded [setup and coverage smoke](docs/workbench-e2e-results.md) made seven live requests and froze a 41-case suite; it did not run classifier evaluations. Follow the [evaluation protocol](docs/evaluation-protocol.md), [native primitive semantics](docs/native-primitives.md) and [model comparison boundaries](docs/model-adapters-and-benchmarks.md) when interpreting or extending results.

Published reports, fixtures, source bindings and validation records are checked in. Raw private runs, account ledgers, credentials, model weights and runtime caches are excluded. Existing research-account history must remain with its original local account; a fresh checkout is not a reset or new spending authorization. Imported provenance archives preserve earlier versions and are not current installation instructions.

The [research history](docs/research-history.md) preserves earlier protocols, approval checkpoints and publication notes. Those historical notes describe their recorded state, not current deployment status or permission to resume a paid experiment.

## Develop and contribute

Run the automated checks without model credentials:

```sh
npm test
npm run workbench:test
npm ci --prefix community-site
npm run build --prefix community-site
npm test --prefix community-site
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for policy and evidence changes, and [SECURITY.md](SECURITY.md) for private vulnerability reporting. Paid model calls are not part of CI. The optional research Promptfoo tooling has its own root lockfile and [dependency advisory assessment](docs/dependency-audit.md).

Main source areas: `workbench/` contains the shared policy compiler, planners and local interface; `community-site/` contains the browser and hosted service; `harness/`, `cases/`, `policies/` and `scripts/` contain research protocols; `data/` contains published reports; and `site/` preserves the historical research presentation.

## License status

No repository-wide open-source license has been selected. Public source availability does not establish a license grant. Dependency and copied-runtime licensing remains separate; this repository does not redistribute model weights.

Hosted evidence now supports [signed receipts and independent offline verification](docs/signed-receipts.md), with pinned core coverage kept separate from correctness or regression claims.
