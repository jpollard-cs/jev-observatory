using Workerd = import "../../node_modules/workerd/workerd.capnp";
const config :Workerd.Config = (services = [(name = "receipt-tests", worker = (
  compatibilityDate = "2026-09-19",
  modules = [
    (name = "test.mjs", esModule = embed "receipt-runtime.mjs"),
    (name = "receipts/crypto.mjs", esModule = embed "../../src/receipts/crypto.mjs"),
    (name = "domain/contracts.mjs", esModule = embed "../../src/domain/contracts.mjs")
  ], globalOutbound = "receipt-tests"
))]);
