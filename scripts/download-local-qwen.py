"""Download a pinned public checkpoint into the workspace, verifying every shard."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import threading
import time

REPOSITORY = "Vontra/Qwen3.8-Flash-Next-MLX-oQ3-MTP"
REVISION = "75d1a70612a9b483815e103207a3964a300cc0fc"
REPO_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = REPO_ROOT.parents[1]
LOCAL_ROOT = WORKSPACE / "work/qwen-local"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while block := source.read(16 * 1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true")
    args = parser.parse_args()
    source = json.loads((LOCAL_ROOT / "model-source.json").read_text())
    if source["repository"] != REPOSITORY or source["revision"] != REVISION:
        raise ValueError("unapproved_checkpoint_identity")
    files = [f for f in source["files"] if f["path"].endswith(".safetensors")]
    for entry in files:
        name = PurePosixPath(entry["path"])
        if name.is_absolute() or ".." in name.parts or not entry["sha256"]:
            raise ValueError("invalid_pinned_shard_manifest")
    total = sum(f["size"] for f in files)
    if total != 92505200266:
        raise ValueError("checkpoint_size_changed")
    destination = LOCAL_ROOT / "model"
    destination.mkdir(parents=True, exist_ok=True)
    existing = sum((destination / f["path"]).stat().st_size
                   for f in files if (destination / f["path"]).exists())
    if shutil.disk_usage(destination).free < total - existing + 8 * 1024**3:
        raise ValueError("insufficient_workspace_disk_headroom")
    print(json.dumps({"status": "download_plan", "repository": REPOSITORY,
                      "revision": REVISION, "shards": len(files), "bytes": total,
                      "destination": str(destination), "live": args.download}), flush=True)
    if not args.download:
        return

    os.environ["HF_HOME"] = str(LOCAL_ROOT / "hf-cache")
    os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"
    os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
    from huggingface_hub import hf_hub_download

    started = time.monotonic()
    verified: dict[str, dict] = {}
    lock = threading.Lock()
    done = threading.Event()
    receipt_path = LOCAL_ROOT / "download-receipt.json"

    def receipt(status: str) -> dict:
        with lock:
            entries = list(verified.values())
        return {"status": status, "repository": REPOSITORY, "revision": REVISION,
                "elapsedSeconds": round(time.monotonic() - started, 1),
                "verifiedBytes": sum(f["size"] for f in entries), "totalBytes": total,
                "verifiedShards": len(entries), "totalShards": len(files), "files": entries}

    def persist(value: dict) -> None:
        temporary = receipt_path.with_suffix(".tmp")
        temporary.write_text(json.dumps(value, indent=2) + "\n")
        temporary.replace(receipt_path)

    def progress() -> None:
        while not done.wait(30):
            value = receipt("downloading")
            persist(value)
            print(json.dumps({k: v for k, v in value.items() if k != "files"}), flush=True)

    def fetch(entry: dict) -> dict:
        path = Path(hf_hub_download(REPOSITORY, entry["path"], revision=REVISION,
                                   local_dir=destination, token=False))
        if path.stat().st_size != entry["size"] or sha256_file(path) != entry["sha256"]:
            raise ValueError("downloaded_shard_integrity_mismatch:" + entry["path"])
        with lock:
            verified[entry["path"]] = dict(entry)
        return entry

    reporter = threading.Thread(target=progress, daemon=True)
    reporter.start()
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(fetch, entry) for entry in files]
            for future in as_completed(futures):
                entry = future.result()
                print(json.dumps({"status": "shard_verified", "file": entry["path"],
                                  "bytes": entry["size"]}), flush=True)
        done.set()
        reporter.join()
        final = receipt("all_weights_verified")
        persist(final)
        print(json.dumps({k: v for k, v in final.items() if k != "files"}), flush=True)
    except BaseException:
        done.set()
        reporter.join()
        persist(receipt("incomplete_preserved_for_resume"))
        raise


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"status": "error", "type": type(error).__name__,
                          "message": str(error)}), flush=True)
        raise SystemExit(1)
