"""Install only the reviewed official llama.cpp archive; no model loading."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT.parent.parent / 'work/qwen-unsloth'
URL = 'https://github.com/ggml-org/llama.cpp/releases/download/b10964/llama-b10964-bin-macos-arm64.tar.gz'
SHA256 = '033c845c1df9bf945ff37bb193238b40910b2244be3e1e637b2ceb5878f1a6f5'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--install', action='store_true')
    args = parser.parse_args()
    setup = json.loads((ROOT / 'data/local-unsloth-setup.json').read_text())
    pin = setup['runtime']
    if pin['url'] != URL or pin['assetSha256'] != SHA256:
        raise ValueError('runtime_archive_pin_mismatch')
    print(json.dumps({'tag':'ok','value':{'url':URL,'sha256':SHA256,'install':args.install}}), flush=True)
    if not args.install:
        return
    WORK.mkdir(parents=True, exist_ok=True)
    archive = WORK / pin['asset']
    if not archive.exists():
        request = urllib.request.Request(URL, headers={'User-Agent':'jev-redteam-setup/1'})
        with urllib.request.urlopen(request, timeout=45) as response:
            raw = response.read(pin['assetBytes'] + 1)
        if len(raw) != pin['assetBytes'] or hashlib.sha256(raw).hexdigest() != SHA256:
            raise ValueError('runtime_archive_integrity_mismatch')
        archive.write_bytes(raw)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != SHA256:
        raise ValueError('runtime_archive_integrity_mismatch')
    destination = WORK / 'runtime'
    destination.mkdir(exist_ok=True)
    with tarfile.open(archive, 'r:gz') as source:
        source.extractall(destination, filter='data')
    manifest = {'archiveSha256':SHA256,'files':[
        {'path':str(path.relative_to(destination)), 'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
        for path in sorted(destination.rglob('*')) if path.is_file()]}
    manifest_path = WORK / 'runtime-file-manifest.json'
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    expected = pin.get('fileManifestSha256')
    actual = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    if expected is not None and actual != expected:
        raise ValueError('runtime_extracted_manifest_mismatch')
    print(json.dumps({'tag':'ok','value':{'runtimeInstalled':True,'files':len(manifest['files']),
                                        'fileManifestSha256':actual,'modelLoaded':False}}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'tag':'error','error':{'code':str(error),'type':type(error).__name__}}), flush=True)
        raise SystemExit(1)
