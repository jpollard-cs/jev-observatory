# Community Observatory

The portable browser workspace and community layer for the Observatory. The root introduces the workflow; `/workspace` preserves policy building, adaptive coverage, the interactive atlas and historical evidence. Community uploads and shared evidence live at `/community`; GitHub remains the review/versioning route for policy proposals. Reviewed hosted execution supports a contributor’s own Jev key and a persistent private spending ledger. CI never runs paid model requests.

See [Browser workspace](../docs/browser-workspace.md) , [Browser security](../docs/browser-security.md) and [Hosted execution](../docs/hosted-execution.md) for capabilities, implementation and remaining boundaries.

```sh
cd community-site
npm ci
npm run build
npm test
npm run dev
# Optional local-only account for testing uploads:
npm run dev -- --signed-in
```

Node 24+ is required for the SQLite development adapter. Local preview runs on `127.0.0.1:8795`; the policy workbench remains on 8794. The local server ignores incoming identity headers. Its explicit preview-account option is not compiled into the hosted Worker.

## Boundaries

- `src/domain/contracts.mjs`: pure JSON contracts, content identity, complete declared-case coverage and summaries.
- `src/service.mjs`: use cases with injected persistence/blob/clock/ID ports and explicit success/error results.
- `src/adapters/d1.mjs`: prepared SQL and atomic per-owner quotas. `scripts/local-storage.mjs`: SQLite/filesystem development adapter.
- `src/http.mjs`: bounded imports, JSON responses, server-side ownership and same-origin write checks.
- `src/worker.mjs`: Sites identity adapter, community assets and existing research routing. A non-Sites deployment must replace the trusted identity adapter; never expose the Worker directly while trusting arbitrary inbound identity headers.
- `src/workspace/`: browser adapters for the shared workbench compiler, planners and evidence.
- `public/`: dependency-free community UI. Uploaded strings use text nodes, never HTML. Animation transforms one prepainted decorative layer and honors reduced motion.
- `legacy/`: byte-preserved v4 Worker plus provenance. It still serves its existing R2 assets and APIs, under `/observatory`. Existing `/?tab=...` research bookmarks remain supported. No historical evidence or protected Data app runtime is rewritten.

D1 metadata and R2 bundles persist independently of deployments. There are no anonymous writes. Uploads start private, are immutable, and can be shared/withdrawn/deleted by their owner. Per-account limits: 200 bundles / 100 MiB, 4 MiB per bundle. JSON nesting is bounded. All ordinary uploads remain contributor-reported; claiming verification in bundle metadata is rejected.

## Portable bundle v1

Download `/api/community/example` for an explicit **not-run** example. Each bundle contains `format`, `version`, `title`, `model`, complete `policy` (`name`, canonical `hash`, `document`), `suite` (`name`, `definition.cases` with unique IDs and expected values), `provenance` (`sourceRevision`, `method`, `settings`, optional repository PR URL), and one `observation` for each case. Observation status is `ok`, `error`, `unavailable` or `not_run`. Successful observations preserve `observed`; errors use short codes, not raw credential-bearing provider messages.

All hashes use SHA-256 of recursively key-sorted compact JSON (array order preserved), compatible with workbench policy IDs. Downloads reproduce the canonical uploaded bundle and can be imported again; identity and visibility remain server-side. `GET /api/community/results?offset=N` exports public metadata in pages of 50 and returns `nextOffset`. Authenticated users use `mine=1` to enumerate their own private/shared files, then download each bundle. There is no secret field or raw provider-log import. Manual review remains necessary: schema validation is not a reliable secret/PII detector.

Data lives outside Git, while source, definitions and format contracts live in Git. Preserve downloaded bundles or an administrative storage backup when migrating: a source checkout alone does not copy live uploads. Rehosting also requires transferring D1/R2 data (or importing portable bundles), adapting identity and provisioning storage. The original research R2 assets remain bound to the current Site; the separate `site/` source and data in the parent repository provide its build provenance.

## Public-release boundary

Anonymous routes are implemented and tested. The Site and GitHub source are being released as a public preview. Browser upload identity initially uses ChatGPT sign-in; non-ChatGPT contributors can use GitHub PR attachments, and non-ChatGPT readers can browse shared content once public.

New-work admission uses durable per-account and site-wide minute limits in addition to retained-storage quotas. Security/privacy reporting and the operator takedown/retention procedure are documented in [the public-preview runbook](../docs/public-preview-operations.md). Automated backups and a dedicated moderation console remain follow-ups; this is a public preview, not a production abuse-management service.

See `../docs/community-verification.md` for the proposed signed regression-verification protocol. The hosted BYOK runner observes execution; it does not yet issue provider-signed or no-regression certificates.
