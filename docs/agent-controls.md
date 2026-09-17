# Luna and Terra controls through isolated Codex subagents

This is a separate exploratory control channel when direct Luna/Terra API access is unavailable. It makes no model calls and needs no API key. The operator exports a frozen, blinded packet, runs the requested Codex model selectors, and imports their final JSON. Exact weights, provider versions, sampling settings, token usage, billing, and direct endpoint equivalence are unknown.

## Export the packet

From the repository root:

```sh
node scripts/agent-panel.mjs export --out work/agent-panel
```

This writes `packet.json` and `private-manifest.json` under the ignored `work/` directory. Export refuses to overwrite either file. Reuse the same packet for both judges. The packet exposes only opaque per-record IDs, message hashes, exact assessment instructions and candidate context; it omits source IDs, gold labels, family, variant, split, seed metadata, filenames, and lineage. Opaque IDs and record order are randomized once. The candidate text itself remains unchanged, including its archive-padding variation.

**Never send the private manifest, corpus files, results from another judge, or this task's conversation history to a judge.** The private manifest retains labels and lineage for import and scoring. A packet hash and per-request hashes bind the imported responses to the exported instructions/context; these detect accidental changes, not cryptographically authenticated model execution.

The eight fixtures cross correct/incorrect candidate answers with injected/benign explanations, with two archive variants in each cell. All use 512 context characters, middle placement, the balanced policy, structured output and the policy prompt arm. These are eight distinct fixture records from one synthetic template lineage. They are development/integration cases even if an underlying corpus record has another split label. They do not support confirmatory, prevalence, independent rare-event, or ranking claims.

## Run each control

Create separate subagents with the explicit model selectors `gpt-5.6-luna` and `gpt-5.6-terra`, using `fork_turns="none"`. Supply only the complete blinded packet and a short instruction to follow its response contract, use no tools, read no files and return final JSON. Do not give them a path to the private manifest or ask them to inspect the repository. Do not run one model using another model's output as context. Copy the packet intact; do not summarize its candidate contents.

The packet requests this exact outer response structure:

```json
{
  "packetHash": "COPY_FROM_PACKET",
  "responses": [
    {
      "id": "COPY_RECORD_ID",
      "requestHash": "COPY_RECORD_REQUEST_HASH",
      "output": {
        "label": "abstain",
        "attack_probability": 0.5,
        "poison_probability": 0.5,
        "uncertainty": 1,
        "decision": "review",
        "violations": [],
        "judge_verdict": "abstain"
      }
    }
  ]
}
```

The example values illustrate syntax only and must not be included as expected responses. Every record must appear exactly once. Save the actual final response unchanged in `work/agent-panel/luna-responses.json` or `terra-responses.json`. If a model returns invalid content, preserve it. The importer preserves schema-invalid `output` fields in its denominator rather than repairing decisions. Invalid outer JSON or incomplete/duplicate IDs require a recorded protocol failure; do not silently fabricate missing responses or retry until results improve. A separately identified new run may investigate a transport problem.

Isolation prevents inherited conversational content. It does **not** remove Codex's system/developer instructions, agent runtime, or available tools. The record's `system` message is an experimental instruction carried inside that runtime, not an actual direct-API system-message slot. All cases share one batch; the instructions request independent treatment, but cross-case influence remains possible.

## Import and inspect the separate control artifact

```sh
node scripts/agent-panel.mjs import \
  --packet work/agent-panel/packet.json \
  --manifest work/agent-panel/private-manifest.json \
  --responses work/agent-panel/luna-responses.json \
  --model gpt-5.6-luna \
  --isolated \
  --out work/agent-panel/luna-control.json
```

For Terra, use its response/output filenames and `--model gpt-5.6-terra`. Optional `--agent-id` and `--reasoning-effort` record actual configured values when known; do not guess them. `--isolated` is an explicit operator attestation that `fork_turns="none"` and packet-only experimental input were used. The importer cannot independently prove this or the executing model's identity.

Import verifies the packet and private-manifest hashes, exact expected IDs, per-record request hashes, and rejects missing, duplicate or unknown records. It records model identity, source `codex_subagent`, unknown exact weights/sampling/usage, isolation caveats, original output, schema validity and separate count-based results for injection, exact-answer judging and policy decisions. Unresolved/malformed responses remain in the eight-case denominator. No significance tests or rare-event estimates are calculated.

**Never concatenate these control artifacts with `runs/*/raw.jsonl`, feed them to `scripts/aggregate.mjs`, or pool them with direct-API metric rows.** Their artifact kind is `codex_subagent_control_panel` and `poolWithDirectApiRows` is false. A report may show a separate exploratory table that identifies the different runtime and one-lineage sample, links to the frozen packet and actual outputs, and exposes disagreement without claiming a like-for-like API benchmark.

Run the workflow's offline validation tests with:

```sh
node --test tests/agent-panel.test.mjs
```
