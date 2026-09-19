# Rich-template cost proposal

**Offline sizing only. No model calls were made.** The restarted run has a separate **$3.00 cap**, in addition to **$1.04 previously spent** as reported by the user. Template approval remains required before testing.

## Exact draft measured

The [proposed template](../policies/prompt-injection-policy-template.md) contains **47,739 UTF-8 bytes** in its marked model-facing body, or **48,113 bytes as a JSON string**. These are byte counts, not Jev tokens. Operator notes, approval instructions and example configuration are excluded. Extraction trims the marked body and appends one LF.

Model-facing SHA-256:

```text
56b77c5efa6b4df0da9a240284a532da5b9d21e35e2450976da98a27718de3f0
```

The [machine-readable calculation](../data/template-v2-cost-proposal.json) records the complete document hash, extraction rule, underlying request-sequence hash and every sizing assumption. Reproduce without credentials or network calls:

```sh
node scripts/cost-template-proposal.mjs > work/template-v2-cost-recheck.json
```

## What is being estimated

The new request schema is not yet built or approved. For a provisional comparison, the calculator retains the entire current `policy-v4` request and adds the full guide either once in application-owned shared state, with an explicit reference in every question, or separately to every question. This is deliberately additive sizing, not a semantically reconciled future prompt. New integrity, contract, audit or reason questions will change the final size and must be counted.

The current catalog has 15,120 requests containing 65,088 questions. Repeating the long guide for every question adds substantial volume. Shared placement means once in the serialized request; it does not assert a prompt-cache discount or a verified provider billing rule for internal fan-out. Full question definitions remain present under either placement.

The planning convention is:

```text
reserved input tokens = complete serialized UTF-8 bytes + 256 per request
reserved USD = reserved input tokens × 0.042 / 1,000,000
```

TypeSafe's public price is **$0.042 per million input tokens**, with **zero output-token charge**, rechecked on September 17, 2026. [TypeSafe launch pricing](https://typesafe.ai/blog/introducing-system-one-models-and-jev).

One token per byte is a conservative planning convention, not a verified upper bound on Jev tokenization or provider overhead. The JSON also shows illustrative token/byte ratios; those are sensitivity scenarios, not calibrated predictions for this prompt. No old pilot ratio is used to justify a larger run. Actual returned usage must be checked in the approved small preflight before expanding.

## Provisional allocations

| Sizing inventory | Requests | Guide once in shared state | Guide repeated per question |
| --- | ---: | ---: | ---: |
| Separate preflight allowance at largest measured request size | 24 | $0.1251 | $0.5603 |
| Short balanced-policy development slice | 72 | $0.3168 | $1.4854 |
| Three-length balanced-policy development slice | 216 | $1.0092 | $4.5151 |
| **Separate preflight plus three-length slice** | **240** | **$1.1343** | **$5.0754** |
| Entire seed-0 matrix inventory | 3,780 | $12.2034 | $37.3597 |
| Full catalog inventory | 15,120 | $48.8135 | $149.4389 |

The provisional 24-call allowance uses the largest hypothetical request body, 123,824 bytes shared or 555,605 repeated, plus overhead. It applies only if the actual new preflight bodies fit those sizes; it is not a frozen preflight packet.

The 216-cell slice crosses 18 display families, attack/benign variants, two seeds and context-length targets of 512, 4,096 and 16,384 UTF-16 code units, holding balanced policy, structured outputs and middle placement fixed. The 72-cell slice uses only the shortest length. These are correlated development cases, not independent real-world attacks, and do not by themselves cover every requested strictness/output/placement comparison. Old labels must be reviewed under the new definitions before reuse.

With shared placement, the **provisional 240-call allocation reserves about $1.13**, leaving about **$1.87** of the restarted allowance. This supports planning a small restart; it does not authorize execution or establish the final cost. Freeze and recount the actual approved request battery before dispatch. Preserve all unrun cases rather than deleting them to fit the budget.

The historical ledger is unchanged. Future dispatch must reserve estimated cost before each request, account for returned usage, and retain unresolved reservations after interruptions. Control-model usage, optional attack generation and hosting are separate costs; they are not assumed free or included in this Jev allowance.

## Proposed credit request

Ask TypeSafe for **$75 in evaluation credits**. At the current draft's provisional shared-state sizing, **$48.81** is allocated to one pass through the full 15,120-cell catalog, leaving **$26.19** for separately counted preflights, prompt/representation experiments, targeted reruns and additional cases before a broader protocol freeze. For comparison, a $60 grant would leave $11.19 above the same catalog allowance. These allocations describe a bounded request, not a promise to consume the full amount or a guarantee that every future experiment fits.

The approximately **$44** estimate referred to an earlier draft: $43.7434 with a 39,789-byte model-facing guide. The present guide is 47,739 bytes and produces the $48.8135 allowance above. These are two different prompt snapshots, not a change in the advertised token price. The draft [message to TypeSafe](message-to-typesafe.md) uses the updated amount and asks them to review the input/billing assumptions.

Requesting credits does not change the currently authorized **$3 restarted-run cap**, approve the template, or authorize sending the message. Record any grant and the subsequent run allocation separately before extending live execution.
