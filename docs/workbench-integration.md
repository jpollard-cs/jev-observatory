# Policy Workbench integration · 2026-09-19

The canonical development copy is `workbench/` in this repository. The supplied 0.5 rebuilt release was integrated additively. The Desktop copy, its running server, the original research harness, policy versions, frozen requests, run evidence and spending history are preserved. The owner-private hosted Site remains the previously published version; this integration is a local authoring and evaluation application.

## Start and verify

From the repository root:

```sh
npm run workbench
```

Open **http://127.0.0.1:8794**. Port 8794 keeps the integrated application separate from the existing Desktop process on 8792. Stop this server with Ctrl-C in its Terminal. The application requires no additional npm dependencies. Node 22.22+ is already required by the parent repository.

If Node is not on PATH, the runtime on this Mac can launch it directly:

```sh
cd /Users/jordan/Documents/Codex/2026-09-16/i-g/outputs/jev-redteam
/Users/jordan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/workbench.mjs start
```

Offline checks:

```sh
npm run workbench:verify
npm run workbench:test
npm run workbench:account
```

The last command checks the original project's source bindings and reads its ledger. It does not read `.env`, contact the provider or change account authorization. The import checkpoint was **4,611 events, $1.450070202 known usage and $0.002664690 held**, leaving **$1.547265108** within the existing $3 envelope. This is local allowance, not a verified provider balance. No new paid evaluation or setup smoke was performed during integration.

## What the changes are for

The product now starts with the application rather than an intimidating list of test switches:

1. **Describe:** explain what the application reads, the task it performs, and prohibited behavior. A model can propose reviewed policy settings from this text. The initial description is shared with the later selection context.
2. **Review rules:** inspect the suggested differences and select the changes to apply. Descriptions and model suggestions do not grant source authority, enable tool privileges, supply test answers or automatically modify the draft.
3. **Choose tests:** use the current policy, application description, declared surfaces and capabilities to prioritize applicable coverage groups. Required boundaries, benign contrasts, dependencies and some exploration survive low model relevance scores.
4. **Authorize a run:** review the exact prepared requests, source identity, number of calls and spending limit. Previewing, typing, loading a key or copying a command does not run an experiment.
5. **Inspect results:** compare native observations, expected answers, missing fields and actual account usage. An archived result does not validate an edited draft.

This separation supports fair experiments: intended policy can change while historical inputs, results and gold remain bound to their own versions. Budget affects admitted test groups, not the interpretation of outcomes; unused headroom remains unused.

## What “generative” and “adaptive” mean here

| Capability | Present behavior |
|---|---|
| Start from a free-text application description | Implemented. Optional setup advice uses one native request with 16 Choices over reviewed options. Owner-selected changes are applied with guarded undo. |
| Policy-aware evaluation selection | Implemented. Jev can rank all 32 coverage groups in the current 60-case catalog. Code allocates complete groups while retaining required checks and their controls. |
| Adjust selection when policy/context changes | Draft changes invalidate stale advice and plans. The operator explicitly refreshes model advice; typing makes no paid calls. |
| Automatically infer new suggestions continuously while editing | Not implemented. This remains a possible authoring improvement, with a visible stale state and bounded, explicitly enabled refresh behavior. |
| Generate new scenario text and gold from any application | Not implemented. New cases require a separate reviewed generation/annotation workflow; selection does not fabricate test answers. |
| Rank all 15,184 original matrix/extension cells with the current advisor | Not implemented. The original replay catalog remains a separate preserved workflow. |

The handoff supplies the implementation and its design boundaries, not a transcript of every decision made in ChatGPT. These descriptions are grounded in the inspected source and verified UI. No live quality, calibration or model-competence claim follows from software tests.

## Existing account and credentials

When ready for a separately authorized provider run, select **Original research project — preserve its ledger** and the repository root above in **Local Jev connection**. The application can explicitly read that project's `.env` or accept a session key; this integration copies neither credentials nor account files into `workbench/`. A pasted server-session key is not inherited by an independent CLI process.

Keep using the original account for this research. A new standalone account is for an actually separate authorization, not a way to bypass spent money or unresolved holds. The existing pinned model and historical pricing constants remain unchanged. A live setup smoke and useful ranking quality are still unmeasured.

## Review and validation

- Verified every one of the 391 supplied manifest entries and all 38 file payloads in the small changes archive against the full archive.
- Reconstructed the 356-file parent tree from the bundled 0.4.1 manifest and reverse delta. This verifies the supplied lineage internally; it is not an independently obtained 0.4.1 archive.
- Ran 326 offline workbench/compiler tests successfully with real loopback HTTP and injected fake transports.
- Re-ran the source audit: 176 vendor files and nine data files unchanged, 360 exact target-request comparisons, 360 expectation comparisons, and 6,224 historical display rows bound to their source values.
- Ran direct Chromium browser acceptance on the Mac: **242/242 checks**, across 88 conditions and 6,224 displayed rows. This used real ES modules and the served CSP without the prior API bridge. The only setup call used synthetic transport and an explicitly fake key/account; real provider calls were zero.
- Verified the integrated copy's 61 required source bindings against the original research project, and inspected the integrated UI in the Codex browser.
- Completed the full **15,184-job synthetic replay**, including a 131-call partial run, 15,053 new calls on resume and **zero additional calls** when resuming the completed run. All 30,368 accounting events reconciled. This Mac check took about 15.3 minutes, including local persistence and validation; it is not provider latency or model performance.
- Rehashed all **38,986 original run, policy and harness files**: zero changed, missing or added files. The original account ledger remains unchanged.

The browser suite initially failed because it assumed no original research project was present. On this Mac the connection form correctly defaults to the existing project, so the test must explicitly select its standalone synthetic account before requesting account creation. Only that test fixture and this copy's README were adjusted inside the imported release; production source and target request construction stay unchanged. The original manifest is retained in `workbench/provenance/imported-0.5-file-manifest.json`; the current manifest records the integration delta.

Fresh logs, evidence-preservation checks and the full-size replay result are recorded in [the integration receipt](../data/workbench-integration.json). Historical release receipts remain historical. None of these software checks is a new Jev model observation.

## Development boundaries

Use the repository copy for future development. Preserve old releases when resuming source-bound frozen plans; do not copy a new compiler or module into an old run directory. The prior research scripts remain available for their exact protocols. The new root launcher does not default to a paid command.

The imported runtime remains a self-contained package with its existing domain, compiler, planner, ledger/transport and browser layers. The root adapter provides discoverability and account inspection without rewiring those contracts. `workbench/runtime/`, credentials, node modules and Python caches are ignored. Original Git history and current uncommitted work are not reset.
