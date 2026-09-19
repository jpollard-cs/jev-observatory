# Local credentials, meaningful budgets, and Evidence explorer repair · 0.4.1

This release changes the application and orchestration, not the historical evaluation labels or model results. No real provider inference was performed while implementing it. The existing original-project ledger is not copied, reset, or edited by this distribution.

## 1. Evidence explorer: a reproduced runtime failure

In 0.4, `public/app.js:evidencePage()` referenced `fields` and `judgment` without defining them in that function's scope. Entering Evidence explorer threw `ReferenceError: fields is not defined` before rendering its content. The error handler attempted to render the same broken view again, compounding the failure. This was a client runtime bug, not missing recorded evidence or a need to rerun Jev.

The repair derives both values from the active recorded condition. Error presentation no longer calls the failing renderer recursively; the navigation remains usable and a retry control is shown. The explorer is tested against every condition in all six bundled reports, including field availability, filters, expected distributions, repeated identities, and row inspection.

The prior browser QA helper removed imports/exports and concatenated modules into a shared closure. That changes JavaScript lexical scoping and can mask missing bindings. Its historical pass count is not valid evidence against this failure. The current helper loads each actual UI file as a separate ES module. Only the API transport is bridged through the real localhost HTTP server. Direct browser navigation to localhost is blocked in this build environment; Host/Origin/CSRF checks and real static resources are also tested independently via HTTP. A normal direct-browser check on the maintainer's computer remains valuable.

## 2. Local key entry

The Local Jev connection view offers three sources:

- Paste a key for this running Node server session (the default).
- Read `TYPESAFE_API_KEY`, falling back to `JEV_API_KEY`, from `.env` in the explicitly selected project/account directory.
- Read the same variables from the server process environment.

No `.env` upload is needed. File reading uses Node's parser, never a shell or `source`. Other environment-file values cannot alter the inference endpoint, policy, budget, or executable commands. Credential files are limited to 64 KiB. Direct keys are validated without echoing their values into an error.

The submitted password field is cleared immediately. The key is held in a private closure in the local server, not in localStorage, sessionStorage, a cookie, saved plans, reports, source snapshots, or command-line arguments. The UI receives only loaded/not-loaded status, the credential-source kind, and account metadata. Reloading a tab does not end the server session. Forget removes the stored reference and prevents another request from starting; an already-dispatched call may still finish and remain billable. Stopping the server ends its credential session. Memory lifetime is not a claim about secure erasure or operating-system swap.

No OS Keychain integration is implemented, and no plaintext key file is created. Existing `.env` files remain the user's files. CLI evaluation/replay processes do **not** automatically inherit a key pasted into another Node process: those commands continue using their documented environment/project credential source. The web flow in this release runs the saved coverage-ranking and catalog-tagging stages only.

### Paid-call boundary

Loading a key does not test it against TypeSafe. The UI says “loaded, not yet validated” until a fresh, valid pinned-model response is received during an approved run. Reusing cached results never validates a newly entered key.

1. Save an exact ranking/tagging plan offline.
2. Review its data disclosure, fixed TypeSafe endpoint, model, request count, estimated/reserved cost, per-stage ceiling, and local account allowance.
3. Confirm that exact paid metadata stage. The server issues a five-minute, one-use authorization tied to the plan and current credential generation. Cancellation sends no provider request.
4. Requests execute through the existing lock, append-only reservation/settlement ledger, native validation, and no-retry rules. The completed report imports automatically; the canonical cache tolerates JSON whitespace differences while preserving original imported bytes separately.

Changing or forgetting a key invalidates old confirmations. There is no generic arbitrary-endpoint proxy, arbitrary-payload execution API, or browser endpoint for running an entire evaluation campaign. Only locally saved metadata plans with validated hashes and execution sources can be authorized. Invalid response, model change, unknown usage or transport failure stops subsequent calls; uncertain reservations remain visible.

Requests go to `https://api.typesafe.ai/v1/systemone` over HTTPS. The credential transport refuses other destinations and redirects, imposes a timeout and a bounded 2 MiB response stream, removes literal credential echoes from successful responses, and masks HTTP-error bodies. Error records may therefore contain a redacted transport error rather than original provider text. This protects against accidental secret logging; it is not provider-signed provenance or a claim that every transformed echo can be recognized.

The server binds only to loopback, validates Host and exact Origin, rejects cross-site/same-site cross-origin API access, requires a CSRF token and JSON for state changes, and serves local assets with a restrictive CSP. These controls are not a defense against local malware, a privileged browser extension, or malicious same-origin code. This is a single-user local tool, not a multi-user hosted credential vault.

## 3. Budget is an allowance, not a spend target

The former $0.40 workflow, $0.05 metadata, $3 replay-planning, and 10-million input-unit validation maxima were local experimental restrictions, not Jev service limits. New plan inputs accept positive finite amounts representable by the integer nano-dollar ledger. A $5, $50 or $1,000 planning budget is no longer rejected simply because the supported catalog is cheaper. Invalid values, negatives, infinities, and accounting overflow still fail.

Each preview shows:

- the entered budget;
- the conservative allowance for all eligible catalog requests under the selected variations;
- the selected suite's allowance;
- unused budget; and
- whether the whole eligible catalog fits both planning constraints.

When all eligible tests fit, the screen says so. It does not manufacture extra tests or repetitions to spend unused funds. A smaller tier can still choose fewer cases. A large dollar value alone is not “in budget” if an active token-size limit binds.

The optional input-size planning limit can be cleared. Null means no additional user token-planning constraint, subject to safe integer arithmetic; it does not remove the provider's per-request context limits. The byte-based forecast/reservation convention is unchanged and remains an estimate, not a tokenizer or a guaranteed invoice cap.

### Planning versus permission to spend

A planning allowance does not raise an account's total spending authorization. Existing original research projects retain the shared $3 ledger, prior usage, unresolved holds, and history-floor checks. Selecting another key or directory must not be used to evade that history. A nonexistent explicitly selected project fails rather than silently creating a new account.

An independent user can explicitly initialize a new standalone account with a chosen total authorization, including a larger value. Its persistent directory defaults outside the versioned application folder. Existing standalone accounts keep their recorded authorization; this UI does not reset them or provide an automatic increase of an existing limit. Account totals are local accounting, not TypeSafe balances.

## 4. Validate only the inputs needed for the action

Switching an original suite no longer tries to build a paid plan using an unfinished budget. Preview/save validates that active plan; navigation, report browsing, exporting a selection and compiling a policy do not validate unrelated planner fields. Matrix-only factors are disabled and canonicalized for extension-only selection. An inactive language allowlist is discarded in any-language mode, while active allowlists remain validated. Catalog tagging ignores irrelevant incomplete policy/application drafts; relevance ranking still requires them.

Critical active settings are not silently clamped, and structural request/model/schema limits are not bypassed. Source and schema changes require newly frozen plans. Use the old source folder to resume an earlier frozen plan.

## 5. Reproduction

```sh
npm test
node --test vendor/admission-v1/vendor/compiler/tests/compiler.test.mjs
node scripts/audit-release.mjs --baseline /absolute/path/to/unmodified-0.4
# With the app already running; Python Playwright + Chromium needed only for development QA:
WORKBENCH_TEST_URL=http://127.0.0.1:8791 python scripts/ui-browser/release041.py
npm run verify
```

The new connection tests use unmistakably synthetic test keys and a injected synthetic inference implementation. They never call TypeSafe. No simulated model findings are shipped as real dashboard evidence.

## Primary references

These inform the design; they do not independently certify this implementation:

- TypeSafe quick start: https://docs.typesafe.ai/introduction/quickstart
- OWASP HTML5 Security (localStorage / sensitive information): https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html
- OWASP CSRF prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
