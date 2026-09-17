# Dependency advisory assessment

Checked 2026-09-17 02:45 UTC using read-only npm audit/registry queries and installed source inspection. No packages, lockfiles or runtime configuration were changed. No benchmark calls or exploit payloads were executed.

**The three high findings are three package nodes in one optional dependency chain, with two underlying archive-extraction advisories. Prettier is not an affected package.** Static inspection found no route from this suite's current custom provider, JSON import or static localhost report workflow to the affected ZIP extractor. This is a scoped reachability assessment, not a claim that the dependency is patched.

```text
promptfoo 0.123.0                 direct devDependency
└─ @openai/codex-security 0.1.28   optional dependency (declared ^0.1.18)
   └─ extract-zip 2.0.1           exact dependency; optional through parent
```

## Advisories and available releases

| Advisory | Affected component | Issue | Published fix |
| --- | --- | --- | --- |
| [GHSA-jmr9-qjv8-65gv / CVE-2026-56876](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) | extract-zip <=2.0.1 | An archive symlink can point outside the extraction directory. | None listed |
| [GHSA-7pqw-9j4j-h8q3 / CVE-2026-19693](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3) | extract-zip <=2.0.1 | A symlink followed by a same-name file entry can write outside the extraction directory. | None listed |

Registry reads confirmed latest `extract-zip` is 2.0.1, latest `@openai/codex-security` is 0.1.28 and still depends on 2.0.1, and latest `promptfoo` is 0.123.0 with the same optional dependency. A same-line patched upstream release is therefore unavailable at this check.

`npm audit --json` reports high findings for `extract-zip`, its parent `@openai/codex-security`, and `promptfoo`; only the two extract-zip advisory IDs are underlying issues. Its proposed fix is **downgrading Promptfoo to 0.120.19**, flagged `isSemVerMajor: true`. That is not a compatible patch update and was not applied or validated. Do not use `npm audit fix --force` to make this downgrade automatically.

## Reachability and existing mitigations

- [scripts/promptfoo.mjs](../scripts/promptfoo.mjs) selects only `file://…/harness/promptfoo-provider.mjs` for Jev/Luna/Terra. It does not select `openai:codex-security`. The installed Promptfoo provider registry dynamically imports its Codex Security module only when that provider ID is selected (`node_modules/promptfoo/dist/src/providers-ZHw-XxtQ.js:23052`).
- [scripts/agent-panel.mjs](../scripts/agent-panel.mjs) imports and validates JSON using the local domain module. This path does not import Promptfoo, Codex Security or an archive extractor. The static report serves precomputed assets; localhost binding alone would not mitigate ZIP extraction if such a feature were introduced.
- The installed Codex Security package's only `extract-zip` call found is `extractPluginZip` in `node_modules/@openai/codex-security/dist/runtime.js:1582`. It extracts into a newly created staging directory and rejects duplicate paths and symlink entries inside `onEntry` before extraction (`:1602–1610`). `extract-zip/index.js:84` invokes that callback before its symlink creation (`:130`) or regular-file write (`:132`). Those checks mitigate the two specifically described vectors even in that unused wrapper. This was a source review, not an adversarial proof that every possible archive issue is prevented.

No unsafe ZIP extraction is reachable through the traced current suite workflows. Introducing the Codex Security provider, plugin ZIP bootstrapping, or another archive-import feature changes this assessment and requires a fresh review.

## Minimal compatible action

Keep the pinned Promptfoo version and the current custom-provider route for this work; retain this scoped advisory assessment. The unused optional feature does not block the authorized local evaluation/report workflow. There is currently no verified upstream version-only fix, and the dependency graph remains advisory-positive when optional packages are counted.

If an advisory-free installed graph becomes a requirement, exclude the unused Codex Security optional feature in a separately validated installation profile, then smoke-test the actual Promptfoo CLI and local file provider. **Do not globally omit optional dependencies in the working environment without checking required platform/native packages**, including SQLite/esbuild-related functionality. Targeted exclusion compatibility has not been tested here.

A read-only `npm audit --omit=optional --json` returned zero vulnerabilities, confirming this advisory chain is optional; that command merely filters the audit and does not uninstall or patch anything. Recheck upstream releases before implementing a dependency change. No packages or lockfiles were modified during this assessment.
