# Browser checks · 0.4.1

Start a disposable checkout with `node server.mjs`, then run:

```sh
WORKBENCH_TEST_URL=http://127.0.0.1:8791 python scripts/ui-browser/release041.py
```

Development dependencies: Python Playwright and Chromium. They are not application runtime dependencies. Set `WORKBENCH_CHROMIUM` to the browser executable (default `/usr/bin/chromium`) and `WORKBENCH_UI_OUTPUT` to a test-output directory (default `runtime/ui-validation`).

`module_bridge.py` loads each actual production UI source file as an independent ES module with its imports preserved. Do not strip import/export syntax or concatenate modules into one shared closure: the old helper did so and could mask undefined bindings. The prior helper is retained only in the unchanged parent archive; compatibility entry points now use the new checker.

Only the API transport is replaced with a bridge to the real localhost server. This environment blocks direct browser navigation to localhost; no browser security policy is disabled. Direct server routes, static assets, Host/Origin/CSRF restrictions and paid-confirmation semantics are also tested using Node HTTP. The bridge is a QA limitation, not proof that a normal browser path has been fully exercised here.

The suite browses all six historical reports and every condition, checks filters/identity/bindings, scopes validation to relevant actions, tries larger planning budgets, and checks mobile/tall layouts. It prepares plans without making model calls. The separate connection HTTP/runner tests inject synthetic inference. Test output is excluded from the release's runtime folder and never becomes production model evidence.

To test the confirmation/cancellation/import flow without a real key or provider:

```sh
python scripts/ui-browser/connection_flow.py
```

This command starts its own disposable loopback test server with an injected synthetic transport and temporary account. It uses a fake test key, performs six simulated metadata calls only after the test clicks confirmation, checks automatic import, and removes its temporary account when the server exits. A simulated confirmation screenshot is explicitly named as such. Never use this test server for real model evaluation.
