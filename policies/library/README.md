# Composable policy library

Canonical executable definitions currently live in `workbench/src/policy.mjs`, with complete profiles in `workbench/examples/{strict,contextual,inspection}.policy.json`. The website's `community-site/catalog/` is a reviewed projection of those definitions; consistency tests reject drift. Edit the canonical definitions and projection together in a PR.

The six current component concepts are source authority, language, representations, scoped exceptions, relevance and uncertainty. These are not interchangeable prose fragments: exceptions depend on contextual admission, and inspection cannot be combined with permission to execute material. The existing policy validator checks those constraints.

New components should specify their purpose, dependencies, trusted context, decision outputs, precedence, benign/attack contrast groups, failure behavior and compatibility. Add exact version/hash pins when implementing a general component compiler. The website catalog alone does not implement one.

See `docs/community-verification.md` for contribution, routing and trusted-verification design. No policy change automatically triggers paid inference.
