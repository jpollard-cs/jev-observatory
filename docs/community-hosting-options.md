# Community Observatory hosting options

Researched 2026-09-19. This is a proposal, not a deployment or change to current sharing.

**ChatGPT Sites can host the community application.** Official documentation describes server-side authorization, ChatGPT sign-in, D1 for structured records and R2 for uploaded files. A public site can offer sign-in for identity-aware features. Sharing options depend on account/workspace settings. [Official Sites documentation](https://learn.chatgpt.com/docs/sites).

| Option | What it provides | Main tradeoff |
| --- | --- | --- |
| Sites with uploaded results | Policy library, versions, result uploads, comparisons, comments and review | Contributors run evaluations elsewhere and submit evidence; uploads need explicit provenance labels. |
| Sites plus an external evaluation runner | The same community experience with queued, reproducible evaluation jobs | Requires a separate worker, authorization, provider credentials and spending controls. |
| Independently hosted application and runner | Greater choice of identity, background execution, storage and deployment infrastructure | More operational work and migration of the current Site. |

## Recommended first version

Start with the first option. Contributors sign in, create or fork a policy version, attach a suite manifest, and upload a result bundle. Public browsing can be added later; submissions begin private and become shared through an explicit action. Keep GitHub as the source-code and issue-review home.

- Store policy revisions, authorship, parent revisions, suite identities, visibility and review state in D1.
- Store immutable result bundles and exports in R2, linked to their hashes and metadata.
- Identify a result by policy hash, suite hash, evaluator/source revision, provider model, input representation and run settings. Policy edits create new revisions rather than rewriting old evidence.
- Distinguish contributor-reported results from independently reproduced results. A file hash establishes content identity, not truthful execution. Keep omissions, failed requests, unasked outputs and denominators visible.
- Compare results only across compatible definitions, showing disagreements and tradeoffs rather than collapsing everything into one leaderboard score. Keep discovery cases separate from untouched evaluation sets.
- Treat uploaded red-team text as untrusted evidence: bounded structured imports, escaped display, per-owner access checks and schema validation. Never execute scripts or instructions from an uploaded bundle. Default exports omit credentials and private customer material.

## What must change in this project

The existing hosted Observatory is configured as a static build. The new local workbench uses Node filesystem access, local account locks and local credentials. Neither automatically becomes a multi-user backend when published.

Keep policy compilation and evaluation semantics in the domain layer. Introduce separate storage and identity adapters for the hosted application, using Sites' supported server runtime and logical D1/R2 bindings. Preserve the existing local runner for reproducible evaluation and local provider credentials. An upload-only community does not need to collect contributors' Jev keys.

Do not assume Sites can run the current local server unchanged or host arbitrary long-lived evaluation processes. The documented runtime excludes some background-service patterns; D1 has a 10 GB per-site limit, and account-level beta usage limits also apply. The documentation lists no fixed R2 storage limit, which is not a promise of unlimited account usage. [Runtime and storage limits](https://learn.chatgpt.com/docs/sites#understand-limits-and-unsupported-uses).

Before implementing hosted live execution, establish the worker/runtime limits, ownership of provider charges and per-user admission controls. Our initial recommendation leaves heavy evaluation in the local runner and focuses the Site on sharing, review and reproducible comparisons.
