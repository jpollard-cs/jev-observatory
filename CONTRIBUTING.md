# Contributing

Use a GitHub issue for a reproducible bug or proposed change, and a pull request for source, policy, test or documentation changes. Report security vulnerabilities privately through [SECURITY.md](SECURITY.md). Never include API keys, private customer material or raw credential-bearing provider logs in issues, pull requests or attachments.

## Local checks

Use Node.js 24 or later. From the repository root:

```sh
npm test
npm run workbench:test
npm ci --prefix community-site
npm run build --prefix community-site
npm test --prefix community-site
```

The research and local workbench tests need no package installation. Community tests/builds use its pinned dependencies; installation downloads packages. These checks use local fixtures and synthetic provider responses, require no model credentials and make no paid inference calls. CI must keep that boundary. The optional root Promptfoo tooling is separate from these checks.

Add meaningful regression coverage for changed behavior, especially request identity, policy precedence, missing/error outcomes, ownership, credential handling and budget accounting. Run the relevant browser flow for UI changes and record which checks were actually performed. Do not describe a synthetic test as a model observation.

## Policy and evidence changes

Canonical policy definitions live in `workbench/src/policy.mjs`; complete profiles live in `workbench/examples/`. Keep the reviewed `community-site/catalog/` projection consistent. Read the [policy library guide](policies/library/README.md) before changing component dependencies, exceptions or precedence.

Use the pull request template to identify the concrete behavior change, affected policy and suite hashes, input strata, observed errors and coverage gaps. Keep expected labels outside model requests. Preserve matched attack/benign controls, separately identified experiments and the distinction between classification and permission to act.

Do not silently rewrite frozen requests, labels, reports or provenance. A corrected interpretation or rescoring needs an explicit derived artifact with source references. Keep historical source bindings and original unknown/error outcomes intact. Content hashes establish integrity; they do not independently authenticate a model response.

Community uploads remain contributor-reported. Do not label them signed, independently reproduced or regression-free without evidence for that claim. A passing finite suite is not proof of safety. See the [evaluation protocol](docs/evaluation-protocol.md) and [community verification design](docs/community-verification.md).

## Paid execution and private artifacts

No pull request or CI run authorizes provider spending. Live work requires a separately reviewed request plan, explicit account allowance and the runner's execution confirmation. Never use repository or operator credentials in a contribution. Preserve existing ledger history and unresolved reservations; do not reset an account to bypass a stop.

Keep `.env`, raw run directories, local ledgers, hosted exports containing private material and model weights out of Git. Review an export before sharing it: schema validation is not a reliable secret or personal-information detector.

## Source boundaries

Read applicable `AGENTS.md` files before changing a component. The historical `site/` Data app includes protected runtime and provenance checks; ordinary content work must respect those boundaries. Rehosting the community Worker requires replacing its Sites-specific trusted identity adapter.

The repository currently has no repository-wide open-source license. Do not add third-party source, datasets or assets without documenting their origin and applicable permissions, or assume the repository grants rights to copied dependencies and runtime code.
