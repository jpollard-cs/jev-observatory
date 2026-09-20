# Run the compact/two-pass experiment yourself

Everything runs in your local Terminal and calls Jev directly. It does not consume Codex/ChatGPT model usage. The existing `.env` supplies your TypeSafe key; no key belongs in a command or the repository.

Review [the compact classifier guide](../policies/classifier-guide-v3-compact.draft.json), [second-pass instructions](../policies/classifier-second-pass-v1.draft.json) and [experiment design](compact-two-pass-proposal.md) first. The guide is 64.5% smaller in serialized UTF-8 bytes; actual token savings remain unmeasured. Running the command with `--approve-plan` records your approval of these exact files and this experiment.

## 1. Open Terminal and prepare the offline plan

These commands use the Node runtime already installed on this Mac. Node 22.22+ on PATH also works.

```sh
cd /path/to/jev-observatory
JEV_NODE=node
"$JEV_NODE" scripts/compact-experiment.mjs --prepare
```

Preparation makes no API calls and does not read `.env`. It prints a `planHash` and freezes the static request bodies and source hashes under `runs/compact-two-pass-development-v1/`. Repeating preparation with identical files is safe. Changed files are rejected instead of overwriting an existing plan; do not delete past evidence to force a new experiment.

The proposal has **48 cases × four request conditions = at most 192 calls**. The first compact call is reused as the first half of the two-pass system. There is no score-based gate. The fixed stage order is E (second-call wording without prior answers), R (rich reference), C (compact first pass), D (second pass with C's answers). Stage order can confound timing; the report discloses that limitation. D is materialized only after all C answers validate.

The conservative planning reserve is **$0.582094**, with a **$0.75 maximum experiment allocation inside the existing $3 restart envelope**. This is not another $3 allocation. The shared ledger still includes the earlier usage and unresolved reservation. It does not claim to read your account balance. Price assumptions are $0.042/million input tokens and zero output-token cost; verify them with TypeSafe before a later run. If the actual price differs, do not force the old price into `.env`; the plan and ledger pricing must be revised first.

## 2. Approve and run

After reviewing the files above, run:

```sh
JEV_PLAN_HASH=$("$JEV_NODE" -p 'JSON.parse(require("node:fs").readFileSync("runs/compact-two-pass-development-v1/experiment.json", "utf8")).planHash')
"$JEV_NODE" scripts/compact-experiment.mjs \
  --live --approve-plan "$JEV_PLAN_HASH" \
  --max-cost-usd 0.75 --max-requests 192
```

This is the only paid command. It prints progress and stores every request, response and budget event. Existing `.env` values `TYPESAFE_API_KEY` (or `JEV_API_KEY`), `JEV_BASE_URL`, `JEV_INPUT_USD_PER_MILLION` and `JEV_OUTPUT_USD_PER_MILLION` are used. The frozen model selector is `jev-latest`; the actual returned version is recorded and a change halts the experiment. No Qwen server, promptfoo installation, browser or Codex task needs to stay running. Keep this Terminal and Mac awake until the process exits.

For a single-call compatibility check, append `--limit 1`. After it exits successfully, repeat the full command without that flag. Already-dispatched requests are not sent again. This is the same experiment and shared cap, not a new paid run.

## 3. Inspect progress and results offline

```sh
"$JEV_NODE" scripts/compact-experiment.mjs --status
"$JEV_NODE" scripts/compact-experiment.mjs --report
```

`--status` takes the same exclusive lock, so use it after the live process exits; watch that process's progress lines while it is running. `--report` writes `runs/compact-two-pass-development-v1/report.json`. Both are offline. The report includes per-case native answers, misses/false alarms/abstentions, missingness, other classifier judgments, length groups, transitions between arms, total paid usage and both stages' summed latency/input usage for complete cascades.

Inspect `primaryExcludingDisputedAcrostic` for the primary 45-case counts. All 48 cases remain in `authoredLabelSensitivity`, per-row records and transitions: the three attack-labeled `OUTPUT PASS` acrostic cases have an unresolved annotation dispute, disclosed before this run. Those authored-label transitions must not be presented as independently verified gold. No model output is used to relabel them. Score outputs stay descriptive rather than receiving invented correctness labels.

Raw evidence is in `runs/compact-two-pass-development-v1/{E,R,C,D}/records/`; exact bodies are in each arm's `requests/`; D's manifest binds each passed-through C response by hash. `report.json` is a recomputable projection; raw requests, responses, plan and ledger events are immutable. The current website and historical results are not overwritten or automatically published by this command.

## If it stops

- `compact_explicit_approval_and_caps_required`: use the exact plan hash and caps above.
- `compact_sources_changed_since_review`: code or prompts changed after preparation. Stop and review a new version; do not bypass the hash check.
- `missing_endpoint_configuration` or `missing_or_invalid_price`: check the existing `.env` locally. Never paste the secret into chat.
- `compact_price_differs_from_frozen_plan`: the ledger's price assumptions and `.env` disagree. Re-plan; do not conceal a price change.
- `preflight_response_failure`, a model-version change, missing usage, or an uncertain interrupted dispatch: preserve the files and stop. There are no automatic retries, and repeating the command cannot bypass a recorded failure. Unknown requests may have been billed, so their reservations remain held.
- A context-window rejection is a recorded provider failure; requests are not silently truncated or shortened. The offline byte reserve is not a verified tokenizer count or capacity guarantee.

To pause safely, prefer a bounded `--limit` invocation. Ctrl-C during a call may leave an uncertain dispatch requiring review; do not remove its ledger entry or reset the run. A normal limit-based stop can resume with the same approved command.

The implementation was verified offline with a complete **192-response simulated run**, resume/no-duplicate checks, native-answer leakage checks, failed-response stopping and approval/hash rejection. These are software checks, not Jev results. No live calls were made while preparing this handoff.
