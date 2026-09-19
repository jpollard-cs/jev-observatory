"""Version-bound, no-MTP adapter for one reviewed Qwen checkpoint.

Importing this module uses only the standard library. Pure validation and tensor
selection are separate from filesystem, package-import, and runtime adapters.
No checkpoint file or installed package is modified. Callers must retain the
stock loader's strict=True setting; this adapter does not replace load_weights.
"""

from __future__ import annotations

import hashlib
import importlib
import importlib.metadata
import json
import os
import platform
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ADAPTER_VERSION = "qwen-oQ3-no-mtp/1.0"
REPOSITORY = "Vontra/Qwen3.8-Flash-Next-MLX-oQ3-MTP"
REVISION = "75d1a70612a9b483815e103207a3964a300cc0fc"
MTP_PREFIX = "language_model.mtp."
MTP_COUNT = 76
TENSOR_COUNT = 3747
MTP_KEYS_SHA256 = "994a0c030eb08aacffdea7d967f134e1da9a455cdd3dff1fffe24f2d3f873925"
METADATA_SHA256 = {
    "config.json": "07a8cdc92783bea48d925cd529cca1af5d74806a48de3148e7a29be7ca2d0275",
    "model.safetensors.index.json": "12d5e0be3224a3245c8df0e5e70b78ecc6c345c06f387d371c9d2f45fe97f6ee",
    "tokenizer_config.json": "b11349aafa7cdc6a320767cf7ceb29ed82f7eda5d65e8e0819e76f0ce947bf27",
    "chat_template.jinja": "c3cf9e34abf4f9e36c2d72165aa9c132d3e2a725b6c2586aaa3a8af9d7a81041",
}
RUNTIME_VERSIONS = {
    "python": "3.13.2",
    "mlx-vlm": "0.7.1",
    "mlx": "0.32.2",
    "transformers": "5.17.0",
    "huggingface-hub": "1.32.0",
}
SOURCE_SHA256 = {
    "mlx_vlm/models/qwen4_exp/qwen4_exp.py": "62dd6879536fdd864e994d1ac5cecfd5ba578cf61fbcac20e763f4605d6a5490",
    "mlx_vlm/utils.py": "0959896be30b30a77bfdae13f61fb8c21e57de2eb6b6071771e19de082e7a977",
    "mlx_vlm/server/cli.py": "9a03ee1e8bdb346079694060845bd05a888df9969104bf73271e7d7c8c554783",
}
GIB = 1024**3
MAX_MEMORY_BYTES = 100 * GIB


def ok(value: Any) -> dict:
    return {"tag": "ok", "value": value}


def err(code: str, **context: Any) -> dict:
    """Error context contains operational identifiers, never prompt content."""
    return {"tag": "error", "error": {"code": code, "retryable": False, "context": context}}


class CompatibilityError(RuntimeError):
    def __init__(self, result: dict):
        self.result = result
        super().__init__(result["error"]["code"])


def unwrap(result: dict) -> Any:
    if result["tag"] == "error":
        raise CompatibilityError(result)
    return result["value"]


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def keyset_sha256(keys: frozenset[str]) -> str:
    return sha256(("\n".join(sorted(keys)) + "\n").encode("utf-8"))


@dataclass(frozen=True)
class CheckpointBinding:
    """Domain evidence derived from the exact, reviewed metadata bytes."""

    tensor_keys: frozenset[str]
    mtp_keys: frozenset[str]
    shard_names: frozenset[str]

    def summary(self) -> dict:
        return {
            "adapterVersion": ADAPTER_VERSION,
            "repository": REPOSITORY,
            "revision": REVISION,
            "indexedTensors": len(self.tensor_keys),
            "excludedMtpTensors": len(self.mtp_keys),
            "retainedTensors": len(self.tensor_keys - self.mtp_keys),
            "mtpKeysSha256": keyset_sha256(self.mtp_keys),
            "metadataSha256": dict(METADATA_SHA256),
            "runtime": dict(RUNTIME_VERSIONS),
            "sourceSha256": dict(SOURCE_SHA256),
            "strictMainModelLoading": True,
            "speculativeDecodingEnabled": False,
        }


def validate_metadata(setup: Mapping, metadata: Mapping[str, bytes]) -> dict:
    """Pure metadata validation. Hash equality precedes interpretation."""
    if not isinstance(setup, Mapping):
        return err("setup_not_object")
    if setup.get("repository") != REPOSITORY or setup.get("revision") != REVISION:
        return err("checkpoint_binding_mismatch")
    if setup.get("metadataSha256") != METADATA_SHA256:
        return err("setup_metadata_pins_mismatch")
    if setup.get("runtime") != RUNTIME_VERSIONS:
        return err("setup_runtime_pins_mismatch")
    for name, expected in METADATA_SHA256.items():
        raw = metadata.get(name)
        if not isinstance(raw, bytes) or sha256(raw) != expected:
            return err("metadata_hash_mismatch", file=name)
    try:
        config = json.loads(metadata["config.json"])
        tokenizer = json.loads(metadata["tokenizer_config.json"])
        index = json.loads(metadata["model.safetensors.index.json"])
        weight_map = index["weight_map"]
        text_config = config["text_config"]
        quantization = config["quantization"]
    except (KeyError, TypeError, ValueError):
        return err("metadata_structure_invalid")
    if config.get("model_type") != "qwen4_exp":
        return err("unexpected_model_architecture")
    if config.get("auto_map") or tokenizer.get("auto_map"):
        return err("remote_code_mapping_disallowed")
    if text_config.get("ple_storage") or text_config.get("tie_word_embeddings"):
        return err("main_tensor_omission_disallowed")
    if quantization != config.get("quantization_config"):
        return err("quantization_alias_mismatch")
    if {key: quantization.get(key) for key in ("bits", "group_size", "mode")} != {
        "bits": 3, "group_size": 32, "mode": "affine"
    }:
        return err("base_quantization_mismatch")
    tensor_keys = frozenset(weight_map)
    mtp_keys = frozenset(key for key in tensor_keys if key.startswith(MTP_PREFIX))
    if len(tensor_keys) != TENSOR_COUNT:
        return err("indexed_tensor_count_mismatch", actual=len(tensor_keys))
    if len(mtp_keys) != MTP_COUNT or keyset_sha256(mtp_keys) != MTP_KEYS_SHA256:
        return err("mtp_allowlist_mismatch")
    return ok(CheckpointBinding(tensor_keys, mtp_keys, frozenset(weight_map.values())))


def validate_runtime_evidence(versions: Mapping, sources: Mapping[str, bytes]) -> dict:
    """Pure runtime validation, usable without importing MLX or allocating RAM."""
    for name, expected in RUNTIME_VERSIONS.items():
        if versions.get(name) != expected:
            return err("runtime_version_mismatch", package=name, expected=expected,
                       actual=versions.get(name))
    for name, expected in SOURCE_SHA256.items():
        raw = sources.get(name)
        if not isinstance(raw, bytes) or sha256(raw) != expected:
            return err("runtime_source_hash_mismatch", file=name)
    return ok({"versions": dict(versions), "sourceSha256": dict(SOURCE_SHA256)})


def exclude_unused_mtp(weights: Mapping[str, Any], binding: CheckpointBinding) -> dict:
    """Pure selection: remove only the exact 76 pinned auxiliary tensors.

    The whole original key set must match, so unknown or missing main-model keys
    cannot be masked by this compatibility step. Values retain object identity;
    no tensor is evaluated, copied, cast, dequantized, or rewritten here.
    """
    if len(binding.mtp_keys) != MTP_COUNT or keyset_sha256(binding.mtp_keys) != MTP_KEYS_SHA256:
        return err("mtp_allowlist_mismatch")
    actual_keys = frozenset(weights)
    if actual_keys != binding.tensor_keys:
        return err("checkpoint_tensor_keys_mismatch",
                   missingCount=len(binding.tensor_keys - actual_keys),
                   unexpectedCount=len(actual_keys - binding.tensor_keys))
    actual_mtp = frozenset(key for key in actual_keys if key.startswith(MTP_PREFIX))
    if actual_mtp != binding.mtp_keys:
        return err("mtp_tensor_keys_mismatch")
    return ok({key: value for key, value in weights.items() if key not in binding.mtp_keys})


def read_checkpoint_binding(model_dir: Path, setup_path: Path) -> dict:
    """Filesystem adapter; metadata-only, without weight reads or package imports."""
    try:
        if (model_dir / "offload_index.json").exists():
            return err("offload_checkpoint_disallowed")
        setup = json.loads(setup_path.read_bytes())
        metadata = {name: (model_dir / name).read_bytes() for name in METADATA_SHA256}
    except (OSError, ValueError) as error:
        return err("checkpoint_metadata_read_failed", errorType=type(error).__name__)
    return validate_metadata(setup, metadata)


def read_runtime_evidence() -> dict:
    """Read distribution metadata and source bytes before importing that source."""
    try:
        versions = {"python": platform.python_version()}
        for name in RUNTIME_VERSIONS:
            if name != "python":
                versions[name] = importlib.metadata.version(name)
        distribution = importlib.metadata.distribution("mlx-vlm")
        sources = {name: Path(distribution.locate_file(name)).read_bytes()
                   for name in SOURCE_SHA256}
    except (OSError, importlib.metadata.PackageNotFoundError) as error:
        return err("runtime_evidence_read_failed", errorType=type(error).__name__)
    return validate_runtime_evidence(versions, sources)


def validate_setup(model_dir: Path, setup_path: Path) -> dict:
    """Read-only preflight for both model metadata and installed runtime."""
    checkpoint = read_checkpoint_binding(Path(model_dir), Path(setup_path))
    if checkpoint["tag"] == "error":
        return checkpoint
    runtime = read_runtime_evidence()
    if runtime["tag"] == "error":
        return runtime
    return checkpoint


def install_compatibility(model_dir: Path, setup_path: Path) -> dict:
    """Validate first; then wrap Model.sanitize in this process only.

    Does not instantiate or load a model. Both the launcher and an independent
    smoke command can call this function before mlx_vlm.utils.load(strict=True).
    """
    validated = validate_setup(model_dir, setup_path)
    if validated["tag"] == "error":
        return validated
    binding = validated["value"]
    try:
        module = importlib.import_module("mlx_vlm.models.qwen4_exp.qwen4_exp")
        original = module.Model.sanitize
        installed_version = getattr(original, "_qwen_compat_version", None)
        if installed_version is not None:
            if installed_version == ADAPTER_VERSION:
                return ok(binding.summary())
            return err("incompatible_sanitizer_already_installed")
        if original.__module__ != module.__name__ or original.__name__ != "sanitize":
            return err("unexpected_sanitizer_binding")

        def sanitize_without_mtp(self, weights):
            retained = unwrap(exclude_unused_mtp(weights, binding))
            return original(self, retained)

        sanitize_without_mtp._qwen_compat_version = ADAPTER_VERSION
        sanitize_without_mtp.__wrapped__ = original
        module.Model.sanitize = sanitize_without_mtp
    except Exception as error:
        return err("compatibility_install_failed", errorType=type(error).__name__)
    return ok(binding.summary())


def configure_isolated_environment(work_dir: Path) -> dict:
    """Process-only environment adapter; no inherited MLX tuning or remote code."""
    cache = Path(work_dir).resolve() / "hf-cache"
    cache.mkdir(parents=True, exist_ok=True)
    for name in tuple(os.environ):
        if name.startswith(("MLX_VLM_", "KV_", "APC_")) or name in {
            "PREFILL_STEP_SIZE", "MAX_KV_SIZE", "QUANTIZED_KV_START",
            "EXPERT_CACHE_GB", "TOP_LOGPROBS_K", "TRANSFORMERS_CACHE"
        }:
            os.environ.pop(name, None)
    settings = {
        "HF_HOME": str(cache),
        "HF_HUB_CACHE": str(cache / "hub"),
        "HUGGINGFACE_HUB_CACHE": str(cache / "hub"),
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
        "HF_HUB_DISABLE_TELEMETRY": "1",
        "MLX_TRUST_REMOTE_CODE": "false",
        "MLX_VLM_ENABLE_THINKING": "0",
        "MLX_VLM_MAX_NUM_SEQS": "1",
        "MLX_VLM_MODEL_DISCOVERY": "served",
        "PREFILL_STEP_SIZE": "512",
    }
    os.environ.update(settings)
    return ok(settings)


def configure_memory_budget(memory_bytes: int = MAX_MEMORY_BYTES) -> dict:
    """Configure MLX's allocation guideline, not an OS hard-memory guarantee."""
    if isinstance(memory_bytes, bool) or not isinstance(memory_bytes, int):
        return err("memory_budget_not_integer")
    if not 0 < memory_bytes <= MAX_MEMORY_BYTES:
        return err("memory_budget_out_of_range", maximumBytes=MAX_MEMORY_BYTES)
    try:
        mx = importlib.import_module("mlx.core")
        mx.set_memory_limit(memory_bytes)
        mx.set_cache_limit(256 * 1024**2)
    except Exception as error:
        return err("memory_budget_configuration_failed", errorType=type(error).__name__)
    return ok({"allocationGuidelineBytes": memory_bytes, "freeCacheLimitBytes": 256 * 1024**2,
               "osHardLimit": False})
