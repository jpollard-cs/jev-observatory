# Community preview validation — 2026-09-19

No provider requests or model charges were incurred for this change.

Seven automated integration tests pass against real SQLite persistence and filesystem blob storage, plus the compiled Worker. They cover restart persistence; anonymous and second-user reads of shared evidence; privacy before sharing and after withdrawal; download hash round-trip; ownership checks; anonymous/cross-origin write rejection; malformed/oversized/deep JSON; forged verification fields; missing/duplicate cases; incomplete-case denominators; concurrent quota enforcement and cleanup; consistency with the canonical workbench policies; and successful delegation to the unchanged historical Worker with a valid R2 asset fixture.

Browser checks used the local community app, an explicit local preview account and an anonymous session. Confirmed policy JSON inspection; upload of the clearly labeled not-run format example as private; sharing and anonymous case-by-case inspection; and removal from the anonymous listing after making it private. No browser warnings/errors were observed in the checked flow. The fixture stayed in local ignored storage and was never sent to the hosted service.

The existing Observatory Worker is retained byte-for-byte with a SHA-256 provenance record. The hosted project/bindings are unchanged; new metadata uses a distinct `community_results` table. The new deployment includes a generated Drizzle migration. Existing reports, policy decisions and evaluation datasets are not rewritten.

These checks are functional and authorization tests, not a security audit or proof of readiness for unrestricted uploads. Hosted platform audience remains owner-private. Public release still needs an operational decision on abuse handling, moderation/reporting, retention/backups and the trusted-runner proposal. Signed evidence verification is not implemented.
