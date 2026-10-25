"""The zinc.scene v1 trust boundary, shared by DCC exporters."""
import hashlib
import json
import math
from pathlib import Path, PurePosixPath


def canonical(document):
    return json.dumps({k: v for k, v in document.items() if k != 'revision'},
                      sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()


def revision(document):
    return hashlib.sha256(canonical(document)).hexdigest()


def relative(value, where):
    if not isinstance(value, str) or not value or '\\' in value or ':' in value:
        raise ValueError(f'{where}: expected normalized project-relative path')
    path = PurePosixPath(value)
    if path.is_absolute() or '..' in path.parts or str(path) != value:
        raise ValueError(f'{where}: escaping or non-normalized path {value!r}')
    return value


def validate(document, directory=None, check_revision=True):
    def require(condition, message):
        if not condition:
            raise ValueError(message)

    def identity(value, where):
        require(isinstance(value, str) and bool(value.strip()), f'{where}: missing stable identity')

    def vector(value, length, where):
        require(isinstance(value, list) and len(value) == length and
                all(type(x) in (int, float) and math.isfinite(x) for x in value),
                f'{where}: expected {length} finite numbers')

    def source(value, where, root=False):
        require(isinstance(value, dict), f'{where}: missing source provenance')
        relative(value.get('file'), where + '.file')
        identity(value.get('scene' if root else 'object'), where)
        if root:
            identity(value.get('tool'), where + '.tool')

    def acyclic(records, links, where):
        visiting, visited = set(), set()
        def visit(key):
            require(key in records, f'{where}: missing reference {key}')
            require(key not in visiting, f'{where}: cycle at {key}')
            if key in visited:
                return
            visiting.add(key)
            for target in links(records[key]):
                visit(target)
            visiting.remove(key)
            visited.add(key)
        for key in records:
            visit(key)

    require(isinstance(document, dict), 'scene: expected object')
    require(document.get('schema') == 'zinc.scene' and document.get('version') == 1, 'scene: unsupported schema/version')
    identity(document.get('id'), 'scene.id')
    source(document.get('source'), 'scene.source', True)
    assets, nodes = {}, {}
    for kind, records, table in [('assets', document.get('assets'), assets), ('nodes', document.get('nodes'), nodes)]:
        require(isinstance(records, list), kind + ': expected array')
        for record in records:
            require(isinstance(record, dict), kind + ': expected object')
            key = record.get('id')
            identity(key, kind + '.id')
            require(key not in table, f'{kind}: duplicate identity {key}')
            table[key] = record
    for key, asset in assets.items():
        uri = relative(asset.get('uri'), key + '.uri')
        digest = asset.get('hash')
        require(isinstance(digest, str) and len(digest) == 64 and all(c in '0123456789abcdef' for c in digest), key + ': invalid SHA256')
        require(isinstance(asset.get('dependencies'), list) and all(isinstance(x, str) for x in asset['dependencies']), key + ': missing dependencies')
        if directory is not None:
            root = Path(directory).resolve()
            path = (root / uri).resolve()
            require(path.is_relative_to(root), key + ': asset escapes publication through symlink')
            require(path.is_file(), key + ': missing asset ' + uri)
            require(hashlib.sha256(path.read_bytes()).hexdigest() == digest, key + ': content hash mismatch')
    acyclic(assets, lambda a: a['dependencies'], 'assets')
    for key, node in nodes.items():
        require('parent' in node and (node['parent'] is None or isinstance(node['parent'], str)), key + ': parent must be identity or null')
        require('asset' in node and (node['asset'] is None or node['asset'] in assets), key + ': missing asset reference')
        identity(node.get('name'), key + '.name')
        source(node.get('source'), key + '.source')
        for field, count in [('translation', 3), ('rotation', 4), ('scale', 3)]:
            vector(node.get(field), count, key + '.' + field)
        require(abs(sum(x*x for x in node['rotation']) - 1) < .001, key + ': quaternion must be normalized')
        require(all(abs(x) > 1e-9 for x in node['scale']), key + ': zero scale')
        metadata = node.get('metadata')
        require(isinstance(metadata, dict), key + ': expected typed metadata object')
        require(not set(metadata) - {'camera', 'collision', 'trigger', 'socket', 'spawn', 'gate', 'interaction'}, key + ': unsupported metadata')
        for kind, value in metadata.items():
            require(isinstance(value, dict), key + '.' + kind + ': expected object')
            if kind in ('collision', 'trigger'):
                require(value.get('shape') == 'box', key + ': only box volumes supported')
                vector(value.get('size'), 3, key + '.' + kind + '.size')
                require(all(x > 0 for x in value['size']), key + ': volume size must be positive')
            if kind == 'camera':
                require(all(type(value.get(f)) in (int, float) and math.isfinite(value[f]) for f in ('fov', 'near', 'far')), key + ': invalid camera')
                require(0 < value['fov'] < 180 and 0 < value['near'] < value['far'], key + ': invalid camera frustum')
            if kind in ('socket', 'spawn', 'gate'):
                identity(value.get('name'), key + '.' + kind + '.name')
            if kind in ('trigger', 'interaction'):
                identity(value.get('event'), key + '.' + kind + '.event')
    acyclic(nodes, lambda n: [] if n['parent'] is None else [n['parent']], 'nodes')
    if check_revision:
        require(document.get('revision') == revision(document), 'scene: revision hash mismatch')
    return document


def publish(document, directory):
    """Publish immutable content first; scene.json is the only commit record."""
    directory = Path(directory)
    document['revision'] = revision(document)
    validate(document, directory)
    encoded = (json.dumps(document, sort_keys=True, indent=2, ensure_ascii=False, allow_nan=False) + '\n').encode()
    destination = directory / 'scene.json'
    if destination.is_file() and destination.read_bytes() == encoded:
        return False
    staging = directory / '.scene.json.tmp'
    staging.write_bytes(encoded)
    staging.replace(destination)
    return True
