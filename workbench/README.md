# Observatory · Jev Policy Workbench 0.5 rebuilt

A reconstruction of the intended 0.5 guided experience on the verified 0.4.1 source. **The lost candidate was not recovered.** This distribution is new source with fresh software validation, not a claim of byte-for-byte restoration.

## Start locally

Requires Node.js 22 or later. No package installation is needed to launch.

This copy is now the canonical workbench inside the Observatory repository. From the repository root:

```bash
npm run workbench
```

Open the printed address, normally `http://127.0.0.1:8794`. Alternatively, from this directory use `bash run.sh --port 8794`. Keep old folders for frozen plans made with those exact versions. The original research `.env`, complete `runs/` tree, Git history and spending ledger stay where they are. Starting the server does not read a key or send a model request. The [integration guide](../docs/workbench-integration.md) records fresh Mac validation; the original release manifest is preserved under `provenance/imported-0.5-file-manifest.json`.

## The main journey

**Describe the application → Review rules → Choose tests → Authorize run → Inspect results.**

The workflow rail counts reviewed setup steps separately from execution. Historical reports remain immediately accessible; they never mark a new draft as tested. Review acknowledgements and drafts are saved in browser-local storage. Editing the description or policy invalidates the relevant reviewed state and advice. Saved plan files remain on disk; this release does not automatically reattach an active saved-plan screen after a full browser reload.

### What is new

- A guided starting page with blank application fields for a new visitor, three reviewed task starters, compact policy tradeoffs and optional setup assistance.
- A rules page organized around what can be admitted, held or rejected; attached help and collapsed advanced detail rather than paragraphs beside every input.
- A coverage planner with dollar budget first, clear forecast versus conservative planning allowance, explicit unused headroom, and an optional whole-plan input-size limit under Advanced.
- A separate exact-plan review screen. Saving a plan or copying a Terminal command is not a completed run.
- One optional native Jev setup request with **16 small Choices**, rather than free-form policy generation. Suggestions show old → proposed values, consequences and uncertainty, start unchecked, require explicit selection, and support guarded undo.
- Source-bound setup report import, stale-advice rejection, distinct setup/ranking/tagging purposes, and existing single-use local paid confirmation/ledger handling.

### What is retained

The galaxy defaults on. The interactive atlas, original 15,120-cell matrix plus 64 extensions, Jev-assisted coverage ranking, 60-case tailored catalog, six historical reports, source-preserving compilers, and evidence explorer are retained. The original matrix and tailored admission catalog remain **different evaluation contracts**.

The Evidence explorer scoping fix and large-budget support were already in 0.4.1; they are inherited and rechecked here, not represented as newly discovered repairs.

## Optional setup advice

1. Describe the workflow without secrets or customer documents.
2. Choose **Prepare setup suggestions**. This writes a request, not an API call. Inspect the exact payload.
3. Load a session key on **Local Jev connection** when needed. Connecting remains offline.
4. Review the destination, model, single request and cost limit. Confirm only to make that paid setup request.
5. Select changes individually, inspect their consequences, and apply. Nothing is checked or applied automatically.

The request uses the existing frozen `jev-1.13.0` contract. Verify provider support before a live smoke test. We have not collected live setup results. The default setup stage limit is $0.01: an editable local allowance, not a service minimum or bill. Estimates still use the frozen historical rate and byte heuristic.

Setup suggestions never edit budgets, credentials, endpoints, tool permissions or expected test answers. A suggested mode can change the assessed operation, and a language-scope/list suggestion can broaden or narrow admitted content; those consequences are visible before applying. Switching mode clears exceptions rather than granting any. Task matching selects a representative starting point, not proof that built-in tests represent your application.

## Keys and spending

Keys can be pasted for the running server session, loaded from the explicitly selected project/account `.env`, or read from the process environment. The key is not persisted in browser storage or exported artifacts. Loading alone makes no provider call. Forget prevents subsequent use; an already-dispatched request can finish and remain billable. This is not OS-keychain storage, secure-erasure certification, or protection against local malware.

Setup/ranking/tagging can use the guarded local UI. Evaluation and original replay still use separately approved CLI commands. A key pasted into the server is not inherited by those other Node processes.

A plan budget is not an account-limit increase. Preserve the original research account's $3 authorization and unresolved holds. New users can explicitly create separate standalone accounts, but must not use one to evade this research ledger. Large planning amounts are accepted: when all eligible tests fit, unused budget stays unused.

## Validation

See `validation/receipt.json` and `docs/ACCEPTANCE-0.5.md` for this reconstruction's checks. Historical receipts describe their own releases.

```bash
npm run verify
npm test
node --test vendor/admission-v1/vendor/compiler/tests/compiler.test.mjs
node scripts/audit-rebuild.mjs --baseline /absolute/path/to/unmodified-0.4.1
node scripts/validate-replay-scale.mjs
```

All of these are offline; the replay test uses synthetic transport and a temporary test ledger. Browser development QA requires Python Playwright and Chromium, not runtime dependencies.

**No new live model results, deployment, publication, or original-account changes are included.** Read `docs/HANDOFF.md` before reconciliation into a working Git checkout.
