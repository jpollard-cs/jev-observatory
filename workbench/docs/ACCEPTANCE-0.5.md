# Acceptance · rebuilt 0.5

## Fresh results

`validation/receipt.json` is the current summary. `validation/rebuilt-0.5/` contains TAP logs, full browser assertions, source comparisons, scale simulation and source IDs. Synthetic outputs are not new model evidence.

272 workbench tests (including 26 new setup tests) and 54 retained compiler tests passed. The browser suite passed 242 assertions covering 88 conditions / 6,224 displayed rows, the guided journey, budgets, modal help, tall/mobile navigation, and one fake setup request. Display rows include historical references, dependent rows and unattempted definitions.

The real server's HTTP boundaries were exercised independently through tests. Browser module boundaries were preserved. Direct browser → loopback and served CSP were not validated in this restricted environment.

## Reproduce direct browser acceptance on the Mac

Python Playwright and a compatible Chromium installation are developer test dependencies, not application runtime requirements. Use a **temporary synthetic account**, never the original `.env` or real ledger:

```bash
cd /absolute/path/to/jev-policy-workbench-0.5-rebuilt
TEST_RUNTIME="$(mktemp -d)"
export WORKBENCH_MOCK_RUNTIME="$TEST_RUNTIME"
node scripts/ui-browser/mock-setup-server.mjs
```

In another Terminal (using the exact printed temporary path):

```bash
python scripts/ui-browser/acceptance05.py   --base http://127.0.0.1:8793   --mock-runtime /the/exact/temporary/path   --out /a/separate/browser-check-directory
```

Do **not** add `--bridge` for the Mac's direct-server acceptance. `--chromium /path/to/Chromium` can select an installed browser. The mock accepts only `SYNTHETIC_ONLY_BROWSER_SETUP_KEY_050`; it has no real provider transport. Stop only that mock process afterward. Read the scripts before deleting any temporary path.

## Cases specifically checked

- No call on typing, key load, setup preparation, request inspection or cancellation.
- One setup request after exact consent; single-use/expired/changed-key tokens rejected.
- Empty selections cannot apply; broad changes stay unchecked; language-only selection leaves other settings unchanged.
- Undo restores exact before state and refuses later-edited drafts.
- Changed policy/application rejects stale advice and ranking caches reject setup-purpose reports.
- Errors/missing usage/model changes retain the appropriate ledger treatment; no retries hide uncertainty.
- Full per-request source identity, exact raw answer validation and historical model findings retained.
- Large budgets and blank unrelated budgets do not crash or block evidence. Coverage exhaustion leaves headroom.
- Historical report replacement, all conditions, expected-block filter and correct observation inspector.
- Mobile help available by tap/focus and dismissible by Escape; viewport-sized menu; no horizontal overflow.

## Security scope

These tests are not a professional security audit or proof of isolation against an adversarial model response, local malware or compromised extension. Memory-only keys are not secure-erasure guarantees. The browser never receives a stored key back. Account budgets remain local accounting conventions, not externally guaranteed provider invoice caps.

## Live-model gate

No live setup call was authorized or performed. After direct-browser testing and review, approve a separate tiny provider smoke before relying on its suggestions. Do not equate correct synthetic plumbing with model competence.
