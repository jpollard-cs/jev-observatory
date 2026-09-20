# Security

Report a suspected vulnerability through [GitHub private vulnerability reporting](https://github.com/jpollard-cs/jev-observatory/security/advisories/new). Include the affected component or revision, a minimal reproduction using synthetic material, expected and observed behavior, and the likely impact. Share only the information needed to reproduce the issue.

Do not put API keys, session credentials, private reports, customer data or exploitable vulnerability details in public issues or pull requests. Remove credentials from logs and screenshots before submitting them. If a key was exposed, revoke it with its provider; deleting a public post does not invalidate the key.

## Operating boundaries

The local workbench binds to loopback and is intended for a single-user local environment. Its Host, Origin and CSRF checks are not a substitute for authentication when exposing a service to a network. See its [security boundaries](workbench/docs/SECURITY.md).

The hosted service relies on Sites' authenticated dispatch boundary for identity, with server-side ownership checks and private-by-default run and upload storage. Other hosts must replace the trusted identity adapter. Treat deployment access controls, backups, retention, moderation and abuse handling as operator responsibilities; per-account quotas do not provide a complete abuse-management system.

Hosted Jev execution requires the contributor's own key and explicit request-and-budget review. The key is used transiently by the server and held in the tab's expiring credential session, not persistent browser/server storage or exports. The operator still handles it during dispatch. These controls cannot protect a key from malicious code already executing in the same page. See [hosted execution](docs/hosted-execution.md) and [credential lifecycle](docs/inline-assisted-workflow.md) for current behavior.

Uncertain provider dispatches retain spending reservations and are not retried automatically. Canceling prevents later dispatches; an in-flight request may still complete and be billable. Local allowances and byte-based estimates are not guaranteed provider invoice limits.

## Untrusted evidence

Policies, specimens, uploads and model responses can contain hostile text. Their content does not grant instruction authority or permission to execute tools. Community uploads are contributor-reported, and validation is not a reliable secret or personal-information detector. Review artifacts before sharing them.

Automated security and authorization tests are bounded software checks, not a penetration-test certification. Dependency scan results and their limitations are documented in the [dependency assessment](docs/dependency-audit.md) and [browser security notes](docs/browser-security.md). Historical validation records describe their recorded versions; they are not guarantees about every deployment.
