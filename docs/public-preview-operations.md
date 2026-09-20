# Public preview operation

The public site permits anonymous reading and offline authoring. Hosted execution and uploads require a signed-in account; all new evidence stays private until its owner shares it. The operator supplies no inference key. Hosted identity currently uses ChatGPT; reading and the GitHub/local workflow do not.

## Reports and takedowns

Report security/privacy problems, exposed credentials and sensitive test material using [private vulnerability reporting](../SECURITY.md). Report other content problems with a GitHub issue containing the contribution ID/URL and reason; do not repeat harmful or private material in the issue. Link a report to the immutable bundle hash when available.

The maintainer should inspect only the minimum metadata necessary and contact the contribution owner to withdraw it. If the owner is unavailable, use the hosting operator's database controls to set that exact `community_results` record's `visibility` to `private`. Confirm the public metadata and download routes return 404 without ownership. If that cannot be done promptly, restrict the site's audience while resolving the incident. Never silently replace an uploaded bundle or its recorded outcome.

This preview has no staffed moderation service or guaranteed response time. No automatic classifier certifies uploaded content. Do not upload production secrets, personal data or material you cannot legally share.

## Limits and containment

New work has durable per-account and global minute limits, plus retained-storage quotas. Provider execution is BYOK with explicit request review, one active run per account and held reservations for uncertain charges. Local dollar allowances are not invoice guarantees. There is no paid model execution in GitHub CI.

If abuse or an identity-boundary issue is detected, restrict the Sites audience first. Preserve evidence and unresolved spending holds. Do not resume or retry an uncertain provider dispatch simply to clear a UI error. The public preview is not an unrestricted production service.

## Retention and portability

Contributors can export their portable bundles and withdraw/delete their own community uploads. Hosted execution evidence remains private and retained for provenance/accounting, subject to its 100-plan cap. There is no automatic expiry policy or promise of indefinite storage. Report deletion/privacy requests privately with the affected IDs, never a provider key.

Source control is not a database backup. Before changing storage bindings, migrations that remove data, or rehosting, the operator must obtain and verify a recoverable D1/R2 snapshot through the hosting administration controls. Keep any private backup outside Git and public downloads. Capture metadata and blobs together, test owner isolation after restore, and preserve hashes, visibility and unresolved holds. Current migrations are additive; existing uploads and runs are not reset by release.

An ongoing automated backup/export job and a dedicated moderation console remain follow-ups. Keep an independent download of evidence you need to retain; do not use this preview as your sole archive. Missing operator backup capability must be resolved before any destructive migration or a general availability promise.
