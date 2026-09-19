#!/usr/bin/env python3
"""One localhost setup smoke; never a benchmark or an automatic retry.

Uses only the standard library and the pinned MLX-VLM 0.7.1 HTTP schema.
No proxy, credential, key, external host, redirect, repair, or model fallback.
An existing smoke.json is preserved: archive it explicitly before a new run.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import http.client
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
WORK_DIR = REPO_ROOT.parent.parent / "work" / "qwen-local"
MODEL_PATH = str((WORK_DIR / "model").resolve())
OUTPUT_PATH = WORK_DIR / "smoke.json"
HOST, PORT = "127.0.0.1", 8766
CONNECT_TIMEOUT_SECONDS = 5
READ_TIMEOUT_SECONDS = 45
EXCHANGE_DEADLINE_SECONDS = 55
MAX_RESPONSE_BYTES = 1024 * 1024


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ok(value: object) -> dict:
    return {"tag": "ok", "value": value}


def err(code: str, **context: object) -> dict:
    return {"tag": "error", "error": {"code": code, "retryable": False, "context": context}}


def encode_json(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")


def reject_json_constant(value: str):
    raise ValueError(f"Non-JSON constant: {value}")


def unique_json_object(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON object key")
        result[key] = value
    return result


def parse_json(raw: bytes | str) -> object:
    return json.loads(raw, parse_constant=reject_json_constant, object_pairs_hook=unique_json_object)


def smoke_request() -> dict:
    """Transport-independent setup task; no benchmark fixtures or guide."""
    return {
        "model": MODEL_PATH,
        "messages": [
            {"role": "system", "content": "Classify the supplied word as fruit or vehicle. Return only a JSON object with one key, category."},
            {"role": "user", "content": "apple"},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "setup_category",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {"category": {"type": "string", "enum": ["fruit", "vehicle"]}},
                    "required": ["category"],
                    "additionalProperties": False,
                },
            },
        },
        "enable_thinking": False,
        "temperature": 0,
        "seed": 0,
        "max_tokens": 64,
        "stream": False,
    }


def request_local(method: str, path: str, payload: dict | None = None) -> dict:
    """Exactly one exchange, connecting directly to the fixed loopback address."""
    if (method, path) not in {("GET", "/health"), ("GET", "/v1/models"), ("POST", "/v1/chat/completions")}:
        return err("unsupported_local_route")
    started = time.perf_counter()
    record = {"method": method, "path": path, "startedAt": now(), "httpStatus": None,
              "headers": [], "responseComplete": False, "transportError": None}
    body = bytearray()
    connection = http.client.HTTPConnection(HOST, PORT, timeout=CONNECT_TIMEOUT_SECONDS)
    try:
        connection.connect()
        connected_socket = connection.sock
        connected_socket.settimeout(READ_TIMEOUT_SECONDS)
        headers = {"Accept": "application/json"}
        wire_body = None if payload is None else encode_json(payload)
        if wire_body is not None:
            headers["Content-Type"] = "application/json"
            record["requestSha256"] = hashlib.sha256(wire_body).hexdigest()
            record["requestBytes"] = len(wire_body)
        connection.request(method, path, body=wire_body, headers=headers)
        remaining = EXCHANGE_DEADLINE_SECONDS - (time.perf_counter() - started)
        if remaining <= 0:
            raise TimeoutError("Local exchange deadline exceeded")
        connected_socket.settimeout(min(READ_TIMEOUT_SECONDS, remaining))
        response = connection.getresponse()
        record.update(httpStatus=response.status, reason=response.reason, headers=response.getheaders())
        # Each socket operation has a <60s timeout. A size bound prevents an
        # unexpected server response from consuming unbounded client memory.
        while len(body) <= MAX_RESPONSE_BYTES:
            if response.isclosed():
                record["responseComplete"] = response.length in (None, 0)
                break
            remaining = EXCHANGE_DEADLINE_SECONDS - (time.perf_counter() - started)
            if remaining <= 0:
                raise TimeoutError("Local exchange deadline exceeded")
            connected_socket.settimeout(min(READ_TIMEOUT_SECONDS, remaining))
            chunk = response.read1(min(65536, MAX_RESPONSE_BYTES + 1 - len(body)))
            if not chunk:
                record["responseComplete"] = response.length in (None, 0)
                if not record["responseComplete"]:
                    record["transportError"] = {"code": "incomplete_response", "retryable": False}
                break
            body.extend(chunk)
        if len(body) > MAX_RESPONSE_BYTES:
            record["transportError"] = {"code": "response_size_limit", "retryable": False}
        elif not record["responseComplete"] and record["transportError"] is None:
            record["transportError"] = {"code": "incomplete_response", "retryable": False}
    except (OSError, http.client.HTTPException) as error:
        record["transportError"] = {"code": "local_http_exchange_failed", "errorType": type(error).__name__,
                                    "retryable": False}
    finally:
        connection.close()
        record["latencyMs"] = round((time.perf_counter() - started) * 1000, 3)
    raw = bytes(body)
    record["rawResponseBase64"] = base64.b64encode(raw).decode("ascii")
    record["rawResponseSha256"] = hashlib.sha256(raw).hexdigest()
    record["responseBytes"] = len(raw)
    try:
        record["rawResponseText"] = raw.decode("utf-8")
        record["responseJson"] = parse_json(raw)
    except (UnicodeError, ValueError):
        record["responseJson"] = None
    return ok(record)


def successful_json(exchange: dict) -> bool:
    return (exchange["httpStatus"] == 200 and exchange["responseComplete"]
            and exchange["transportError"] is None and isinstance(exchange["responseJson"], dict))


def ready_health(exchange: dict) -> bool:
    if not successful_json(exchange):
        return False
    health = exchange["responseJson"]
    version = next((value for name, value in exchange["headers"] if name.lower() == "server"), None)
    return (health.get("status") == "healthy" and health.get("loaded_model") == MODEL_PATH
            and health.get("loaded_adapter") is None and version == "mlx_vlm/0.7.1")


def ready_models(exchange: dict) -> bool:
    if not successful_json(exchange):
        return False
    models = exchange["responseJson"].get("data")
    return (isinstance(models, list) and len(models) == 1 and isinstance(models[0], dict)
            and models[0].get("id") == MODEL_PATH)


def validate_completion(exchange: dict) -> dict:
    """Pure inspection; no extraction from prose, fence stripping, or repair."""
    validity = {"httpJsonValid": successful_json(exchange), "envelopeValid": False,
                "schemaValid": False, "expectedCategory": False, "finishReasonStop": False,
                "thinkingAbsent": False, "usageValid": False}
    if not validity["httpJsonValid"]:
        return {"passed": False, "checks": validity, "usage": None, "timings": None}
    response = exchange["responseJson"]
    choices = response.get("choices")
    valid_choices = isinstance(choices, list) and len(choices) == 1 and isinstance(choices[0], dict)
    message = choices[0].get("message") if valid_choices else None
    validity["envelopeValid"] = (response.get("model") == MODEL_PATH and isinstance(message, dict)
                                 and message.get("role") == "assistant" and isinstance(message.get("content"), str))
    if validity["envelopeValid"]:
        validity["finishReasonStop"] = choices[0].get("finish_reason") == "stop"
        validity["thinkingAbsent"] = not message.get("reasoning") and not message.get("tool_calls")
        try:
            answer = parse_json(message["content"])
            validity["schemaValid"] = (isinstance(answer, dict) and set(answer) == {"category"}
                                       and answer["category"] in ("fruit", "vehicle"))
            validity["expectedCategory"] = validity["schemaValid"] and answer["category"] == "fruit"
        except ValueError:
            pass
    usage = response.get("usage")
    if isinstance(usage, dict):
        counts = [usage.get(key) for key in ("prompt_tokens", "completion_tokens", "total_tokens")]
        validity["usageValid"] = (all(type(value) is int and value >= 0 for value in counts)
                                  and counts[0] > 0 and 0 < counts[1] <= 64 and counts[0] + counts[1] == counts[2])
    return {"passed": all(validity.values()), "checks": validity, "usage": usage,
            "timings": response.get("timings")}


def save_record(record: dict) -> None:
    record["updatedAt"] = now()
    temporary = OUTPUT_PATH.with_name(f".{OUTPUT_PATH.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(record, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    os.replace(temporary, OUTPUT_PATH)


def run_smoke() -> dict:
    record = {"protocolVersion": "local-qwen-setup-smoke/1.0", "kind": "setup_smoke",
              "benchmark": False, "startedAt": now(), "baseUrl": f"http://{HOST}:{PORT}",
              "request": smoke_request(), "expected": {"category": "fruit"}, "exchanges": [],
              "postAttempted": False, "postRetried": False, "status": "checking_readiness"}
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    try:
        # Claim the artifact before any HTTP call, preserving previous evidence.
        with OUTPUT_PATH.open("x") as file:
            json.dump(record, file, indent=2)
    except FileExistsError:
        return err("smoke_record_already_exists", path=str(OUTPUT_PATH))
    for path, predicate in (("/health", ready_health), ("/v1/models", ready_models)):
        exchange = request_local("GET", path)["value"]
        record["exchanges"].append(exchange)
        if not predicate(exchange):
            record["status"] = "readiness_failed"
            save_record(record)
            return err("local_qwen_not_ready", path=path, record=str(OUTPUT_PATH), postAttempted=False)
        save_record(record)
    record.update(status="post_started", postAttempted=True)
    save_record(record)
    exchange = request_local("POST", "/v1/chat/completions", record["request"])["value"]
    record["exchanges"].append(exchange)
    record["validation"] = validate_completion(exchange)
    record["status"] = "passed" if record["validation"]["passed"] else "failed"
    record["postOutcomeUnknown"] = exchange["transportError"] is not None
    save_record(record)
    summary = {"kind": "setup_smoke", "passed": record["validation"]["passed"],
               "httpStatus": exchange["httpStatus"], "latencyMs": exchange["latencyMs"],
               "usage": record["validation"]["usage"], "checks": record["validation"]["checks"],
               "postRetried": False, "record": str(OUTPUT_PATH)}
    return ok(summary) if summary["passed"] else err("setup_smoke_failed", **summary)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--describe", action="store_true", help="Print the proposed request; no HTTP calls or artifact writes.")
    arguments = parser.parse_args()
    try:
        result = ok({"baseUrl": f"http://{HOST}:{PORT}", "request": smoke_request(),
                     "outputPath": str(OUTPUT_PATH), "modelCalled": False}) if arguments.describe else run_smoke()
    except Exception as error:
        result = err("smoke_client_failed", errorType=type(error).__name__, record=str(OUTPUT_PATH))
    print(json.dumps(result, ensure_ascii=False, allow_nan=False), flush=True)
    return 0 if result["tag"] == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
