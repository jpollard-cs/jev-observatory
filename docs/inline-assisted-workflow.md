# Inline assisted setup

The hosted workspace offers one optional Jev key session at the start. `credential-session.mjs` owns the key in a closure; application state, worker messages, storage, plans, exports and logs receive no credential. The key is cleared on disconnect, page exit/reload, or after 30 minutes. A deadline check also rejects dispatch if a backgrounded browser delays its timer. Connecting makes no provider request and does not prove the key is valid. Each run still needs an explicit review of its frozen inputs, cost and spending authorization.

Policy and coverage advice now use inline request review, allowance setup, progress, errors and results. Saving an initial account cap continues the pending request automatically. Preparing suggested coverage opens that same review directly; users no longer need to click the initiating button twice. Subsequent runs reuse the session key. Stop prevents subsequent dispatch but does not disconnect the session; disconnect also prevents subsequent dispatch, while an already-sent request can still finish and be billed.

Successful policy advice is attached automatically as unchecked suggestions. The user still chooses which edits to apply. Successful coverage advice is attached to its matching draft and used to build an offline preview of the suite. No evaluation is started automatically. Failed advice stays read-only; stale drafts cannot authorize an obsolete advisor request or silently accept mismatched advice. Private saved reports, immutable request/policy provenance, cumulative ledgers and no-automatic-retry behavior are retained.

The manual workflow stays available without a key. The browser adapter owns persistent session and execution DOM nodes and reattaches them across editor renders, so navigation and checkbox changes do not discard the connection or interrupt the review. The local CLI/server boundary remains separate.

Security scope: a tab-memory key reduces persistence exposure; it cannot make a compromised page safe. The existing CSP, Trusted Types/DOM sanitization, same-origin writes, owner checks and server-side credential exclusion remain required. This UI change does not introduce an encrypted browser key vault or save keys for later visits.

## Stable request lifecycle

A single click opens progress beside the initiating form, before any local compilation or network request. Concurrent preparation/execution is guarded; controls show busy state immediately. Preparation, account-cap setup, authorization, execution and results use the same inline surface. Server responses do not scroll, rebuild the shell, or navigate. On the Start page, successful policy suggestions appear automatically in a dedicated region below the request; the applied policy summary follows them. Only this region refreshes, preserving the description fields and live run nodes. Completion on another page leaves that page in place and offers a link back to the proposals. Coverage advice retains its explicit navigation step. The reviewed cost and authorization remain in place when results arrive.

Ordinary editor redraws restore expanded sections, control focus/selection and viewport anchors. The session disclosure starts compact; automatic refresh never toggles it. Connecting explicitly collapses it. Planner worker failure rejects pending and future calls, and local preparation has a 60-second deadline. Neither path dispatches a model request or retries a paid call. Non-JSON hosted responses are surfaced as errors without document navigation.

Blocked coverage now has one explanation with links to declared scope and original suites. Spending headroom cannot resolve missing evaluators. Scope is never silently narrowed; unsupported requirements remain blocking, and original suites are explicitly separate evidence.

For regression QA, run the development server with `--signed-in --mock-jev --mock-spanish-only --slow-preview`. This inserts 2.2-second delays before every execution HTTP response and mock provider response and blocks external provider traffic. Check immediate feedback, unchanged scroll through preparation/completion, retained key across steps, stale-draft handling, mobile width, and explicit next-step navigation. Mock observations are not model-performance evidence.

## Linear policy review

Start uses one column at all widths: description → request and progress → proposed changes → applied policy → optional imports/exports. Each diff labels Current and Proposed. The snapshot describes the applied policy, never a preview masquerading as an applied change. Applying selected suggestions updates it immediately; Undo restores the preceding draft. The paid authorization and explicit Apply action remain separate.

Description edits refresh only the proposal/snapshot region, immediately disabling stale suggestions and clearing selections. Frozen request freshness (`setupRequestStamp`) is distinct from imported-summary freshness (`setupInputStamp`); preparing a new request cannot revive an older proposal. UI handlers guard selection and Apply, in addition to server-side report binding. Use `--mock-english-only` with the mock preview to exercise a saved Spanish policy → proposed English → applied English transition without provider calls.
