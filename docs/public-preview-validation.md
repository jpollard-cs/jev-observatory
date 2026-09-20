# Public preview validation — 2026-09-20

This release keeps existing private reports private while making the source and public viewing surface available. It does not publish account ledgers, keys or local raw runs.

- A source-only checkout passed 200 research/harness tests and the prior 333 workbench tests without model credentials. The scope change then passed all 336 workbench tests.
- Community checks cover hosted ownership, request integrity, authorization, browser compilation parity, credential lifecycle and untrusted rendering. Added regressions cover durable write limits, failed database acknowledgments, private withdrawal under throttling, explicit limited-scope planning and malformed imported scope metadata.
- Local browser QA reproduced the unsupported-capability block, explicitly selected available policy tests, saved the plan and reached the final authorization with all three untested boundaries displayed. No provider requests were sent. Rules and planner panels stack vertically; the guidance heading stays inside its padded container.
- Gitleaks scanned all 19 pre-release commits and deeply nested source archives. Reviewed false positives were limited to specific hashes, synthetic case identifiers and one JavaScript expression. No detector, file or commit was broadly excluded. A separate exact-match scan of locally configured credential values and common encodings found none in reachable Git blobs or nested archives; credential values were never printed.
- The hosted production dependency audit reported no known advisories. The optional research Promptfoo dependency chain retains the documented three high-severity package entries; it is absent from the hosted execution runtime. See [dependency assessment](dependency-audit.md).
- Original evidence/vendor/provenance integrity checks verify 205 preserved imported files. Historical measurements and immutable source archives are unchanged.

CI repeats offline tests, browser/Worker builds and secret scans without provider keys. These are bounded regression and release checks, not a penetration-test certification. Public deployment identity checks and release status are verified separately during publication. See the [operations runbook](public-preview-operations.md).

## Published release receipt

The implementation commit is `a0b98b6220a60f4f27451eca470b3cb9eb0ea277`. [GitHub CI](https://github.com/jpollard-cs/jev-observatory/actions/runs/35517630748) passed 200 research tests, 336 workbench tests and 51 community tests (587 total), plus source-integrity, build and secret checks.

The source repository is public and GitHub private vulnerability reporting is enabled. Redteam Observatory version 8 and the older Jev Observatory version 16 deployed successfully, both with public viewing access. Their site-source commits are `32ece7527556d6e5c9f5dc557bf25b16a3bbfcad` and `dcc848bfb5f85102fec2e3a0083cfef393554d36`, respectively.

Anonymous HTTP checks, without cookies, credentials or a Sites bypass token, confirmed on both domains:

- Landing, workspace, community and public result listing: HTTP 200.
- Execution/community sessions: `signedIn: false`, including requests with forged authenticated-user headers.
- Run preparation and contribution uploads with those forged headers: HTTP 401.
- Workspace content includes its Content Security Policy.

These checks sent no provider calls, uploaded no contributions and exposed no private reports. The temporary mock browser tab, server and its storage were removed. A repository-wide license is still awaiting selection; public availability alone grants no additional license.

## Anonymous access recheck

After the language-review release, cookie-free production requests confirmed public HTTP 200 for the landing page, workspace, community, catalog and public result list. Both session endpoints reported signed out with no account or private runs. Private-only listings and execution detail returned HTTP 401. The community list was empty; publishing the site does not automatically publish private contributions.

The neutral domain's archived research route exposed a separate-storage issue: its historical Data HTML assets remain in the original site's bucket. Read-only archive links now redirect to that original public origin, preserving only the view and tab query parameters. The workspace and community remain on the neutral domain; no stored evidence was copied or made public.

## Planner continuity and bounded parallel execution — 2026-09-20

The former archive redirect back to the Jev domain is superseded: both `/observatory` entry points now open the canonical workspace Outcome atlas. Public pages at the old Jev domain redirect to their canonical counterparts, stripping query parameters. Private API routes, storage and historical evidence are retained.

Planner inputs now commit on input without replacing the clicked control on blur. Editing options immediately invalidates the old preview. Workspace steps use bounded URL fragments so reloads preserve the active step; request bundles remain explicitly ephemeral. Local browser QA found the prior budget edit reverting from $0.30 to $0.15 after preview; the revised first-click preview preserved and used $0.25. The reported literal jump to the public homepage was not independently reproduced.

Execution defaults to batches of up to three parallel provider requests, with a serial option. Integration tests verify overlap, exact manifest identities/order, duplicate-claim rejection, full-run settlement, cancellation with unknown charges, storage-failure holds and no replay. Mocks never contact a provider. Existing single-request clients remain compatible. These checks establish bounded orchestration behavior, not a measured Jev throughput improvement.

The local mock browser run showed `9 / 74 recorded · 3 in progress`, then settled at 12 recorded and zero held after Stop. Reload retained `/workspace#planner`. All 341 workbench tests passed. The mock key was synthetic, and the preview blocks outbound provider fetches.
