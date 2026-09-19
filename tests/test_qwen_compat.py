"""Pure key/metadata checks: no MLX import, weights, GPU, or server."""

import json
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from harness.local.qwen_compat import (
    METADATA_SHA256,
    MTP_KEYS_SHA256,
    MTP_PREFIX,
    REPOSITORY,
    REVISION,
    RUNTIME_VERSIONS,
    CheckpointBinding,
    exclude_unused_mtp,
    keyset_sha256,
    validate_metadata,
    validate_runtime_evidence,
)


def reviewed_mtp_keys():
    """The reviewed index's 22 quantized modules and 10 unquantized norms/gate."""
    quantized = [
        "fc_embedding", "fc_hidden",
        "hyper_connection_mixer.input_mix_weight_down",
        "hyper_connection_mixer.input_mix_weight_up",
        "layers.0.mlp.shared_expert_gate",
        "layers.0.self_attn.indexer.index_qk_proj",
    ]
    for connection in ("attn_hyper_connection", "mlp_hyper_connection"):
        quantized.extend(f"layers.0.{connection}.{module}" for module in (
            "block_inject_weight", "input_mix_weight_down", "input_mix_weight_up"))
    for expert in ("shared_expert", "switch_mlp"):
        quantized.extend(f"layers.0.mlp.{expert}.{projection}_proj" for projection in (
            "down", "gate", "up"))
    quantized.extend(f"layers.0.self_attn.{projection}_proj" for projection in ("k", "o", "q", "v"))
    unquantized = [
        "hyper_connection_mixer.hc_norm", "layers.0.attn_hyper_connection.hc_norm",
        "layers.0.mlp.gate", "layers.0.mlp_hyper_connection.hc_norm",
        "layers.0.self_attn.indexer.k_layernorm", "layers.0.self_attn.indexer.q_layernorm",
        "layers.0.self_attn.k_norm", "layers.0.self_attn.q_norm",
        "pre_fc_norm_embedding", "pre_fc_norm_hidden",
    ]
    return frozenset(
        [f"{MTP_PREFIX}{module}.{parameter}" for module in quantized
         for parameter in ("weight", "scales", "biases")]
        + [f"{MTP_PREFIX}{module}.weight" for module in unquantized]
    )


class TensorSelectionTests(unittest.TestCase):
    def setUp(self):
        self.mtp = reviewed_mtp_keys()
        self.main = frozenset({
            "language_model.model.layers.1.ple.ple_embedding.ngram_embedding.shard_0.weight",
            "language_model.model.layers.1.ple.ple_embedding.ngram_embedding.shard_0.scales",
            "language_model.model.layers.1.ple.ple_embedding.ngram_embedding.shard_0.biases",
            "language_model.model.layers.0.self_attn.q_proj.weight",
        })
        self.binding = CheckpointBinding(self.mtp | self.main, self.mtp, frozenset({"shard"}))
        self.weights = {key: object() for key in self.binding.tensor_keys}

    def test_allowlist_is_exact_reviewed_76_keys(self):
        self.assertEqual(len(self.mtp), 76)
        self.assertEqual(keyset_sha256(self.mtp), MTP_KEYS_SHA256)

    def test_only_known_mtp_removed_main_values_preserved(self):
        original_keys = frozenset(self.weights)
        result = exclude_unused_mtp(self.weights, self.binding)
        self.assertEqual(result["tag"], "ok")
        self.assertEqual(frozenset(result["value"]), self.main)
        self.assertEqual(frozenset(self.weights), original_keys)
        for key in self.main:
            self.assertIs(result["value"][key], self.weights[key])

    def test_missing_mtp_is_rejected(self):
        del self.weights[next(iter(self.mtp))]
        self.assertEqual(exclude_unused_mtp(self.weights, self.binding)["tag"], "error")

    def test_unknown_mtp_is_rejected(self):
        self.weights[MTP_PREFIX + "unexpected.weight"] = object()
        self.assertEqual(exclude_unused_mtp(self.weights, self.binding)["tag"], "error")

    def test_unknown_main_key_is_rejected(self):
        self.weights["unreviewed.main.weight"] = object()
        self.assertEqual(exclude_unused_mtp(self.weights, self.binding)["tag"], "error")

    def test_missing_ple_key_is_rejected(self):
        del self.weights[next(key for key in self.main if "ngram" in key)]
        self.assertEqual(exclude_unused_mtp(self.weights, self.binding)["tag"], "error")

    def test_same_size_forged_allowlist_is_rejected(self):
        forged = (self.mtp - {next(iter(self.mtp))}) | {MTP_PREFIX + "forged.weight"}
        binding = CheckpointBinding(forged | self.main, forged, frozenset({"shard"}))
        result = exclude_unused_mtp({key: object() for key in binding.tensor_keys}, binding)
        self.assertEqual(result["error"]["code"], "mtp_allowlist_mismatch")


class MetadataTests(unittest.TestCase):
    def setUp(self):
        self.setup = {"repository": REPOSITORY, "revision": REVISION,
                      "runtime": dict(RUNTIME_VERSIONS), "metadataSha256": dict(METADATA_SHA256)}

    def test_changed_revision_fails_before_parse(self):
        self.setup["revision"] = "new-revision"
        self.assertEqual(validate_metadata(self.setup, {})["error"]["code"], "checkpoint_binding_mismatch")

    def test_setup_cannot_silently_move_pin(self):
        self.setup["metadataSha256"]["config.json"] = "0" * 64
        self.assertEqual(validate_metadata(self.setup, {})["error"]["code"], "setup_metadata_pins_mismatch")

    def test_changed_metadata_fails_before_parse(self):
        self.assertEqual(validate_metadata(self.setup, {"config.json": b"{}"})["error"]["code"],
                         "metadata_hash_mismatch")

    def test_runtime_version_change_fails(self):
        versions = dict(RUNTIME_VERSIONS, **{"mlx-vlm": "0.7.2"})
        self.assertEqual(validate_runtime_evidence(versions, {})["error"]["code"], "runtime_version_mismatch")

    def test_runtime_source_change_fails(self):
        self.assertEqual(validate_runtime_evidence(RUNTIME_VERSIONS, {})["error"]["code"],
                         "runtime_source_hash_mismatch")

    def test_local_pinned_metadata_when_available(self):
        model_dir = REPO_ROOT.parent.parent / "work/qwen-local/model"
        if not all((model_dir / name).is_file() for name in METADATA_SHA256):
            self.skipTest("local metadata fixture not downloaded")
        # File reading supplies bytes to the pure validator; no runtime import.
        metadata = {name: (model_dir / name).read_bytes() for name in METADATA_SHA256}
        result = validate_metadata(self.setup, metadata)
        self.assertEqual(result["tag"], "ok", result)
        self.assertEqual(len(result["value"].tensor_keys), 3747)
        self.assertEqual(len(result["value"].mtp_keys), 76)
        index = json.loads(metadata["model.safetensors.index.json"])
        weights = {key: object() for key in index["weight_map"]}
        selected = exclude_unused_mtp(weights, result["value"])
        self.assertEqual(len(selected["value"]), 3671)


if __name__ == "__main__":
    unittest.main()
