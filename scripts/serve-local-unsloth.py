"""Validate the pinned Unsloth runtime; start only with explicit --serve."""
from __future__ import annotations
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import resource
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT.parent.parent / 'work/qwen-unsloth'
ALIAS = 'qwen3.8-flash-next-unsloth-ud-q3-k-xl'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validated_command():
    setup = json.loads((ROOT / 'data/local-unsloth-setup.json').read_text())
    if setup['revision'] != '38bb39ee97821de2c9009abb7e93950eec396e66':
        raise ValueError('unexpected_model_revision')
    if setup['runtime']['commit'] != 'b29c606e28a01b1bc8c1351026a0fa6e616bf6c4':
        raise ValueError('unexpected_runtime_revision')
    binary = WORK / 'runtime/llama-b10964/llama-server'
    if digest(binary) != setup['runtime']['binarySha256']:
        raise ValueError('runtime_binary_hash_mismatch')
    manifest = json.loads((WORK / 'runtime-file-manifest.json').read_text())
    if digest(WORK / 'runtime-file-manifest.json') != setup['runtime']['fileManifestSha256']:
        raise ValueError('runtime_manifest_hash_mismatch')
    for entry in manifest['files']:
        if digest(WORK / 'runtime' / entry['path']) != entry['sha256']:
            raise ValueError('runtime_file_hash_mismatch')
    receipt = json.loads((WORK / 'download-receipt.json').read_text())
    if receipt['status'] != 'all_weights_verified' or receipt['revision'] != setup['revision']:
        raise ValueError('weight_verification_incomplete')
    if sorted(receipt['files'], key=lambda x:x['path']) != sorted(setup['modelFiles'], key=lambda x:x['path']):
        raise ValueError('weight_receipt_mismatch')
    for entry in setup['modelFiles']:
        path = WORK / 'model' / entry['path']
        if path.stat().st_size != entry['size']:
            raise ValueError('weight_size_mismatch')
    model = WORK / 'model' / setup['modelFiles'][0]['path']
    return [str(binary), '--model', str(model), '--alias', ALIAS,
            '--host', '127.0.0.1', '--port', '8767', '--parallel', '1',
            '--ctx-size', '32768', '--batch-size', '512', '--ubatch-size', '128',
            '--gpu-layers', 'all', '--fit', 'off', '--load-mode', 'mmap',
            '--flash-attn', 'auto', '--cache-ram', '0', '--ctx-checkpoints', '0',
            '--no-context-shift', '--no-warmup', '--spec-type', 'none',
            '--reasoning', 'off', '--jinja', '--offline', '--no-webui', '--metrics',
            '--cors-origins', 'localhost', '--no-cors-credentials']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serve', action='store_true')
    parser.add_argument('--run-name', help='Fresh evidence subdirectory for a later run; existing logs are never overwritten.')
    args = parser.parse_args()
    if args.run_name is not None and (Path(args.run_name).name != args.run_name or args.run_name in ('', '.', '..')):
        raise ValueError('invalid_run_name')
    run_dir = WORK if args.run_name is None else WORK / 'server-runs' / args.run_name
    command = validated_command()
    print(json.dumps({'tag':'ok','value':{'command':command,'modelLoaded':False,'startingServer':args.serve}}), flush=True)
    if not args.serve:
        return
    with (WORK / 'serve.lock').open('a+') as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        # Do not inherit arbitrary runtime tuning or API credentials.
        environment = {key:value for key,value in os.environ.items()
                       if key in ('PATH', 'HOME', 'TMPDIR', 'LANG') or key.startswith('LC_')}
        environment['LLAMA_CACHE'] = str(WORK / 'runtime-cache')
        started = time.time()
        run_dir.mkdir(parents=True, exist_ok=True)
        with (run_dir / 'server.log').open('x') as log:
            child = subprocess.Popen(command, env=environment, stdout=log, stderr=subprocess.STDOUT)
            snapshot = {'pid':child.pid, 'command':command, 'startedUnixSeconds':started,
                        'log':str(run_dir / 'server.log'), 'status':'starting'}
            (run_dir / 'server-session.json').write_text(json.dumps(snapshot, indent=2) + '\n')
            print(json.dumps({'tag':'ok','value':snapshot}), flush=True)
            def interrupted(signum, frame):
                raise KeyboardInterrupt
            signal.signal(signal.SIGTERM, interrupted)
            try:
                code = child.wait()
            except KeyboardInterrupt:
                child.send_signal(signal.SIGINT)
                try:
                    code = child.wait(timeout=30)
                except subprocess.TimeoutExpired:
                    child.kill()
                    code = child.wait(timeout=10)
            usage = resource.getrusage(resource.RUSAGE_CHILDREN)
            snapshot.update(status='stopped', exitCode=code, elapsedSeconds=round(time.time()-started, 3),
                            peakRssBytes=usage.ru_maxrss * (1 if sys.platform == 'darwin' else 1024),
                            peakRssScope='child process high-water RSS; not a total system or GPU memory measurement')
            (run_dir / 'server-session.json').write_text(json.dumps(snapshot, indent=2) + '\n')
            print(json.dumps({'tag':'ok','value':snapshot}), flush=True)
            raise SystemExit(code)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'tag':'error','error':{'code':str(error),'type':type(error).__name__}}), flush=True)
        raise SystemExit(1)
