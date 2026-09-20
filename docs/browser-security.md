# Browser and hosted security boundary

Updated 2026-09-20 for the public preview. These are scoped controls and tests, not a penetration-test certification.

## Credentials and identity

Optional Jev guidance holds a key in this tab's memory for at most 30 minutes. Reload, disconnect or expiry forgets it. Completing a request does not end the session. Authorized requests send the key through the service to TypeSafe; the server handles it transiently and does not write it to persistent storage, reports, errors or application logs. No default/operator provider key is configured. See [the session workflow](inline-assisted-workflow.md).

The hosted identity adapter trusts only Sites' authenticated dispatch headers. A different hosting provider must replace this adapter; do not expose this Worker directly to arbitrary identity headers. Every private run, report and contribution is checked against the authenticated owner. Anonymous users can read public pages, author policies offline and inspect explicitly shared evidence; they cannot upload or run paid requests.

## Browser and data controls

- Untrusted community strings use text nodes. Workbench template sinks pass through DOMPurify. Trusted Types adds enforcement where supported.
- CSP restricts scripts, workers and connections to reviewed local resources; inline/eval scripts, event handlers, frames, objects and remote connections are blocked. Existing chart layout uses inline styles.
- The original research HTML is hash-pinned before nonce assignment. Uploaded documents never receive that treatment.
- JSON bodies and nesting are bounded. SQL is parameterized. Writes require same-origin requests and an explicit intent header. Downloads use attachment, no-referrer, no-store and nosniff headers.
- Local drafts/preferences may use browser storage. Credentials do not. Nonextractable Web Crypto keys would not prevent malicious same-origin JavaScript from reading an unlocked field or using a credential; no such protection is claimed.

## Execution and storage

The provider destination is fixed to TypeSafe HTTPS. Redirects, oversized responses and credential echoes are rejected. Requests are rebuilt from the maintained compiler and checked against the frozen source identity. Durable dispatch claims precede provider calls; unknown outcomes retain holds and are never automatically retried. These are hosted observations, not provider-signed attestations.

Each account retains at most 100 prepared runs and 200 contribution bundles / 100 MiB. A bundle is at most 4 MiB. Durable minute windows additionally bound new preparation to 10 per account / 60 across the site, and upload/share/account operations to 20 per account / 120 site-wide per operation. Reads, cancellation and continuation of already-authorized runs are not throttled by these new-work gates. Limits fail closed when admission storage is unavailable. They reduce abuse; they are not a complete DDoS defense or provider-balance check.

If metadata admission fails, newly written blobs are removed only after a read confirms that no record owns them. An uncertain or committed insertion preserves private blobs for reconciliation. Deletion revokes public access before removing a contribution's blob.

## Reporting and operation

Use [private vulnerability reporting](../SECURITY.md) for credential exposure, private-data leaks or exploitable findings. Community content must be synthetic or shared with permission. Test payloads remain untrusted text; contributors must not upload real credentials or customer data. See the [public-preview runbook](public-preview-operations.md) for reports, takedowns, retention and recovery.

Automated tests cover ownership, private/public visibility, anonymous-write denial, CSRF, quota/concurrency boundaries, source identity, no-retry accounting, storage failure cleanup and provider redirect/echo rejection. Earlier local browser probes exercised active HTML/SVG payloads, CSP and Trusted Types using fake credentials. These checks are bounded and do not establish model safety.

The production dependency audit on 2026-09-20 reported no known advisories. The optional research Promptfoo tree retains an advisory-positive unused archive-extraction chain; see [dependency assessment](dependency-audit.md). A clean advisory scan is not proof of absence of vulnerabilities.
