# Jev-assisted catalog selection — implemented contract

> Version note: this retained specification describes the earlier implementation. In 0.4.1, `LOCAL-CONNECTION-AND-FIXES.md` supersedes its small planning-budget maxima, unconditional browser-offline statement, and browser-test helper description. Historical policy/data semantics remain unchanged.

Version 0.2.0. Algorithm versions are bound by each prepared plan's exact source hashes. All probabilities/thresholds are experimental selection heuristics, not security assurance or calibrated failure estimates.

## 1. The two inference purposes

**Relevance ranking** is conditioned on the validated consumer policy and a separate `selection-application/1` context. For each owner-authored group descriptor, one Choice asks whether the group directly exercises a declared boundary, exercises a plausible adjacent boundary, is not indicated by supplied facts, or cannot be responsibly assigned from the supplied evidence. Each descriptor is evaluated independently; the output is not one giant mutually exclusive Choice across the entire catalog.

**Catalog tagging** is independent of that application relevance decision. It suggests which of 12 fixed boundary facets apply to each complete group description, plus a taxonomy-fit judgment. Independent Noul propositions allow overlapping techniques without a combinatorial label vocabulary. `mixed` describes cross-facet coverage; `unmapped`/`insufficient_evidence` retain unknowns. Tags are never the case's attack label, expected answer, live measurement, admission decision, or authorization.

The purposes have separate plans, report protocols and caches. A tagging report cannot substitute for relevance advice. An external metadata catalog is taggable, but its cases do not become executable merely because the model tagged them.

## 2. Context schema

```text
selection-application/1
  name
  description
  surfaces[]
  capabilities[]
  focusDomains[]
  requiredFacets[]
```

This is host-supplied selection metadata. It cannot replace the tested policy or the catalog case's authored receiver/task context. Secret customer records are unnecessary for ranking. Unknown fields and values fail validation. Names and descriptions are copied as data, never evaluated as templates or executable code.

Surfaces: user messages, retrieved documents, tool results, conversation history, persistent memory, code, structured records. Capabilities: read-only analysis, external actions, sensitive disclosure, memory writes, judging, moderation. Relevant dossier domains currently available are incident review, billing support and code review. These domains select representative tests; they are not claimed equivalent to arbitrary applications in the same industry.

## 3. Registry and units

The active registry exposes 32 granular units over the existing 60 test/context cases. Each owner definition has an ID, purpose, facet tags, curated severity, member case IDs and dependency IDs. A unit contains 1–3 direct members. Dependencies can enlarge its minimum executable set. Examples: a dossier's beginning/end placement tests require its clean/quotation/middle core; a split-instruction test requires that same core. A source's associated fragments are not separated into unrelated model requests.

The ranker's projection includes only ID, title, purpose, domain, requirement descriptions and member count. It excludes case gold, previous outputs, historical scores, case annotations and raw customer material. The tagger also does not receive the authoritative facet labels it is being asked to propose.

The twelve facets are authority, task integrity, representation, language, exception scope, relevance, uncertainty, quotation, composition, contextual evidence, tools/disclosure, persistent state. A larger catalog adds descriptors, not another label for every category combination. Do not rely on a parent Choice to eliminate entire branches: every supplied rankable unit receives a question.

## 4. Chunking and native API

Default chunks contain up to six whole descriptors; the validator allows at most eight. The last chunk may be smaller. Rank = one four-option Choice per descriptor. Tag = twelve Nouls plus one taxonomy-fit Choice per descriptor. Explicit structured `state` and focused `questions` use native Jev criteria. Names/IDs are pointers; the question includes its full semantic request.

Default group ranking: 32 descriptors / six physical requests / 32 questions. Default tagging: 32 descriptors / six requests / 416 questions. The imported 18-family historical metadata catalog requires three default tag requests. The number of questions is not the number of provider calls, and physical request tokens include duplicated criteria and context.

The byte screens are 50,000 bytes/request and 27,000 bytes for state + the largest question. They are conservative local screens, not proof of the vendor's token limits. First-party provider acceptance and actual tokenization remain unmeasured for these new requests.

## 5. Confidence interpretation

For ranking, preserve the raw `choice`, `probabilities` and `confidence`. Confidence indicates distribution concentration, not calibrated correctness. Do not multiply relevance by confidence and call the result a chance that testing matters.

Current bounded base weights: direct 1.00; adjacent 0.65; not-indicated 0.25; insufficient evidence 0.65. A record is treated as uncertain when its choice is insufficient, its insufficient-evidence probability is at least 0.25, confidence is below 0.55, the top-two probability gap is below 0.20, or its selected label disagrees materially with its largest probability. Uncertainty retains a weight of at least 0.65. Missing groups also receive a neutral 0.65 floor and an explicit unscored status. Even a confident not-indicated result does not become a hard exclusion.

Tag proposals use Noul >=0.80 for suggested, <=0.20 for not indicated, and intermediate values for review. Missing tag data stays ambiguous. These thresholds merely organize human review. No code automatically promotes a tag into required coverage or changes a label.

These numbers are deliberately auditable provisional defaults. Selection-quality experiments, not confidence rhetoric, should determine whether they improve coverage per dollar.

## 6. Mandatory rules and allocation

1. Validate policy, app context, registry and any advice. Preserve prohibited-input tests: a restriction is a reason to test its enforcement.
2. Derive owner-mandated units. Include ordinary controls, source/role/self-grant boundaries, unresolved task evidence, associated fragments and an attack in an otherwise allowed format. Representation settings, enabled exceptions, language requirements and explicit critical facets/domains add requirements.
3. Resolve all dependencies and deduplicate case/layout/repetition jobs. Calculate the whole minimum suite. If it cannot fit both ceilings, select no partial mandatory suite and return `insufficient_budget`.
4. Unsupported declared critical capabilities return `insufficient_coverage`. A model cannot turn a missing executable test into coverage. Allowed but unrepresented languages appear as explicit non-comprehensive coverage warnings.
5. Deduct committed ranking usage from the workflow allowance, then reserve an independent seeded exploratory lane. Default 15% of the optional money envelope; whole indivisible units can cross this target, never the actual total ceiling. CLI/library options permit 5–50%. The lane does not consult Jev scores or test outcomes.
6. Allocate remaining complete affordable units using marginal new/underrepresented facets, curated severity, bounded relevance, and a diminishing cost penalty. Current score is `((1 + facetNovelty) * severity * (0.5 + relevanceWeight) + uncertaintyBonus) / sqrt(marginalReservedTokens)`. `facetNovelty` sums `1/(1 + timesFacetCovered)`. Uncertainty bonus is 0.3. Ties use the frozen seed.
7. Recompute marginal costs so shared controls are never paid twice. Skip groups that do not fit and continue considering affordable smaller groups. Dependencies travel with their unit. If all remaining units fit, a fast path selects them all; advice only affects their order.
8. Stop at a tier target, exhausted compatible catalog, or no fitting unit. Show every exclusion and unused budget. Never invent rows/repetitions merely to spend the remainder.

This is a constrained greedy heuristic, not an optimal knapsack solution. It makes no population-representativeness guarantee. Bronze/Silver target group counts with mandatory floors; the Budget tier fills available useful coverage. Cost-dependent exploration means a larger budget is not guaranteed to be a strict prefix of a smaller one. Exact reproducibility holds for the same source/configuration/advice/options/seed. The classic version-1 prefix planner remains available as a baseline.

## 7. Budget and execution boundaries

A metadata stage has its own explicit maximum (default $0.02; maximum $0.05). New relevance/evaluation workflows retain the local $0.40 cap and 10M conservative reserved-input ceiling. All stages settle on the original shared $3 ledger when that project is used. Catalog tagging is a separate explicit maintenance stage, not a hidden cost in each evaluation. Reusing local advice never sends its requests again.

The model is pinned to Jev 1.13.0. Local accounting freezes input $0.042/M and output $0 from provider documentation checked on 2026-09-18. Forecast bytes/3 and reservation bytes+256 are not vendor token guarantees. Reported usage settles the reservation; an anomalous overrun stops subsequent dispatch. Never advertise a local cap as an independently guaranteed provider invoice cap.

Both metadata and evaluation commands require the full immutable plan hash and `--live`. Browser endpoints prepare/import/plan only. Keys remain in the original project/account. The shared lock, append-only reservations, usage settlement and no-retry treatment extend to metadata. Unknown dispatch, invalid response, missing usage, model change or budget exhaustion stops the stage. No retry erases an unresolved hold.

A complete or safely partial ranking report can guide allocation; unscored groups retain neutral weights. Reports containing failed or unsettled requests are rejected until reconciled. Changed policy/app/catalog/source invalidates stale rankings. A downstream live evaluation checks that each ranking response hash is settled in the same local account ledger. Report rehashing is not provider attestation and cannot fabricate account evidence.

## 8. Cache, provenance and labels

Cache identity binds purpose, pinned model, descriptors, taxonomy, policy/app for ranking, request rendering, and current execution sources. The serialized request, raw envelope, usage, returned model identity, source snapshot and request/hash assignments are retained. Hashes detect local mutation, not a signed statement from TypeSafe.

Ranking never consumes results from the evaluation it is planning, and historical target failures are not a hidden selection input. Tagging suggestions and externally imported descriptor text remain untrusted annotation inputs. They cannot change member IDs, costs, mandatory tags, eligibility or expected outcomes. Registry changes require an owner-reviewed source change and a new identity.

The evaluation uses the same compiled test payloads and independent policy oracle as 0.1. Advice/app selections are report metadata, not inserted into the target request. This preserves comparisons and avoids letting the selector leak answers into the evaluator.

## 9. Historical catalog and scale

`integrations/historical/export-tagging-descriptors.mjs` reconstructs the original generator and emits 18 family metadata descriptions, with source hashes and the 15,120 cells / 7,560 pairs / 12 semantic-lineage counts. It does not attach the old expected answers to the admission oracle. Neither imported metadata nor allocator capacity alone integrates that historical campaign's execution/scoring semantics.

Scale validation covers a synthetic 7,560-unit paired-cost catalog: full allocation yields 15,120 logical jobs; a constrained 5% envelope selects 756 jobs without breaking pairs or overspending. This is algorithmic allocation validation only. There was no 15,120-provider-call run, original full-payload rendering test, or large-report persistence benchmark in this release.

## 10. Next empirical check

Compare matched budgets with the same mandatory floor: classic deterministic selection, neutral granular allocation, seeded allocation, and actual Jev-assisted allocation. Freeze the plans before observing target outcomes. Measure critical-facet misses, distinct scenario/lineage coverage, benign controls, actual token cost, and failure discovery against a fixed reference panel. Use different application descriptions, paraphrases, missing context and adversarial selector text. High-confidence wrong ranking and confidence-free fallbacks deserve explicit tests. Catalog tags require a reviewed reference sample, not Jev grading its own taxonomy accuracy.

No new model evidence was collected while implementing this release. Software pass counts validate mechanics, not semantic usefulness, selection calibration or security effectiveness.

## Primary API references checked

- https://docs.typesafe.ai/primitives — typed questions, independent evaluation, distribution confidence versus probabilities.
- https://docs.typesafe.ai/primitives/advanced — structured instructions and criterion examples.
- https://docs.typesafe.ai/models — model identity, token limits and frozen price reference.
- https://docs.typesafe.ai/cookbooks/skill_suggestion — catalog selection pattern, not proof of our implementation's quality.
- https://docs.typesafe.ai/model-jaggedness/jev-1.13 — adversarial-state and generation limitations.
