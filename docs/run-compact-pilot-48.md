# Run only the 48 compact-prompt Jev tests

This is the compact **C** condition from the existing proposal, isolated into a separate run. It does not start the 192-call four-condition experiment, repeat the rich guide, run a second pass, start Qwen, or open the larger campaign.

The model-facing change is exactly `state.classifierGuide`, using the existing, unedited `policies/classifier-guide-v3-compact.draft.json`. All 48 scenario/length combinations, their order, expected labels, material, policy, trusted context, seven questions, and `jev-latest` selector stay unchanged. The baseline is the archived rich pilot plus its separately recorded one-case transport repair. Three disputed attack-labeled acrostic cases remain in all 48 records and sensitivity metrics; the primary comparison has 45 cases.

## Run on the original Mac

From the project directory (`.../i-g/outputs/jev-redteam`):

```sh
bash scripts/run-compact-pilot.sh --live
```

This command first prepares/verifies the frozen request plan offline, then explicitly approves that plan and runs at most 48 first-pass requests. It uses your existing `.env` or exported `TYPESAFE_API_KEY`/`JEV_API_KEY`. The key is never copied into the new artifacts. The launcher uses the recorded Codex Node runtime when present, otherwise Node on PATH; `JEV_NODE` can select an executable. Node 22.22+ follows the repository's declared requirement; this handoff was also tested with Node 22.16.0. No dependency installation is needed for this runner.

For an optional one-request first invocation:

```sh
bash scripts/run-compact-pilot.sh --live --limit 1
# Then run the first command to finish only the unattempted cases.
```

An ordinary limit-based stop resumes without repeating requests. A failed or uncertain dispatch does **not** automatically retry or resume past the failure.

## Cost controls

The 48 frozen compact requests reserve **$0.119084616** under the existing one-token-per-serialized-byte plus 256-token-per-call planning convention. This is a conservative planning calculation, not a measured token count, bill, forecast, or guarantee. The guide is 17,063 serialized UTF-8 bytes rather than 48,113; no measured token-saving claim is made.

The stage uses the existing **$0.30 maximum** and **shared $3 restart ledger**. This is not an additional $3 budget. The uploaded snapshot has $0.065078118 known list-price usage and $0.002664690 held for unresolved historical usage, leaving $2.932257192 in that local envelope before this run. Those figures are not your TypeSafe account balance. The launcher replays the Mac's current ledger rather than resetting it to the uploaded snapshot.

Public list pricing was checked September 18, 2026: **$0.042/million input tokens; output free**, with `jev-latest` pointing to `jev-1.13.0`. Source: https://docs.typesafe.ai/models . If price variables are absent, the runner uses those frozen list-price defaults. A configured different price stops execution; it is never silently overwritten. Recheck pricing for a later run. A price change requires a reviewed new plan, not deletion of old evidence.

The byte reservation is not a provider-enforced monetary ceiling. A request whose reported usage exceeds its reservation is preserved and stops further work. Historical unknown usage stays reserved. The first unexpected provider version also remains recorded and stops subsequent calls; model identity cannot be known before that response arrives.

## Files and interpretation

```sh
bash scripts/run-compact-pilot.sh --status
bash scripts/run-compact-pilot.sh --report
```

Outputs are separate under `runs/compact-single-pass-48-v1/`: `manifest.json`, hash-addressed `requests/`, immutable `records/`, `approval.json` after live configuration passes, and recomputable `report.json` / `report.md`. Status/report commands are offline. Run them after the live invocation exits because the shared lock is exclusive.

The report checks the original and repair request/response hashes against the existing ledger. It includes primary and all-authored-label views; misses, false alarms, abstentions, unavailable responses, per-length results, paired changes, provider versions, and measured token/latency summaries. Choice and Noul remain separate; there is no threshold tuning or answer repair. The reference is historical, not concurrently randomized. Guide wording, length and representation change together. These are dependent development cases, not evidence of general robustness.

## Stops and safe recovery

- `missing_endpoint_configuration`: the key is not available in this process. Check your **local** `.env`; do not paste the key into chat.
- `compact_pilot_sources_changed` or a plan-file collision: source/prompt changed after freeze. Keep the old run; prepare a reviewed new version rather than deleting evidence.
- `compact_pilot_restart_budget_insufficient`: the shared ledger cannot allocate the stage inside $3. Do not reset it.
- `compact_pilot_provider_differs_from_historical_baseline` or `provider_model_drift`: the returned version differs from the historical baseline or changed mid-run. Preserve the response; do not claim a prompt-only comparison.
- Transport/provider errors, missing usage, malformed responses, reservation overruns, or uncertain dispatches stop the run. Unknown charges remain held. No retries are hidden.
- A response saved durably before interruption can be settled on resume without repeating that request. A reservation without a saved response requires review and is not sent again.

## What was validated here

The complete software suite passes **197 tests**: 182 existing tests and 15 new tests. The new tests use generated synthetic baselines and injected inference/HTTP responses, not real Jev calls. They cover all 48 request identities, guide-only changes, budget arithmetic, no-duplicate resume, a full simulated run, error and model-drift stops, pending dispatches, saved-response recovery, tampered evidence, explicit approval, and pricing defaults/mismatch rejection.

In the uploaded workspace, the live preflight stopped at `missing_endpoint_configuration` before a request was reserved or sent. **New paid Jev calls: 0. New live Jev results: 0.** The original code, policies, raw runs and ledger were not modified. This patch adds files only; actual live execution will append to the shared ledger. The existing website and publication are untouched.
