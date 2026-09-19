"""Inspect GGUF metadata/tensor descriptors without mapping or loading weights."""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT.parent.parent / 'work/qwen-unsloth'
SCALARS = {0:'B', 1:'b', 2:'H', 3:'h', 4:'I', 5:'i', 6:'f', 7:'?', 10:'Q', 11:'q', 12:'d'}


def read_exact(source, size):
    raw = source.read(size)
    if len(raw) != size:
        raise ValueError('incomplete_gguf_header')
    return raw


def number(source, fmt):
    return struct.unpack('<' + fmt, read_exact(source, struct.calcsize('<' + fmt)))[0]


def string(source, keep=True):
    size = number(source, 'Q')
    if size > 64 * 1024 * 1024:
        raise ValueError('oversized_gguf_string')
    if keep:
        return read_exact(source, size).decode('utf-8')
    source.seek(size, 1)
    return None


def value(source, kind, keep=True):
    if kind in SCALARS:
        result = number(source, SCALARS[kind])
        return result if keep else None
    if kind == 8:
        return string(source, keep)
    if kind == 9:
        subtype, count = number(source, 'I'), number(source, 'Q')
        if count > 10_000_000:
            raise ValueError('oversized_gguf_array')
        if not keep and subtype in SCALARS:
            source.seek(struct.calcsize('<' + SCALARS[subtype]) * count, 1)
            return None
        if keep:
            return [value(source, subtype, True) for _ in range(count)]
        for _ in range(count):
            value(source, subtype, False)
        return None
    raise ValueError('unsupported_gguf_metadata_type')


def inspect(path, expected_file_size=None):
    with path.open('rb') as source:
        if read_exact(source, 4) != b'GGUF':
            raise ValueError('gguf_magic_mismatch')
        version = number(source, 'I')
        if version != 3:
            raise ValueError('unsupported_gguf_version')
        tensor_count, metadata_count = number(source, 'Q'), number(source, 'Q')
        if tensor_count > 100_000 or metadata_count > 10_000:
            raise ValueError('implausible_gguf_header_count')
        metadata = {}
        for _ in range(metadata_count):
            key, kind = string(source), number(source, 'I')
            keep = not key.startswith('tokenizer.') or key == 'tokenizer.chat_template'
            result = value(source, kind, keep)
            if keep:
                metadata[key] = result
        tensors = []
        for _ in range(tensor_count):
            name, dimensions = string(source), number(source, 'I')
            if not 1 <= dimensions <= 4:
                raise ValueError('invalid_tensor_dimensions')
            shape = [number(source, 'Q') for _ in range(dimensions)]
            tensors.append({'name': name, 'shape': shape, 'ggmlType': number(source, 'I'),
                            'relativeOffset': number(source, 'Q')})
        header_end = source.tell()
        alignment = metadata.get('general.alignment', 32)
        data_offset = (header_end + alignment - 1) // alignment * alignment
        if data_offset > path.stat().st_size:
            raise ValueError('truncated_gguf_header')
        source.seek(0)
        header_hash = hashlib.sha256(read_exact(source, data_offset)).hexdigest()
    template = metadata.pop('tokenizer.chat_template', None)
    ordered = sorted(tensors, key=lambda item:item['relativeOffset'])
    file_size = path.stat().st_size if expected_file_size is None else expected_file_size
    for index, tensor in enumerate(ordered):
        next_offset = ordered[index + 1]['relativeOffset'] if index + 1 < len(ordered) else file_size - data_offset
        tensor['storageSpanBytesIncludingAlignment'] = next_offset - tensor['relativeOffset']
        if tensor['storageSpanBytesIncludingAlignment'] <= 0 or not all(dimension > 0 for dimension in tensor['shape']):
            raise ValueError('invalid_tensor_extent')
    result = {'file': str(path.relative_to(WORK)), 'ggufVersion': version,
              'tensorCount': tensor_count, 'metadata': metadata, 'headerBytes': data_offset,
              'headerSha256': header_hash, 'tensors': tensors}
    if template is not None:
        result['chatTemplateSha256'] = hashlib.sha256(template.encode()).hexdigest()
        result['chatTemplateBytes'] = len(template.encode())
        (WORK / 'chat-template.jinja').write_text(template)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--available', action='store_true', help='Inspect only completed local shards; mark inventory partial.')
    args = parser.parse_args()
    setup = json.loads((ROOT / 'data/local-unsloth-setup.json').read_text())
    files = [WORK / 'model' / entry['path'] for entry in setup['modelFiles']]
    if not args.available and any(not path.is_file() for path in files):
        raise ValueError('model_shards_not_complete')
    results = [inspect(path) for path in files if path.is_file()]
    tensors = [tensor for result in results for tensor in result['tensors']]
    names = [tensor['name'] for tensor in tensors]
    if len(set(names)) != len(names):
        raise ValueError('duplicate_tensor_name')
    report = {'kind': 'gguf_header_inventory', 'weightsLoaded': False, 'complete': len(results) == len(files),
              'repository': setup['repository'], 'revision': setup['revision'], 'files': results,
              'tensorCount': len(tensors), 'tensorTypes': dict(Counter(str(t['ggmlType']) for t in tensors)),
              'pleTensors': [t for t in tensors if 'per_layer' in t['name'] or '.ple_' in t['name']],
              'mtpTensors': [t for t in tensors if 'mtp' in t['name'].lower()]}
    (WORK / 'gguf-inventory.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'tag':'ok','value':{k:v for k,v in report.items() if k not in ('files','pleTensors','mtpTensors')},
                      'pleTensorCount':len(report['pleTensors']),'mtpTensorCount':len(report['mtpTensors'])}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'tag':'error','error':{'code':str(error),'type':type(error).__name__}}))
        raise SystemExit(1)
