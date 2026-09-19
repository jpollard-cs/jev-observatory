using Workerd = import "../../node_modules/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [
    (name = "provider-tests", worker = (
      compatibilityDate = "2026-09-19",
      modules = [
        (name = "test.mjs", esModule = embed "provider-runtime.mjs"),
        (name = "provider.mjs", esModule = embed "../../src/hosted/provider.mjs"),
        (name = "jev-contract.mjs", esModule = embed "../../src/hosted/jev-contract.mjs")
      ],
      globalOutbound = "fake-provider"
    )),
    (name = "fake-provider", worker = (
      compatibilityDate = "2026-09-19",
      modules = [(name = "fake.mjs", esModule = embed "provider-runtime-fake.mjs")],
      globalOutbound = "fake-provider"
    ))
  ]
);
