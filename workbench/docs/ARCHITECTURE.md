# Architecture · 0.5 reconstructed guided workbench

The inherited execution, compiler, data and historical replay architecture is preserved in `archive/ARCHITECTURE-0.4.1.md`. This release adds a guided interface and a distinct setup-advice purpose.

```text
Application description + current draft
           | explicit offline preparation
           v
Fixed setup option library → one native Jev request (16 independent Choices)
           | explicit local paid-stage confirmation
           v
Existing locked metadata runner → saved native answers / usage
           | stale-state and schema validation
           v
Unchecked old→proposed diffs → owner selects → allowlisted draft update
           |                               | guarded undo
           v                               v
Existing deterministic policy compiler and budgeted coverage planner
           | separate saved evaluation + explicit CLI execution
           v
Existing report importer / evidence explorer / Observatory atlas
```

Setup advice has no access to evaluation gold, cannot set money or execution permissions, and is not a ranking report. Only reviewed fields can be applied. App context remains selection metadata; arbitrary application text is not used to fabricate built-in test facts.

The UI's progress model is presentation state, not authorization. Exact draft changes invalidate reviewed state and proposals. Paid metadata authority is issued by the local server against a saved immutable plan and current credential/account generation, not inferred from a completed step.

`REBUILD-0.5.md` documents option semantics, spending distinctions, provenance and remaining limitations. `HANDOFF.md` is the integration entry point.
