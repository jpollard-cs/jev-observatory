# Observatory · Jev Policy Workbench 0.3.0

A local-first policy builder, evidence explorer, and **Jev-assisted coverage planner**. This release composes application-relevant evaluation suites from reviewed predefined groups; it does not ask a model to invent test answers or silently rewrite the policy.

## Start this version

Extract `jev-policy-workbench-0.3.zip` onto Desktop. Node.js 22 or later is required; no package installation is necessary.

```bash
bash "$HOME/Desktop/jev-policy-workbench-0.3/run.sh"
```

Open the printed address, normally **http://127.0.0.1:8789**. Earlier releases used ports 8787 and 8788 and may remain installed. There is no installer. Do not copy this folder over a running experiment or move `.env`.

Starting the browser app does not read credentials, contact Jev, spend money, or publish anything. Only explicitly approved CLI execution can send requests. Default configuration still points to the original project and shared $3 ledger.

## New in 0.3: the Observatory is back

Galaxy mode is **on by default**, with a saved off switch and reduced-motion support. The sidebar is anchored top and bottom, including tall portrait screens; mobile uses a full-height drawer. The original galaxy painter is preserved in the provenance folder. The project is presented as a local research workspace, not a company.

The opening atlas and evidence table use the **same selected recorded experiment and condition**. Interactive orbital points, confusion matrices, native/code comparisons and the token/latency scatter all lead back to recorded rows. The backdrop is decorative; orbital distances are categorical, not embeddings.

**The all-allow report concern:** inspection has 64 expected allows by design. Strict admission has 16 allow / 4 review / 44 block; contextual admission has 26 allow / 6 review / 32 block. Importing a report in 0.2 selected its first historical control automatically. This release preserves per-run condition selection and makes the operation, expected distribution and filter scope explicit. It does not rewrite labels. See `docs/UI-DATA-REVIEW.md`.

All four completed historical report protocols are available. Old expected-label aliases, repetitions, historical-reference rows and source matching now have explicit adapters. Unavailable labels are never filled with allow. Editing a policy draft does not change recorded evidence.

**No inference needs to be rerun to see these repairs.** Keep the old 0.2 folder for any frozen 0.2 plans; source hashes are intentionally versioned. Existing reports can be imported into this release. Starting the app remains offline.

## First assisted workflow

1. **Policy builder:** select the exact policy you want to evaluate. Draft changes do not inherit historical test results.
2. **Coverage advisor:** describe the application, input surfaces, capabilities, and optional dossier domains. These are selection metadata, not grants to source content or replacements for catalog test contexts.
3. Click **Freeze relevance requests**. Review the six prepared requests and their cap; run the exact full-hash command printed in Terminal. This is a separate paid metadata stage, not an evaluation run.
4. **Import advisor report** from the path printed on completion. It must match the policy, application, registry and source version. Previously imported matching evidence can be loaded from the local cache without another call.
5. Click **Use in planner**. The Budget tier fills the available evaluation allowance with complete useful units; Bronze/Silver/Gold are also available. The mandatory floor and a seeded, model-independent exploratory allocation remain in force.
6. Inspect coverage and exclusions; **Freeze requests & receipts**. Execute the separately approved evaluation command. Import that report in **Evidence explorer**.

The browser has no inference endpoint. There are two explicit commands because ranking sends application metadata and evaluation sends the actual test material. A frozen plan is not a completed model run.

## Coverage-advisor features retained from 0.2

- **32 independently allocatable units over the same 60 cases**, replacing the old 21 larger groups in the new planner only. Shared controls are charged once per case/layout/repetition. Dependencies retain dossier baselines and related fragments.
- **Relevance advisor:** one four-option Choice per unit (`direct`, `adjacent`, `not_indicated`, `insufficient_evidence`), in bounded chunks. Each group is scored; low parent scores do not prune a taxonomy branch.
- **Optional catalog tagging:** 12 independent Noul facets plus one small taxonomy-fit Choice (`covered`, `mixed`, `unmapped`, `insufficient_evidence`). Tags are reviewable proposals, not automatic edits to the registry or labels.
- **Budget allocation:** exact selected-job reservations; whole-group selection; deduplicated shared controls; mandatory coverage first; independent exploration; cost-aware selection of the remaining tail. It continues considering smaller affordable groups rather than stopping at the first unaffordable group.
- **Unknowns:** low-confidence/missing relevance evidence retains a neutral weight. Unsupported critical capabilities produce a visible, non-dispatchable coverage gap.
- **Frozen provenance:** exact metadata requests, raw responses, reported model, actual usage, current source hashes, scoring heuristics and downstream plan bindings. Advice must be settled in the same account ledger before a derived paid evaluation executes.
- Original deterministic prefix planning remains selectable as a control. Existing policy compiler, test payloads, expected labels, report and vendor snapshots remain unchanged.

## Granularity and confidence

A coverage unit is a reviewed small contrast set, not an arbitrary chunk of a document. Its descriptor contains purpose, domain, requirements and member count. The model sees neither expected answers nor earlier scores. Long dossiers and split-message attacks remain whole within a case.

Choice confidence describes concentration of the returned distribution, **not calibrated correctness**. Current thresholds and allocation coefficients are documented provisional heuristics, not experimentally optimal weights. No relevance result can waive owner-mandated tests. An English-only or no-encoding contract still requires tests of prohibited inputs and valid exceptions.

## Defaults and costs

The default relevance stage has six requests / 32 Choices. The default optional tagging stage has six requests / 416 typed questions. Offline forecasts, conservative reservations, and observed usage are separately labeled. See `validation/previous-0.2/plan-checks.json` for measured serialized-size calculations in this release.

The advisor cap defaults to **$0.02**, with a maximum of $0.05. Its actual committed ranking usage is deducted from the downstream workflow allowance, which remains capped at $0.40. Optional catalog tagging is a separate catalog-maintenance stage on the same shared ledger; it is not silently folded into a relevance report. Reusing a report never rebills its calls, although the allocation conservatively includes its prior usage in the workflow ceiling.

The frozen local accounting price is $0.042/M input tokens, output $0, checked against TypeSafe documentation on 2026-09-18. Forecast = serialized bytes / 3; per-request reservation = bytes + 256. Neither is a provider tokenizer or invoice guarantee. Usage from responses settles reservations. Missing usage, unknown dispatches, price changes or reported model changes stop execution. No automatic retry hides uncertainty.

The original account still has a $3 shared ceiling. The last supplied report recorded about $1.5473 remaining, but the runner re-reads the actual ledger and retains unresolved historical holds. No caps or prior accounting are reset by this release.

## CLI and external catalog descriptors

The UI prints commands with actual paths and hashes. The same offline operations are available directly:

```bash
node selection.mjs prepare --mode rank --policy examples/strict.policy.json \
  --application examples/application-code-review.json

# Optional metadata tagging, not live historical-campaign execution:
node selection.mjs prepare --mode tag \
  --catalog examples/historical-family-descriptors.json

# After an explicitly approved rank run completes:
node selection.mjs evaluate --policy examples/strict.policy.json \
  --application examples/application-code-review.json \
  --advice /absolute/path/to/advisor-report.json --tier budget --budget-usd .15
```

`prepare` and `evaluate` only freeze files. They print the next explicit command. `run` requires both `--confirm <entire-plan-hash>` and `--live`, plus the original `--project` or a deliberately initialized standalone `--account`. Keep credentials outside exported files.

Imported metadata uses `schemas/catalog-descriptors.schema.json`. The historical export contains **18 family descriptors representing the 15,120-cell generator**. That bridge supports tagging its families; it does not make their old moderation, judge and context-integrity labels executable under the new admission contract.

## Scope boundaries

- **Tailored suite composition, not free-form scenario synthesis.** Existing specimen text, receiver context and authored labels are preserved. Application descriptions affect relevance, not ground truth.
- **Current live-compatible catalog: 60 cases.** The allocator is tested with 15,120 logical jobs, but the full historical renderer/scorer and large-run persistence integration are not implemented here. Full-catalog counts retain their original meaning.
- **No new live measurements.** Only software tests, report audits and UI checks were performed for 0.3. It has not been shown that Jev-assisted selection outperforms deterministic selection.
- Tool execution, sensitive disclosure, memory-writing, moderation and judging adapters are not implemented by this admission-only catalog. Declaring an unsupported critical capability does not manufacture coverage.
- Any-language permission is not validated multilingual coverage. Missing language probes are shown as coverage gaps.
- Current dossiers are coherent synthetic examples, not full-window or deployed-agent evaluations.
- No public upload service, multi-user authentication, production gateway, automatic publication or automatic policy optimization.

## Verification and handoff

```bash
npm run verify
npm test
node --test vendor/admission-v1/vendor/compiler/tests/compiler.test.mjs
```

`docs/SELECTION.md` specifies the implemented schemas and algorithms. `docs/HANDOFF.md` describes reconciliation. `provenance/parent-workbench-0.2.zip` retains the previous source distribution unchanged, including its earlier handoff chain. Historical reports remain immutable. Runtime outputs are deliberately excluded from the release archive; preserve your original project’s complete `runs/` tree and this release’s `runtime/` folder.


### Presentation/data verification

```bash
node scripts/audit-ui-data.mjs
```

An optional `--baseline /path/to/extracted/jev-policy-workbench-0.2` also rebuilds and compares all 360 preset/case/layout payload combinations. No model calls are made. Browser QA is documented in `scripts/ui-browser/README.md`; it is a development check requiring Python Playwright and Chromium, not an app-start dependency.
