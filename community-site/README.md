# Community Observatory

The portable browser workspace and community layer for the Observatory. The root introduces the workflow; `/workspace` preserves policy building, adaptive coverage, the interactive atlas and historical evidence. Hosted-run contributions and shared evidence live at `/community`; GitHub remains the review/versioning route for policy proposals. Reviewed hosted execution supports a contributor’s own Jev key and a persistent private spending ledger. CI never runs paid model requests.

See [Browser workspace](../docs/browser-workspace.md) , [Browser security](../docs/browser-security.md) and [Hosted execution](../docs/hosted-execution.md) for capabilities, implementation and remaining boundaries.

```sh
cd community-site
npm ci
npm run build
npm test
npm run dev
# Optional local-only account for testing hosted contributions:
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

## Storage and evidence admission

Public admission accepts an owned, settled hosted policy run ID, display name and privacy-review acknowledgement. The execution port verifies saved requests and responses; the service constructs a complete version-2 bundle. Client files, answers, hashes, endpoints and verification labels are rejected. Legacy uploads are private and cannot be republished.

The label is **host-observed**, not signed, safe or no-regression. Scope is user-selected and visible; a mandatory PR core suite and independently signed receipts remain unimplemented. External/local reports go through GitHub review. Stopped runs retain failures and every planned request not run. Contributions start private; sharing is explicit. Downloads recheck the stored digest and serve JSON as an attachment.

Limits are 4 MiB per complete contribution and 200 contributions / 100 MiB per account. Oversized evidence cannot be truncated to fit. Private data remains outside Git. Manual privacy review is required; structural validation does not reliably detect secrets or personal information.

## Public-release boundary

Anonymous routes are implemented and tested. The Site and GitHub source are being released as a public preview. Hosted contribution identity initially uses ChatGPT sign-in; non-ChatGPT contributors can use GitHub PR attachments, and non-ChatGPT readers can browse shared content once public.

New-work admission uses durable per-account and site-wide minute limits in addition to retained-storage quotas. Security/privacy reporting and the operator takedown/retention procedure are documented in [the public-preview runbook](../docs/public-preview-operations.md). Automated backups and a dedicated moderation console remain follow-ups; this is a public preview, not a production abuse-management service.

See `../docs/community-verification.md` for the proposed signed regression-verification protocol. The hosted BYOK runner observes execution; it does not yet issue provider-signed or no-regression certificates.
