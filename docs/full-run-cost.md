# Jev full-run cost and evidence plan

The user reports a **$5 account balance**. Plan at most **$4 for the next stage**, leaving **$1 unallocated** for uncertainty. The original `legacy-v2` snapshot below reserves **$0.23122 for 216 cases** and **$9.45 for the full grid**. A separately computed, prospective `advanced-v3` plan reserves **$0.22893 and $9.43**, respectively. The full grid does not fit either budget calculation. The legacy pilot-limited estimate of $2.33 cannot justify risking the full grid beyond its conservative reservation. This document and the companion script launch no model calls.

The $5 balance is user-reported; the native API balance and account ledger have **not** been inspected. The $4 figure is a maximum allocation, not a spending target or verified remaining balance. The legacy accounting snapshot contains about $0.006 in recorded list-price usage plus six calls with unknown usage; unknown charges are not assumed to be zero. Later diagnostic calls are outside that frozen table. The $1 headroom is intentional while those amounts and any other account activity remain unreconciled.

TypeSafe's public launch documentation lists **$0.042 per million input tokens and free output tokens**. These calculations use that public rate, not private account terms, promotional credit consumption, or a reconciled bill. [TypeSafe launch announcement](https://typesafe.ai/blog/introducing-system-one-models-and-jev).

## Reproduce the offline report

From the repository root:

```sh
node scripts/cost-report.mjs --protocol-version legacy-v2
```

This command explicitly selects the legacy request builder used for the original planning tables; it still accounts for whatever recorded calls exist when invoked. It does not recreate an old account-ledger cutoff automatically. Optional `--runs-dir` selects a frozen run archive; `--model` sets the model string used to serialize planned native requests. The default model is `jev-latest`; the CLI's default protocol is now `advanced-v3`, so the version flag matters. The script prints JSON and does not modify `data/report.json`, `.env`, the run archive, or the site. It never loads environment files, reads credentials, or calls a model. To retain a private snapshot, redirect its output to an existing ignored `work/` directory.

The report regenerates the frozen case definitions through the native TypeSafe request builder, hashes the complete request sequence, and counts the **entire serialized request**, including shared state and every question. It reads only `raw.jsonl` run records and standalone diagnostic `result.json` records under `runs/`; it does not recount generated aggregate reports. Repeated calls and diagnostics are financial events even when they reuse a case. Duplicate recording identities are excluded and disclosed. File hashes, timestamps, parsing issues and known usage coverage are included.

## Legacy-v2 snapshot used for this document

The existing full-grid, wider-stage, recorded-pilot and ratio tables are a **frozen legacy-v2-era snapshot**. Full-grid and recorded-usage figures were calculated **2026-09-17 at 02:30 UTC**; the $5 budget and wider-stage plan were added at **02:34 UTC**. They are not advanced-v3 measurements or a current account ledger. The historical accounting includes the named initial v1 pilot, v2 pilot and diagnostic/special runs; the original validator version remains part of each run's provenance. `data/cost-report.json` was subsequently regenerated at **02:57 UTC**, after the 48-call expiry diagnostic completed; its current ledger is recorded in the appendix below.

| Quantity | Observed or calculated value |
|---|---:|
| Full grid, one completion per cell | 15,120 requests |
| Underlying synthetic template lineages | 12 |
| Typed questions across those requests | 65,088 |
| Serialized UTF-8 request bytes | 221,167,152 |
| Planning allowance per request | 256 additional input tokens |
| Reserved input tokens | 225,037,872 |
| Jev input reservation at public rate | **$9.451590624** |
| Output-token charge at public rate | $0 |

Request-sequence SHA-256:

```text
8df7740ca01ada7fd9fbbf85ffaeba439e5530ba97d101571049f88978b55169
```

Reservation formula:

```text
reserved input tokens = sum(serialized request UTF-8 bytes) + 256 × requests
reserved USD = reserved input tokens × 0.042 / 1,000,000
```

One token per UTF-8 byte is a conservative planning convention for typical byte-token processing, not a proven property of Jev's tokenizer or billing system. Hidden provider overhead, account settings, future prices or service limits can differ. A provider-side account spending limit is the appropriate hard monetary control. The native adapter has no documented output-token cap; at the verified public rate output usage adds no token charge.

## Legacy-v2 wider-stage planning snapshot

The script also emits `nextStage`, a deterministic slice of the **whole case generator**, not a selection limited to its existing `pilot` split. The table in this section uses `legacy-v2`. It fixes balanced policy, structured output, middle placement and the policy arm, then crosses all 18 families with both variants, archive seeds 0/1 and lengths 512/4,096/16,384 characters. This yields 216 unique requests: 108 attack variants and 108 benign variants, with 72 at each length. Existing split labels remain provenance only: 84 originated in `pilot`, 36 in `calibration` and 96 in `test`. The proposed run is entirely **development/integration evidence**, so these exposed fixtures cannot later be treated as a sealed confirmatory set.

| Wider-stage planning quantity | Value |
|---|---:|
| Request cap | 216 |
| Typed questions | 1,956 |
| Serialized UTF-8 bytes | 5,449,860 |
| Reserved input tokens, including overhead | 5,505,156 |
| Byte-based reservation | **$0.231216552** |
| Maximum next-stage allocation | **$4.00** |
| Intentionally unallocated from reported balance | **$1.00** |

The reservation is far below the maximum; there is no reason to spend the rest merely because it was allocated. A tighter stage-specific cap may be used after freezing the execution plan. No live runner has been started by the cost script.

Wider-stage request-sequence SHA-256:

```text
8892c764933db82a742b82444c5d489172f67853738d32d2ccdec1e59e5bf329
```

## Advanced-v3 prospective plans

These values are calculated offline from the new native request builder, with explicit `{version: 'advanced-v3'}`. They are prospective costs, not new measured results. The case counts, synthetic lineages and $4 maximum allocation remain unchanged; structured EntryType serialization changes the request bytes. Historical requests and usage are never rebuilt with the new builder.

| Prospective advanced-v3 quantity | Full grid | Wider integration stage |
|---|---:|---:|
| Requests | 15,120 | 216 |
| Typed questions | 65,088 | 1,956 |
| Serialized UTF-8 bytes | 220,742,712 | 5,395,404 |
| Reserved input tokens, including overhead | 224,613,432 | 5,450,700 |
| Byte-based reservation | **$9.433764144** | **$0.228929400** |
| Fits the $4 maximum allocation | No | Yes |

Advanced-v3 full-grid request hash:

```text
92eedff7dc17f98ee2bbbfc33bef279defd85b04a649be8b4dd78ffb792eeaaa
```

Advanced-v3 wider-stage request hash:

```text
2ca0582ba0dea4583072e62fb68b24d586ce2f3a8c3af5f2dee930c8efdd68f9
```

The current cost report was generated separately with:

```sh
node scripts/cost-report.mjs --protocol-version advanced-v3
```

The report includes the immutable legacy planning reference separately from the selected protocol's new projection. It identifies the selected version, builder entrypoint hash and complete request-sequence hash. New `expiry_diagnostic` calls count toward recorded spending but are excluded from the corpus token/byte ratio, just like the standalone diagnostic and special-policy pilot. Their deliberately selected inputs are not a representative tokenization sample. Transferring a legacy ratio onto advanced-v3 requests needs new validation and never overrides the byte-based budget decision.

## Recorded pilot accounting — legacy snapshot

| Recorded source | Requests | Requests with usage | Known input tokens | Known list-price cost |
|---|---:|---:|---:|---:|
| Initial native pilot v1 | 12 | 6 | 14,715 | $0.000618030 |
| Native diagnostic v1 | 1 | 1 | 1,636 | $0.000068712 |
| Native pilot v2 | 12 | 12 | 29,322 | $0.001231524 |
| Matched judge/contextual-debugging special pilot | 24 | 24 | 91,056 | $0.003824352 |
| **Total** | **49** | **43** | **136,729** | **$0.005742618** |

Recorded output usage totals 8,451 tokens; its public-rate cost is zero. All available reported responses identify `jev-1.13.0`, while planned requests use the mutable `jev-latest` selector.

The initial validator discarded usage from **six `invalid_native_response` events**. These calls may have consumed credits despite the local error. Their unknown usage is **not zero** and cannot be reconstructed from the later successful pilot or diagnostic. Their retained request sizes support an additional **$0.002525712 planning reservation** under the same byte rule. Known usage plus that reservation is **$0.008268330**, still not a verified bill or formal upper bound. Reconcile provider credit/account records if an exact paid total is needed.

## Pilot-limited extrapolation — legacy-v2 snapshot

The ordinary corpus pilots contain 18 requests with both recorded input usage and request-byte counts: 44,037 input tokens over 175,290 request bytes. Their weighted ratio is **0.251223686 input tokens per serialized request byte**.

```text
estimated full-grid input tokens = 221,167,152 × 0.251223686
                                ≈ 55,562,427
estimated full-grid cost         ≈ $2.33362
```

This ratio is **not a representative corpus average**. The convenience pilot has dependent variants, uneven coverage of length/output/policy conditions, English-heavy padding, and missing usage correlated with the original validator. Long Unicode, invisible and encoded inputs may tokenize differently. The script exposes ratios by observed condition and shows the lowest/highest observed per-request ratios as sensitivity only: **$2.11–$4.17** when applied to the full grid. That range is neither a confidence interval nor a billing bound.

Use the byte-based reservation for the budget decision. The $2.33 extrapolation and its sensitivity range do **not** establish that the full grid can be completed within the $5 reported balance or the $4 maximum allocation.

The standalone diagnostic and special-policy pilot are included in total recorded usage but excluded from the full-grid ratio because their selection and question mixtures differ. Their exclusion is methodological, not a claim that they were free.

## Current recorded ledger appendix — 2026-09-17 02:57 UTC

This appendix updates accounting after the completed 48-call expiry diagnostic while preserving the 49-call historical table above. The generated report selects advanced-v3 for prospective plans; its financial totals use the recorded usage of each historical call, regardless of request version.

| Recorded accounting | Requests | With usage | Known input tokens | Known output tokens | Known list-price cost |
|---|---:|---:|---:|---:|---:|
| Previous historical snapshot | 49 | 43 | 136,729 | 8,451 | $0.005742618 |
| Expiry diagnostic v1 | 48 | 48 | 132,288 | 8,448 | $0.005556096 |
| **Current total** | **97** | **91** | **269,017** | **16,899** | **$0.011298714** |

The same six initial calls still lack usage. Their additional byte-based reservation remains **$0.002525712**, giving known usage plus missing-usage reservation of **$0.013824426**; this remains neither a reconciled invoice nor a proven upper bound. The provider balance has not been inspected.

All 48 new records have `kind: "expiry_diagnostic"` and are classified as diagnostics. They contribute to spending, but the token/byte calculation still uses exactly **18 eligible corpus requests**, 44,037 known input tokens and 175,290 recorded request bytes. A total of **73 diagnostic/special requests** are excluded from that ratio. The ratio is unchanged; applying it to advanced-v3 is explicitly an unvalidated projection that requires new calibration.

The diagnostic report is `data/expiry-diagnostic-report.json`; the complete accounting and source hashes are in `data/cost-report.json`. This offline regeneration made no model calls.

## Controls and costs outside Jev

Luna/Terra runs through Codex subagents consume subscription/account resources whose exact usage and marginal dollar cost are unknown here. They are not free merely because this suite has no token invoice for them. Keep their `codex_subagent` evidence and cost provenance separate from native Jev API observations. Direct Luna/Terra API rates and usage have not been established for this experiment, so no combined three-model dollar total is reported.

The estimate also excludes attack-generation services, human annotation/adjudication, compute/hosting, tax and account-specific charges. Public prices should be rechecked before a broader run.

## Staged evidence plan; no full run launched

1. **Finish integration review.** Retain v1 failures, the diagnostic and v2 as separate versioned evidence. Verify the native primitives, rounded probability behavior and usage retention. Review the eight matched judge cases and sixteen contextual-debugging cases without calling them a model ranking.
2. **Broaden integration coverage within budget.** The deterministic 216-cell slice reserves $0.23122 under legacy-v2 or $0.22893 under advanced-v3, both below the recommended $4 maximum. Select the intended protocol explicitly, freeze its request hash and set a 216-request cap; retain every attempt and usage record. This broadens family and length coverage while holding policy/output conditions fixed. It remains a dependent synthetic fixture set. Add other counterfactuals only in separately budgeted and frozen stages.
3. **Defer the full synthetic grid under the current balance.** Its 15,120 calls map behavior across configured factors, but the $9.45 legacy reservation and $9.43 advanced-v3 reservation both exceed the reported $5 balance and the $4 maximum allocation. Do not launch it using the smaller pilot extrapolation as justification. A later expanded plan needs a revised available budget or a smaller, explicitly selected grid whose regenerated conservative reservation fits. This document authorizes no top-up and launches no run.
4. **Design independent confirmation.** To obtain a one-sided 95% upper bound below a 0.1% failure probability after observing zero failures requires **2,995 independent scenarios per prespecified population**: `ceil(log(0.05) / log(0.999))`. Freeze real scenario sampling, policy, target version, representation, task, scoring and stopping rules first. Separate attack-miss and benign-false-positive populations require their own evidence. Model/policy/family-specific claims and simultaneous comparisons require an appropriate allocation or multiplicity adjustment. Repeated completions, padding variants and the 15,120 correlated grid cells do not supply 2,995 independent real scenarios. The cost of that study depends on its actual token distribution and independent labeling effort, which this starter does not establish.

## Check the applicable agreement before public results

The public TypeSafe MCA, updated August 27, 2026, §2.3(f) restricts publication of benchmarks and performance information. Review the actual accepted agreement, Order and any written research/early-access exception before putting measured results on a public site or repository. §15.14 makes the Order controlling where its terms conflict. Access alone does not establish an exception. [TypeSafe Master Customer Agreement](https://typesafe.ai/legal/mca).

The same agreement's §2.3(h) also addresses testing of service protection mechanisms. Check any applicable scope terms before expanding from behavioral input evaluation to service-level security testing. This document has not inspected the user's Order or determined which negotiated terms apply. [TypeSafe MCA, §2.3](https://typesafe.ai/legal/mca).
