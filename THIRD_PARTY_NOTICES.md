# Source provenance and third-party notices

The repository does not include model weights. Reports identify provider/model versions and distinguish authored specimens, software fixtures and observed model output.

- `workbench/` originated in the user-supplied rebuilt 0.5 workbench and change bundles. Imported manifests, reverse deltas and nested source archives under `workbench/provenance/` preserve that lineage. Historical archive contents are not automatically licensed by a later repository-level license.
- `workbench/vendor/admission-v1/` and its nested compiler preserve the earlier supplied research implementations and source bindings. See their included manifests and documentation.
- `site/` contains the earlier OpenAI Data app presentation and its protected runtime. `community-site/legacy/` preserves its deployed Worker. These copied runtime components and their embedded assets retain their original ownership and applicable terms; do not infer an independent license grant for them from public availability of this repository.
- `package-lock.json` and `community-site/package-lock.json` pin externally maintained packages. Their respective upstream license terms apply; dependencies are installed from their registries and are not relicensed here. See `docs/dependency-audit.md` for the optional Promptfoo advisory assessment.
- Gitleaks and GitHub Actions are referenced as release tooling, with pinned releases/checksums or commit identities. The repository does not vendor their executables.

A license for original project contributions must state its scope separately. Preserve existing attribution, provenance and third-party notices when redistributing. If the intended redistribution needs rights beyond documented upstream terms, resolve that with the relevant owner first.
