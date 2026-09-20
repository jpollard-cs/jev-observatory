# Public preview validation — 2026-09-20

This release keeps existing private reports private while making the source and public viewing surface available. It does not publish account ledgers, keys or local raw runs.

- A source-only checkout passed 200 research/harness tests and the prior 333 workbench tests without model credentials. The scope change then passed all 336 workbench tests.
- Community checks cover hosted ownership, request integrity, authorization, browser compilation parity, credential lifecycle and untrusted rendering. Added regressions cover durable write limits, failed database acknowledgments, private withdrawal under throttling, explicit limited-scope planning and malformed imported scope metadata.
- Local browser QA reproduced the unsupported-capability block, explicitly selected available policy tests, saved the plan and reached the final authorization with all three untested boundaries displayed. No provider requests were sent. Rules and planner panels stack vertically; the guidance heading stays inside its padded container.
- Gitleaks scanned all 19 pre-release commits and deeply nested source archives. Reviewed false positives were limited to specific hashes, synthetic case identifiers and one JavaScript expression. No detector, file or commit was broadly excluded. A separate exact-match scan of locally configured credential values and common encodings found none in reachable Git blobs or nested archives; credential values were never printed.
- The hosted production dependency audit reported no known advisories. The optional research Promptfoo dependency chain retains the documented three high-severity package entries; it is absent from the hosted execution runtime. See [dependency assessment](dependency-audit.md).
- Original evidence/vendor/provenance integrity checks verify 205 preserved imported files. Historical measurements and immutable source archives are unchanged.

CI repeats offline tests, browser/Worker builds and secret scans without provider keys. These are bounded regression and release checks, not a penetration-test certification. Public deployment identity checks and release status are verified separately during publication. See the [operations runbook](public-preview-operations.md).
