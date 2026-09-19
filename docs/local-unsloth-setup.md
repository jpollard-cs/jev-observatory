# Unsloth local baseline setup

The selected baseline is **Unsloth UD-Q3_K_XL with llama.cpp**, isolated under workspace `work/qwen-unsloth/`. The machine-readable record is [local-unsloth-setup.json](../data/local-unsloth-setup.json). This setup does not change Ollama or global packages. Runtime installation, header inspection, and setup smoke results are distinct from classification benchmark evidence.

**Verified status:** all three GGUF hashes and the complete tensor inventory passed; both bounded setup smokes passed; the server has been stopped and its port is closed. The unused MLX environment was removed after the download completed, preserving its metadata and receipts. No Jev calls or prompt-injection benchmark calls were made for this setup.

## Frozen source and runtime

| Component | Pin |
|---|---|
| Base model | `Qwen/Qwen3.8-Flash-Next` |
| Quantized conversion | `unsloth/Qwen3.8-Flash-Next-GGUF` |
| Model revision | `38bb39ee97821de2c9009abb7e93950eec396e66` |
| Quantization | `UD-Q3_K_XL`, a mixed quantization; individual tensor types are inventoried |
| Download | Three GGUF files, 89,986,353,824 bytes (83.81 GiB) |
| Runtime | Official macOS ARM64 llama.cpp `b10964`, linked from stable `v0.4.1` |
| Runtime commit | `b29c606e28a01b1bc8c1351026a0fa6e616bf6c4` |
| Archive SHA-256 | `033c845c1df9bf945ff37bb193238b40910b2244be3e1e637b2ceb5878f1a6f5` |

Primary provenance: [pinned Unsloth model](https://huggingface.co/unsloth/Qwen3.8-Flash-Next-GGUF/tree/38bb39ee97821de2c9009abb7e93950eec396e66), [official runtime release](https://github.com/ggml-org/llama.cpp/releases/tag/b10964), and [merged Qwen4 architecture implementation](https://github.com/ggml-org/llama.cpp/pull/27742). The executable reports `0.4.1-dev (build 10964, commit b29c606e2)`; its hash and all 60 extracted runtime file hashes are recorded separately from the archive pin.

The Unsloth model card declares Qwen Community License 1.0 but the pinned conversion repository has no `LICENSE` file. `work/qwen-unsloth/MODEL-LICENSE` therefore preserves the [official base-model license](https://huggingface.co/Qwen/Qwen3.8-Flash-Next/raw/de4b8e4d43b917e7706784d8bb445c9af86a3540/LICENSE), SHA-256 `a0dc422560841fd68e06d974907f8b4c709bca44a67daad2b528437bdf676c08`. The runtime's MIT license is saved independently. No weights are redistributed by this repository.

## What the GGUF contains

Header inspection uses ordinary file reads and does not load tensors into the model. The metadata declares `qwen4exp`, three splits, and 1,224 tensors. Inspection of all header prefixes finds 176,943,899,520 stored tensor elements, including the complete PLE table `per_layer_token_embd.weight`: shape `[160, 320001536]`, GGML type 20 (`IQ4_NL`), storage span 28,800,138,240 bytes. Its six associated projection/norm/convolution tensors are present. No separately packaged MTP model or multimodal projector is downloaded; the initial runtime is text-only without speculative decoding.

The **embedded Unsloth GGUF chat template** is retained: 9,993 UTF-8 bytes, SHA-256 `12827f24b742ea4e80cdc12dbcf9622227056b9f797252a3149263d4f9aaadce`. It differs from the earlier 8,952-byte MLX template, including leading system/developer message merging and tool-argument handling. It must not be described as byte-identical to the official base template. Before a real evaluation, freeze the actual rendered requests as well as the template hash.

## Reproduce the setup

Commands below run from the task workspace root. The original transfer reused an existing isolated Hugging Face client. To reproduce it after cleanup, create a small download-only environment; no MLX install is needed. The installed llama.cpp runtime and remaining scripts use no MLX dependencies.

```sh
# Install only the pinned official runtime archive; does not load a model.
python3 outputs/jev-redteam/scripts/install-local-unsloth-runtime.py --install

# Recreate only the optional Hugging Face download client when needed.
python3 -m venv work/qwen-unsloth/download-venv
work/qwen-unsloth/download-venv/bin/python -m pip install huggingface-hub==1.32.0

# Public unauthenticated, resumable transfer; at most two workers.
work/qwen-unsloth/download-venv/bin/python outputs/jev-redteam/scripts/download-local-unsloth.py --download

# After all three SHA-256 checks pass, inspect full GGUF headers.
python3 outputs/jev-redteam/scripts/inspect-local-unsloth.py

# Validate receipt, runtime hashes, and launch parameters without loading.
python3 outputs/jev-redteam/scripts/serve-local-unsloth.py

# Start only when a local run is intended; use a fresh evidence name.
python3 outputs/jev-redteam/scripts/serve-local-unsloth.py --serve --run-name evaluation-v1
```

The downloader checks free space against the remaining download plus an 8 GiB reserve. Full-file hashes are checked on download; the launcher validates that receipt and current sizes, rather than rehashing 90 GB on each start. Preserve `model-source.json`, `download-receipt.json`, `runtime-file-manifest.json`, and `gguf-inventory.json` from the isolated workspace when freezing an evaluation.

The server binds only `127.0.0.1:8767`, advertises alias `qwen3.8-flash-next-unsloth-ud-q3-k-xl`, uses one slot, 32,768 context tokens, logical batch 512, microbatch 128, GPU layers `all`, and mmap loading. Automatic fit adjustments, MTP, reasoning, warmup, prompt-cache RAM, context checkpoints, context shifting, and the web UI are disabled. The selected GGUF template is used through Jinja. KV types and lazy PLE loading retain runtime defaults; record the resolved server log. Context size is a configured limit, not proof that arbitrary inputs of that size fit memory or perform well.

Subsequent launches restrict CORS origins to localhost and disable CORS credentials. The first smoke launch preceded that transport-only adjustment; its exact original command remains preserved in `server-session.json`. A fresh `--run-name` stores later server evidence under `server-runs/<name>/` without overwriting this setup evidence.

## Setup smoke boundary

```sh
# Offline request preview.
python3 outputs/jev-redteam/scripts/smoke-local-unsloth.py --describe

# One localhost-only toy request after readiness; never retries a POST.
python3 outputs/jev-redteam/scripts/smoke-local-unsloth.py

# Optional separate neutral capacity check: tokenizer-targeted ~28k tokens.
python3 outputs/jev-redteam/scripts/smoke-local-unsloth.py --long-neutral
```

The toy classifies `apple` as `fruit` or `vehicle` with a constrained JSON object, temperature 0, seed 0, at most 64 output tokens, thinking explicitly disabled, and prompt caching disabled. Evidence is written to `work/qwen-unsloth/smoke.json`; an existing record is never overwritten. It preserves response bytes/hash, usage, timings, validity checks, and failures. Passing establishes only this setup path. It provides no prompt-injection accuracy, rare-event robustness, or model ranking evidence.

The optional capacity variant renders the actual template and tokenizes repeated neutral text before its single inference request. It targets 27,500–28,500 input tokens, records the actual API usage separately, allows a bounded 600-second inference wait with progress reports, and preserves its own `capacity-smoke.json`. No attack fixture, policy gold, or full benchmark is used.

The launcher records its exact command and PID in `server-session.json`, output in `server.log`, and child high-water RSS after shutdown. RSS is not total host or GPU memory. Stop the server after bounded setup checks to release memory. Long-context capacity, if exercised, must be reported separately with the actual tokenizer count and neutral input; it cannot substitute for evaluation on the frozen rich-policy corpus.

## Observed setup outcomes

| Single request | API input tokens | API output tokens | HTTP elapsed | Result |
|---|---:|---:|---:|---|
| Tiny `apple` canary | 39 | 7 | 0.896 s | Correct, schema-valid JSON |
| Repeated neutral background plus `apple` | 28,019 | 7 | 223.465 s | Correct, schema-valid JSON |

Both requests reported zero cached prompt tokens, stopped normally, and returned no thinking or tool-call content. Each was attempted once, with no repair or retry. The second input was rendered and tokenized before inference; its actual API input count matched the preflight count.

Readiness was first observed within 28.95 seconds of launch, an upper bound rather than an exact cold-load measurement. Child high-water RSS over this server session was 62,496,555,008 bytes (58.20 GiB); recorded swap usage remained at the pre-existing 4,440.31 MiB. These are observations for one host session and two synthetic inputs, not a memory guarantee or latency benchmark. The server was deliberately interrupted after completion; the preserved shutdown exit code is 1, with the process absent and port closed afterward.

The raw local records are `work/qwen-unsloth/smoke.json`, `capacity-smoke.json`, `server-session.json`, and `host-memory-before.json` / `host-memory-after.json`; their relevant hashes and summary values are included in the tracked setup record. Cleanup is recorded separately in `cleanup-receipt.json`. The small smoke does not establish performance on the information-rich classifier guide, diverse long contexts, or prompt injection.
