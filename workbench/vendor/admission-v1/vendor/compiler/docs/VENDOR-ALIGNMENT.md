# Vendor guidance and the implemented mapping

Checked TypeSafe's public documentation on September 18, 2026. These are documentation-derived adapter choices, not knowledge of the private model implementation.

## Native request structure

The API accepts a state and named typed questions; its result pairs each question ID with a typed answer. The renderer emits only this request surface. Audit receipts and evaluation metadata are not added to that body.

Source: https://docs.typesafe.ai/api

## Structured instructions and criteria

The Advanced page supports JSON descriptions in instructions, Choice options, ordinal Score levels and Noul true/false criteria. It specifically describes boundary clarification using definitions and examples. The criterion-local renderer groups examples under the applicable option/side rather than serializing a pretend dialogue. The `examples` key is treated as useful structured content, not an undocumented magic behavior flag.

The simple API-reference types are narrower in places than the Advanced explanation. The package's local request-shape schema uses the explicitly documented structured forms. It is a local contract check, not the vendor's official schema or proof of live service acceptance.

Source: https://docs.typesafe.ai/primitives/advanced

## Complete, independent questions

TypeSafe says question IDs are not inference content, and a batch does not make one answer input to another. The imported question text remains complete. Compiler dependency metadata is not substituted for real execution stages. Grouping questions separately is an explicit cost-affecting experiment, not a way to smuggle a reasoning chain into one request.

Source: https://docs.typesafe.ai/primitives

## Named state and examples

The State documentation recommends named structure for related facts and allows examples in state. Therefore the existing global-example baseline is not an invalid API format. Local examples and separate question support are candidate representations to test, not proof that the previous state layout caused the misses.

Source: https://docs.typesafe.ai/concepts/state

## Known limitations

The Jev 1.13 limitations page recommends reducing indirection and irrelevant material, spelling out decision boundaries, and treating adversarial state as a real issue. That motivates the direct/factored/scoped rendering options and explicit source authority handling. It does not justify silently deleting policy text, decoding test payloads behind the experiment's back, or treating field labels as an enforced model trust boundary.

Source: https://docs.typesafe.ai/model-jaggedness/jev-1.13

## What remains our engineering choice

The canonical schema, legacy importer, profile names, source hashes, context factoring, sample-label projection rules and generic chat plan are this project's design. They are not TypeSafe-endorsed formats beyond using its documented JSON request fields. The source-preserving tests establish mechanical properties; live calls are still needed to measure token usage and classification behavior.
