# Jev / Redteam Observatory — reconciliation handoff

**Checkpoint:** after shipping `jev-admission-lab-v1`, before its live report has been received in this chat.

**Start here rather than reconstructing the project from ZIP filenames or chat summaries.** This packet is a review/checkpoint artifact, not a cumulative runnable checkout, a merge, a deployment, or permission to launch additional paid tests.

## 1. Where the authoritative state lives

Original workspace:

```text
/Users/jordan/Documents/Codex/2026-09-16/i-g
```

Original harness, policies, local run evidence and shared ledger:

```text
outputs/jev-redteam/
```

Most new experimental runner source lives in separately downloaded folders, normally on Desktop. The first 48-case patch used `install.py` to add files to the original project; the subsequent labs and compiler are standalone, with no install step. Standalone labs write their run evidence to the original project's `runs/` tree; compiler renderings stay under its own `rendered/` directory. Those locations are different and neither should be treated as the complete project.

Keep the original `.env` on the Mac. This packet does not include it, request it, or need it. The original archive excluded `.git`, so it cannot establish current branch/HEAD/working-tree status. No commits, merges, pushes or site changes have been performed from this ChatGPT work.

## 2. What is in this packet

- `source-bundles/`: all five delivered source distributions, unchanged.
- `reports/`: exact uploaded reports for the compact-48, 768-call variant lab, and 928-call boundary lab, stored under distinct protocol paths to avoid the repeated `report.json` filename collision.
- `reviews/`: previous result reviews, source audits and false-alarm casebook/evidence. They are historical analysis, not new inference records.
- `reference/`: selected exact original project source and website publication metadata, plus copied runner code for inspection. This is a deliberately partial reference, not a substitute working tree.
- `experiment-index.json`: protocol IDs, status, lineage, checksums, original locations and the pending admission plan identity.
- `website-state.json`: last archived publication identity and local source locations, explicitly not a current remote readback.
- `SOURCE-AUDIT.md` and `validation/inspection.json`: checks performed for this handoff only.
- `verify.py`: read-only verification of this packet's checksums. It does not import or execute the bundled runners, inspect `.env`, modify the project, contact a model, or publish anything.

The original 85 MB workspace archive is NOT duplicated here. Its exact hash and byte size are in the index. All original/newer raw local run folders and the shared ledger must be retained separately.

## 3. Experiment sequence

| Stage | Status known here | Purpose / caution |
|---|---|---|
| Historical rich pilot + separate one-request transport repair | Represented in original workspace and compact report ancestry | Preserve the failure, repair linkage and unresolved hold. Do not count repair as a new scenario. |
| `compact-single-pass-48-v1` | Uploaded complete report, 48 requests | Only shared guide changed; no primary detection gain, auxiliary regressions. |
| `prompt-variant-lab-v1` | Uploaded complete report, 768 physical requests | 16 conditions; `compact_both` restores rich sections 3/5/6. First-stage feature evidence is shared between downstream code/model comparisons. |
| `boundary-fewshot-v2` | Uploaded complete report, 928 physical requests | Revised examples, unknown/mixed diagnostic questions, new authored scenarios, selected repeats. All examples are still shared-state demonstrations in this experiment. |
| Policy Payload Compiler | Offline compilation reported by user | Canonical data and model-specific renderers. Rendered files are NOT API responses. Inline local examples were approximately 5x legacy wire size; no native-layout benefit has yet been established from them. |
| `consumer-admission-v1` | Prepared; live report not yet received here | 480 maximum calls. New explicit inspection/strict/contextual contracts with question-local versus criterion-local examples. Check actual Mac status; do not assume it has or has not run. |

The three completed reports contain 48 + 768 + 928 new physical requests. This sum does not include prior historical work and must not be presented as the total number of independent examples. The original 48 are 16 authored scenarios at three dependent lengths; extension scenarios, repeats and format comparisons are also dependent.

## 4. Key decisions and interpretation boundaries

1. **Attack detection, representation compliance and permission are different questions.** The old pilot explicitly allowed encoded samples for isolated inspection; `allow` referred to inspection, not admission to a production agent or permission to obey sample instructions. Its expected labels are locally authored, not taken from Promptfoo plugin scores.
2. **Do not relabel old experiments under the new stricter contract.** The admission experiment changes the policy and proposed operation and has separately authored expectation matrices. In strict admission, harmless prohibited encoding can properly produce benign + violation + block.
3. **Consumer context is relevant but is not an automatic exemption.** Topic relevance alone does not authorize an encoding. Contextual exceptions must match consumer-authorized task/field/representation/use. Material cannot grant itself authority. Shared defaults and bounded entry overrides are resolved by code; this experiment uses separate HTTP requests for unrelated entries, not shared-state batching.
4. **Unknown/mixed technique is not a fourth attack verdict.** Attack confidence and technique attribution are separate. Low attribution confidence alone neither suppresses detection nor creates an attack.
5. **The lean reference is `compact_both`, not an unqualified production winner.** Revised examples improved Morse recall but introduced hard-negative false alarms. The false-alarm casebook shows highly constructed benign encodings and fictional security examples, not representative production traffic. Do not publish their false-positive fraction as an everyday rate.
6. **Few-shot placement was initially shared-state, not native criterion arrays.** The compiler and admission lab now enable explicit native-layout comparisons. `examples` is not assumed to activate undocumented model behavior. Keep source/content changes separate from layout changes.
7. **Code composition and model answers remain distinct evidence.** The extra small rules-only Jev mapper did not help in the earlier pilot. Derived admission dispositions in the new lab should be reported alongside native answers, not substituted into historical results.
8. **Byte size is not token count.** The long fully resolved example payloads were prepared offline, not accepted and timed by Jev. The admission lab's smaller five-question model payload is a separate authored policy experiment, not a lossless rendering of the old seven-question guide.
9. **Examples and evaluation labels are separate.** Preserve the disputed original attack-acrostic exclusion and all raw/sensitivity outputs. New expected labels are authored development annotations, not independent gold.

## 5. Reconciliation order for the returning local coding session

First inventory the actual workspace and repository status read-only. Inspect local run manifests/reports/records and the shared ledger before launching anything. A newly present admission report takes precedence over this packet's pending status, but verify its protocol and plan identity. The prepared admission plan hash is in `experiment-index.json`.

Verify the package hashes and original project bindings. Keep frozen experiment sources available for replay: the runners record source hashes but do NOT copy the full runner source into each run directory. Their source guards intentionally refuse changed bindings. Blindly moving refactored sources into old locations can break reproducibility.

Create an additive, reviewed integration rather than replacing directories wholesale. Suggested organization is versioned experiment definitions/source, reusable compiler code, immutable evidence, and a separate publication projection. This is a suggestion, not an already-applied structure. Preserve exact wire requests and response hashes. Any normalization or rescoring is a new derived artifact with source references; no silent changes to originals.

Do not reset `runs/rich-restart-budget-v1/`, release uncertain holds, retry uncertain requests, count shared first-stage evidence twice, or promote a software/mock test into a live model result. Any additional spending remains an explicit bounded decision.

## 6. Website continuation

Editable site source in the supplied snapshot is `outputs/jev-redteam/site/`. Authored components include `src/content/dashboard/RichPilotEvidence.jsx`, `FollowupEvidence.jsx`, `CampaignEvidence.jsx`, `DashboardContent.jsx` and `src/content/report/ReportContent.jsx`. `scripts/sync-site.mjs` and the `harness/site-*.mjs` projections are part of the existing data update path. Do not blindly run a data-sync script until the new report schemas have explicit adapters and prior queries are preserved.

The snapshot also contains `work/site-refresh-v4/authoring/`, `publication/`, build/upload receipts and the source publication bridge. The archived canonical data and two inspected dashboard components match the v4 authoring copy. The last archived receipt identifies a Sites source commit and owner-restricted sharing; it says `githubPushed: false`. These are historical facts, not proof of current website state or credentials.

Preserve the existing Data app architecture, protected runtime and owner presentation. Follow the site's `AGENTS.md` and installed Data plugin workflow; do not replace the app with a static substitute, empty the publication data reference, bypass runtime verification, or broaden sharing. Before publishing, capture current hosted data/presentation and the actual remote ancestor to avoid overwriting owner edits.

Most analysis, data-projection code, page content and source changes can be prepared in this chat against supplied files. Final validation using the existing Data app runtime and authenticated publication require that environment or an available authorized publishing integration. No such publishing connection has been established in this chat. The archival bridge has absolute Mac paths and previously used staging directories; do not execute it blindly. Do not send credentials in chat.

Once the admission result is reviewed, add a separate consumer-admission section with policy/operation disclosures, per-case evidence and explicit denominator/label caveats. Keep the historical inspection results separate and retain prior publications/queries. No current bundle has already published these new results.

## 7. What has and has not been verified in this checkpoint

This turn compared 61 original source bindings, 66 vendored compiler files and three archived site source/data files; all compared bytes matched. It identified and preserved the three uploaded report protocols. It does not independently authenticate a past model response, include every original/new live raw-response file, inspect the current Mac working tree, rerun all previous tests, obtain the admission result, or fetch the current private website.

The packet has a new checksummed inventory. This is a retrospective reconciliation record; do not claim it was part of the original preregistration.
