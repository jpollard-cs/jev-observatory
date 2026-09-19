#!/usr/bin/env python3
"""Run the pinned Qwen checkpoint using the isolated MLX-VLM environment.

The --validate-only path does not import MLX, load weights, or start a server.
The serving path preserves stock strict loading and the original chat template.
Thinking is disabled by default; evaluation requests should explicitly include
enable_thinking=false because the upstream API permits per-request overrides.
"""

from __future__ import annotations

import argparse
import fcntl
import json
import sys
from contextlib import contextmanager
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
WORK_DIR = REPO_ROOT.parent.parent / "work" / "qwen-local"
sys.path.insert(0, str(REPO_ROOT))

from harness.local.qwen_compat import (  # noqa: E402
    GIB,
    CompatibilityError,
    configure_isolated_environment,
    configure_memory_budget,
    err,
    install_compatibility,
    ok,
    unwrap,
    validate_setup,
)


def emit(result: dict) -> None:
    print(json.dumps(result, sort_keys=True), flush=True)


class JsonArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        raise CompatibilityError(err("invalid_cli_arguments", message=message))


def parse_arguments(argv: list[str] | None) -> argparse.Namespace:
    parser = JsonArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", type=Path, default=WORK_DIR / "model")
    parser.add_argument("--setup", type=Path, default=REPO_ROOT / "data/local-qwen-setup.json")
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--memory-gib", type=int, default=100, choices=range(1, 101), metavar="1..100")
    parser.add_argument("--max-tokens", type=int, default=1024)
    arguments = parser.parse_args(argv)
    if not 1 <= arguments.max_tokens <= 4096:
        parser.error("--max-tokens must be between 1 and 4096")
    return arguments


@contextmanager
def singleton_lock(path: Path):
    """One launcher per workspace; closing the descriptor releases the lock."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+") as handle:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise CompatibilityError(err("local_qwen_already_running")) from None
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def ensure_weight_shards_present(model_dir: Path, shard_names: frozenset[str]) -> dict:
    """Existence gate only. Download verification owns full shard SHA256 checks."""
    missing = [name for name in sorted(shard_names) if not (model_dir / name).is_file()]
    if missing:
        return err("weight_shards_missing", count=len(missing), files=missing)
    return ok({"presentWeightShards": len(shard_names), "weightHashesCheckedHere": False})


def serve(arguments: argparse.Namespace, binding) -> None:
    model_dir = arguments.model_dir.resolve()
    unwrap(ensure_weight_shards_present(model_dir, binding.shard_names))
    with singleton_lock(WORK_DIR / "serve.lock"):
        unwrap(configure_isolated_environment(WORK_DIR))
        compatibility = unwrap(install_compatibility(model_dir, arguments.setup))
        memory = unwrap(configure_memory_budget(arguments.memory_gib * GIB))
        # This uses only options verified in pinned mlx-vlm 0.7.1's CLI source.
        # Uvicorn runs one worker without reload, preserving our in-process shim.
        server_arguments = [
            "mlx_vlm.server", "--host", "127.0.0.1", "--port", "8766",
            "--model", str(model_dir), "--model-discovery", "served",
            "--max-num-seqs", "1", "--prefill-step-size", "512",
            "--vision-cache-size", "0", "--max-tokens", str(arguments.max_tokens),
            "--log-level", "INFO",
        ]
        emit(ok({"event": "local_qwen_starting", "url": "http://127.0.0.1:8766",
                 "compatibility": compatibility, "memory": memory,
                 "enableThinkingDefault": False, "maxConcurrentSequences": 1,
                 "prefillStepSize": 512, "weightHashesCheckedHere": False}))
        from mlx_vlm.server.cli import main as server_main

        original_argv = sys.argv
        try:
            sys.argv = server_arguments
            server_main()
        finally:
            sys.argv = original_argv


def main(argv: list[str] | None = None) -> int:
    try:
        arguments = parse_arguments(argv)
        binding = unwrap(validate_setup(arguments.model_dir, arguments.setup))
        if arguments.validate_only:
            emit(ok({"event": "local_qwen_metadata_validated", **binding.summary(),
                     "weightsRead": False, "modelLoaded": False, "serverStarted": False}))
            return 0
        serve(arguments, binding)
        return 0
    except CompatibilityError as error:
        emit(error.result)
        return 2
    except KeyboardInterrupt:
        emit(ok({"event": "local_qwen_interrupted"}))
        return 130
    except Exception as error:
        emit(err("local_qwen_launcher_failed", errorType=type(error).__name__))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
