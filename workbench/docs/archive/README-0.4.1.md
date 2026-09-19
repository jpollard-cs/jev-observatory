# Observatory · Jev Policy Workbench 0.4.1

A local policy and evaluation workbench with an interactive galaxy atlas, source-linked evidence, configurable guardrails, budgeted test selection, and original-suite replay. Experimental research software, not a proven production security boundary.

## Start

```bash
bash "$HOME/Desktop/jev-policy-workbench-0.4.1/run.sh"
```

Open the printed address, normally `http://127.0.0.1:8791`. Node.js 22 or later is required. No package installation, credentials or provider calls are needed just to start.

## This update

**Evidence explorer works again.** It had an undefined-variable exception; the recovery renderer compounded the failure. The fix is tested with real ES-module boundaries against every condition in all six bundled reports. Historical expectations and responses are unchanged.

**Local Jev connection** lets you paste a key into a password field for the running server session, or explicitly read the selected account/project `.env` or the process environment. Only the API-key variable is read. Keys are not saved in browser storage, reports or project exports. Connecting is offline; a saved advisor plan requires separate, explicit paid confirmation. The web run supports coverage relevance and review-only catalog tagging. Evaluation/replay still uses its explicit CLI command and its own environment/project credentials.

**Larger budgets are valid.** Previewing $50 does not create extra tests or authorize $50 in charges. A preview reports that the eligible catalog fits and shows the unused amount. The connected account's separate authorization still applies. Existing research projects retain their $3 ledger and history. An unrelated new user may explicitly create a standalone account with a chosen authorization; existing accounts are not reset.

**Irrelevant fields no longer block unrelated actions.** Browse reports or compile a policy with an unfinished test budget. Matrix-only factors are disabled for extension-only suites. Tagging does not require a finished relevance policy/application. The optional input-size planning limit can be left blank.

## Use the local advisor

Local Jev connection → choose credential source and account → **Load key locally** → Coverage advisor → save exact relevance/tagging requests → **Review and run locally** → inspect cost/data disclosure → **Confirm paid advisor run**.

Nothing calls TypeSafe on connection, navigation or preview. Cancel sends nothing. After a completed advisor run, the report imports automatically. Forget stops future requests; an in-flight call may still finish and be charged. A loaded key is not marked provider-validated until this session receives a fresh valid response.

For this research project, keep the original project and `.env` at:

```text
/Users/jordan/Documents/Codex/2026-09-16/i-g/outputs/jev-redteam
```

The original project's account, raw evidence, Git history and saved plans are not replaced. Do not create a replacement account to evade its budget or unresolved requests. Retain previous version folders for their frozen plans. The new source identity requires newly prepared plans.

## Catalogs and recorded evidence

The application-tailored planner retains 60 cases with 32 granular coverage groups. The separate Original evaluation suites retain all 15,120 original factor-expanded cells plus 64 boundary cases. Original judge/moderation/integrity expectations are not silently reused as admission answers. The matrix has 12 semantic lineages, not 15,120 independent attacks.

The galaxy is enabled by default. Atlas positions are display conventions, not learned semantic clusters. Catalog points are unrun definitions, not successful measurements. Six archived reports are available; viewing them requires no key or new model calls.

## Development and validation

```sh
npm test
node --test vendor/admission-v1/vendor/compiler/tests/compiler.test.mjs
npm run verify
# Optional full-size simulated execution, no provider calls:
node scripts/validate-replay-scale.mjs
```

- `docs/LOCAL-CONNECTION-AND-FIXES.md`: repaired behavior, threat model, authorization and limitations.
- `docs/HANDOFF.md`: reconciliation and provenance.
- `docs/ATLAS-AND-SUITES.md`: retained 0.4 suite/atlas specification; current budget/key amendments are above.
- `scripts/ui-browser/README.md`: module-faithful browser QA and environment limitation.
- `validation/receipt.json`: current checks; software and simulated transport are not new model measurements.
- `provenance/parent-workbench-0.4.zip`: unchanged preceding distribution and its nested provenance chain.

No OS Keychain persistence, automatic arbitrary policy generation, hosted credential collection, or production enforcement gateway is implemented. Local memory does not protect against a compromised machine or browser. Nothing has been published to the hosted Observatory.
