> Superseded: the user selected the Unsloth GGUF baseline. All 92.5 GB of unused Vontra weights and unused installation caches were removed on 2026-09-17. The records below document the abandoned setup, not the active baseline. No MLX inference ran.

# Local Qwen setup

Status at this documentation snapshot: **isolated runtime installed, all 19 weight shards SHA-256 verified; source comparison pending**. The model has not been loaded, smoke-tested, or benchmarked. Installation and download do not establish that this checkpoint fits the available memory or that the runtime produces correct outputs.

The machine-readable snapshot is [local-qwen-setup.json](../data/local-qwen-setup.json). Download progress and shard verification are recorded separately in workspace `work/qwen-local/download-receipt.json`; completion requires `all_weights_verified`, not merely the presence of files.

## Model provenance and pins

| Item | Pinned value |
|---|---|
| Base model | `Qwen/Qwen3.8-Flash-Next` |
| Community conversion | `Vontra/Qwen3.8-Flash-Next-MLX-oQ3-MTP` |
| Repository revision | `75d1a70612a9b483815e103207a3964a300cc0fc` |
| Format / quantization | MLX safetensors; mixed oQ3 affine, 3-bit base at group size 32; model-defined precision/group overrides retained |
| Weight files | 19 shards, 92,505,200,266 bytes (about 86.15 GiB) |
| Python | 3.13.2 |
| MLX-VLM | 0.7.1 |
| MLX | 0.32.2 |
| Transformers | 5.17.0 |
| Hugging Face Hub | 1.32.0 |

This is a third-party quantization, not an official Qwen quantized release. Its publisher describes conversion from the official BF16 model with mixed precision and native MTP weights retained. Those provenance claims and the supplied license are available in the [pinned model card](https://huggingface.co/Vontra/Qwen3.8-Flash-Next-MLX-oQ3-MTP/blob/75d1a70612a9b483815e103207a3964a300cc0fc/README.md) and [Qwen Community License 1.0](https://huggingface.co/Vontra/Qwen3.8-Flash-Next-MLX-oQ3-MTP/blob/75d1a70612a9b483815e103207a3964a300cc0fc/LICENSE). The local copies remain alongside the model. This setup does not redistribute weights or assert that every downstream use is licensed.

Metadata SHA-256 pins:

| File | SHA-256 |
|---|---|
| `config.json` | `07a8cdc92783bea48d925cd529cca1af5d74806a48de3148e7a29be7ca2d0275` |
| `model.safetensors.index.json` | `12d5e0be3224a3245c8df0e5e70b78ecc6c345c06f387d371c9d2f45fe97f6ee` |
| `tokenizer_config.json` | `b11349aafa7cdc6a320767cf7ceb29ed82f7eda5d65e8e0819e76f0ce947bf27` |
| `chat_template.jinja` | `c3cf9e34abf4f9e36c2d72165aa9c132d3e2a725b6c2586aaa3a8af9d7a81041` |

The manifest in `work/qwen-local/model-source.json` fixes every weight shard's size and SHA-256. Tokenizer, processor, generation configuration and license come from the same immutable repository revision. Before benchmark execution, preserve a complete resolved dependency inventory and hash the selected launcher/loader too; the top-level package pins above are not a transitive environment lock.

## Workspace isolation and download

All commands below are relative to the task workspace root, which contains `outputs/jev-redteam/` and `work/`.

- Python environment: `work/qwen-local/venv/`.
- Model and metadata: `work/qwen-local/model/`.
- Hugging Face and installer caches: `work/qwen-local/hf-cache/` and `work/qwen-local/uv-cache/`.
- Download source and receipt: `work/qwen-local/model-source.json` and `download-receipt.json`.

The setup uses the workspace environment; global Python packages and the existing Ollama installation are unchanged. The downloader uses public unauthenticated retrieval, disables implicit Hugging Face token use, pins the revision, checks disk headroom, downloads with two workers, and verifies each shard's size and SHA-256. Incomplete downloads remain available for resume.

```sh
# Read-only download plan; no model loading:
work/qwen-local/venv/bin/python outputs/jev-redteam/scripts/download-local-qwen.py

# Download/resume only when no other downloader is active:
work/qwen-local/venv/bin/python outputs/jev-redteam/scripts/download-local-qwen.py --download
```

## Loader and launch boundary

The compatibility review identified auxiliary `language_model.mtp` entries that the installed stock MLX-VLM model does not construct during strict loading. The implemented adapter, `harness/local/qwen_compat.py`, is pinned as `qwen-oQ3-no-mtp/1.0`. It verifies the full 3,747-key checkpoint index and removes only the exact reviewed set of 76 auxiliary MTP entries in memory. The remaining 3,671 tensors, including PLE tables, retain their values; stock strict main-model loading remains enabled. Metadata, runtime versions and selected installed runtime source files are hash-bound. The adapter changes neither checkpoint files nor installed packages.

The launcher is `scripts/serve-local-qwen.py`. Its metadata-only path has been exercised without importing MLX, reading weights, loading a model or starting a server:

```sh
# Metadata and installed-runtime validation only:
work/qwen-local/venv/bin/python outputs/jev-redteam/scripts/serve-local-qwen.py --validate-only

# Eventual local server launch, after download verification and loading review:
work/qwen-local/venv/bin/python outputs/jev-redteam/scripts/serve-local-qwen.py --memory-gib 100 --max-tokens 1024
```

Serving binds to `127.0.0.1:8766`, permits one concurrent sequence, uses prefill chunks of 512, retains the original chat template, disables the vision cache and supplies no speculative drafter. The default model directory is workspace `work/qwen-local/model/`; the default setup record is this repository's `data/local-qwen-setup.json`. A workspace singleton lock prevents two launchers. The launch path checks shard presence; the downloader's receipt, not this presence check, establishes shard SHA-256 verification.

Thinking is disabled by default; evaluation requests must explicitly pin `enable_thinking=false`, since the upstream API permits a per-request override. Remote-code mappings are rejected, and model loading uses the isolated offline cache. `--memory-gib` accepts 1–100 and defaults to 100; this is an MLX allocation guideline, not an operating-system hard cap or a guarantee of fit. The launcher output-token default is 1,024 with an allowed CLI range of 1–4,096; freeze the actual request limits separately for evaluation. No successful serving launch is claimed at this snapshot. Before loading, the user is comparing the existing individual conversion with an Unsloth GGUF build; those require different runtimes. Initial loading/generation can also be checked by a separate bounded smoke without running the full benchmark.

## What remains to establish

The host snapshot records an Apple M4 Max with 128 GiB physical memory and a recommended GPU working set of 115,448,725,504 bytes. Disk had 228 GiB free at preflight. Weight-file size alone does not establish resident memory: quantization metadata, PLE embeddings, recurrent/KV state, prefill workspaces, runtime and the operating system also require space. The model's configured context length is not a measured feasible context on this Mac.

After all shards verify, run one bounded setup smoke and record actual loading/generation, peak memory, response text, prompt/output token counts, timings, finish reason and failures. Keep cold-start and warm measurements distinct. Passing that smoke establishes only the tested runtime path and size; it does not establish classification quality or long-context fit.

The rich classification benchmark remains separate. Its [local baseline protocol draft](local-baseline-protocol-draft.md) preserves the full approved guide, raw material, trusted facts and choices, and discloses Qwen's joint generated JSON versus Jev's independent native primitives. Freeze the actual tokenizer/chat template, output schema, runtime limits and request hashes before evaluating; retain malformed and unsupported-length outcomes. No local benchmark result or model ranking exists yet.
