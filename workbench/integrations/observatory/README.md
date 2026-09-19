# Additive integration with the existing Observatory

Nothing in this release replaces the original website or its protected Data-app runtime.

1. Run `projectAdmissionEvidence(rawReportText)` in the site's existing data-projection/build path. Persist the projection under a versioned dataset key; do not overwrite unlike historical conditions.
2. Add `PolicyWorkbenchEvidence.jsx` as an optional report/dashboard section, passing the projection through the existing data binding. Its `onInspect` callback can select an existing evidence view.
3. Reconcile the live authoring tree and owner's presentation changes before building or publishing. The archived publication was not an ordinary pushed GitHub deployment.
4. Keep the local authoring/runner service separate from the hosted report. Never put an API key or a local `.env` into the frontend, and do not proxy paid calls through this presentational component.

The data projection is unit-tested. The JSX component is supplied for integration review; the original proprietary Data-app build and live publication were not run here. The standalone workbench is the implemented/tested interactive interface.
