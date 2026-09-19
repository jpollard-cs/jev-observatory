# Jev consumer admission lab v1

A separate, budgeted research experiment. It does not deploy an admission gate or send tested material to a receiving agent. Only Jev classification requests are made when you explicitly pass `--live`.

## Run

Extract `jev-admission-lab-v1.zip` onto Desktop. Keep `.env` in the original Jev project. No installation, npm dependencies, or Codex inference credits are required.

```bash
bash "$HOME/Desktop/jev-admission-lab-v1/run.sh" --live
```

Default project:
`/Users/jordan/Documents/Codex/2026-09-16/i-g/outputs/jev-redteam`

Use `--project /path/to/jev-redteam` to override the project. The source must match the pinned project hashes. A wrong or older copy cannot silently start with a fresh budget: live execution requires the existing ledger to include at least the known charges from the completed v2 report.

Other modes:

```bash
bash "$HOME/Desktop/jev-admission-lab-v1/run.sh" --prepare
bash "$HOME/Desktop/jev-admission-lab-v1/run.sh" --live --limit 12
bash "$HOME/Desktop/jev-admission-lab-v1/run.sh" --status
```

`--prepare` and `--status` do not read credentials or call the provider. `--limit 12` is a resumable technical smoke test of the twelve largest new request shapes, already part of the full plan. Run `--live` again to continue without resending settled requests. There is no automatic retry for uncertain or failed dispatches. Do not clear reservations or reset the ledger to bypass a stop.

## Fixed limits

Maximum 480 provider requests; $0.40 local bundle allowance inside the existing $3 restart envelope. Rough forecast is about $0.20, using measured historical control tokens and bytes/3 for new requests. This is neither a vendor tokenizer nor a billing guarantee. Actual provider usage settles each reservation. Two requests can be in flight, with at least 300 ms between starts. Ctrl-C stops new work and drains in-flight replies. A second interruption or process crash may leave an uncertain reservation, which is not silently retried.

Requests go only to the existing first-party TypeSafe endpoint. The existing model selector is retained and every returned model must be `jev-1.13.0`. Credentials are loaded from the original project's `.env`, not shell-sourced, copied or printed. The shared lock and append-only ledger remain the original harness mechanisms.

## Experiment matrix

* Two byte-identical reference conditions: original rich guide and restored compact guide, 48 requests each, with their original seven questions and authored labels. Historical answers are not substituted for fresh answers.
* New consumer panel: 32 scenario/context combinations over 24 unique source materials, with 0 and 4,096 inert padding characters outside material. Three policy profiles and two example placements produce 384 calls. These are dependent development comparisons, not 384 independent cases.
* The new profiles share the same five judgments and fixed per-proposition example banks. `question` attaches each bank in instructions; `criteria` attaches the same contextualized examples under their matching criterion. Their content/assignment hashes are checked. There are 21 demonstration occurrences per new request, not a full 21-example corpus repeated in five questions.

See [POLICY-REVIEW.md](docs/POLICY-REVIEW.md) for all defaults and expected outcomes before running. See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for scope and compiler integration.

## Result

Attach this file after completion:

```text
/Users/jordan/Documents/Codex/2026-09-16/i-g/outputs/jev-redteam/runs/consumer-admission-v1/report.json
```

The new run directory also contains immutable request payloads, per-request compiler receipts, prompt/policy snapshots, saved responses, and a Markdown report. Original policies, old fixtures, existing results and previous approval records are not overwritten. Editing a prepared policy or builder requires a new version/run identity; do not edit frozen evidence to resume.

## What the report distinguishes

Attack detections and misses; semantic false alarms; representation compliance; native operation decisions; derived decisions from explicit code rules; unsafe admission allows; unnecessary holds; and correct rejection of benign-but-prohibited encoded data. Correct policy rejection is not credited as correct attack detection. A review is not a detection or an allow. Unavailable responses remain separate.

The code-based disposition consumes the same saved classification/contract/relevance findings. It enforces rule precedence, not truth: wrong findings can still produce wrong admission decisions. No probabilities are multiplied, and diagnostic confidence does not gate attack classification.

## Validation

Run from this folder with a readable copy of the original source:

```bash
JEV_TEST_PROJECT="/path/to/jev-redteam" bash tests/run-tests.sh
```

The checked release has 56 new tests, 54 frozen compiler tests, and 182 original project tests passing. Transport is mocked for software tests, including the complete 480-request scheduling/settlement exercise. Provider acceptance, token counts and model effectiveness for this experiment are unmeasured until your live run.
