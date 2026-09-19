# Security boundaries and operating limits

## Local service

The HTTP service binds only to `127.0.0.1`, validates the Host header, enforces exact-origin plus per-process CSRF tokens on POST, serves an allowlisted set of public file types, and does not expose the filesystem, `.env`, vendor tree or runtime evidence as static resources. Responses set a content-security policy and disallow embedding. Model/source text is escaped before HTML display; it is never executed as a template, HTML script or command.

There is no HTTP “run model” endpoint. The browser can compile, plan, freeze local artifacts and import a report. File imports are bounded to 32 MiB and supported schema families. Local imports may contain sensitive information and remain on the user's machine; they are not redacted automatically or uploaded anywhere. A local attacker with access to the process/filesystem is outside this boundary.

## Credentials and inference

Only explicit CLI `run --live --confirm <full-plan-hash>` can load the account/project `.env`. The native provider configuration and existing TypeSafe transport are reused. The target endpoint is fixed to first-party `https://api.typesafe.ai/v1/systemone`; redirection is disabled. API keys and request headers are not persisted in the evidence. No credentials are bundled.

Never paste a key into the policy, specimen, report or website. Do not run a supplied command copied from untrusted source material; the application-generated execution command quotes path values and binds the exact prepared plan.

## Policy and context

Only the consumer configuration can select an exception; a source claim cannot. An exception does not promote data into instructions, allow a tool effect, disclose information, or expand source authority. Shared context resolution does not create isolation between multiple entries inside one model request: this version sends entries separately.

Context authentication is a claim made by the integrating host, not something this prototype cryptographically verifies. A language restriction controls intended input eligibility, not blast radius. Real action permissions, network egress, disclosure allowlists, source identity and approval gates remain separate host controls.

## Parser and model failures

Invalid output is an error, never benign. Missing decisive findings yield review in the code mapper. Provider errors, missing usage, inconsistent model versions and uncertain dispatches stop new work. Unknown calls keep reservations. There is no automatic retry or silent budget reset.

The normal native classifier, like other model-based guards, can be influenced by adversarial input. Field structure and model-native examples are not an injection-proof boundary. Tests must include attacks against the guard itself, legitimate exceptions, and ordinary usable inputs.

## Storage

Plans and evidence are written with restrictive file modes using the retained immutable-writing primitives. Existing original sources and old run artifacts are not edited. Each frozen run includes exact requests, evaluation-only labels, source snapshots, raw response capture, reservation/settlement events and report metadata. Treat those artifacts as potentially sensitive until reviewed.

The initial code has automated domain, parser, ledger and HTTP boundary tests. This is not a penetration-test certification or a complete threat model for a multi-user hosted service. Do not expose the local service to a network by reverse proxy and assume these single-user protections suffice.


## 0.2 selector boundaries

The relevance stage receives the application description, policy and descriptor metadata only after explicit CLI approval. Do not put confidential customer content in the descriptor field. Model instructions prohibit treating embedded directives as authority, but this is not a guarantee that Jev resists selector injection. Owner floors and the independent allocation lane limit consequences; the experimental rankings still require adversarial evaluation.

Report hashes are local integrity checks, not signed provider attestations. A paid evaluation using advice requires settled matching response hashes in the same local account ledger. Tags never mutate authoritative coverage, eligibility, costs, cases or oracle annotations. No report import can start inference. The browser/API retains Host and Origin/CSRF checks and binds only to loopback.
