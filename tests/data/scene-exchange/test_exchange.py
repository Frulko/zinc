import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'tools'))
from scene_exchange import publish, revision, validate, partition_world


class ExchangeTest(unittest.TestCase):
    def setUp(self):
        self.doc = dict(schema='zinc.scene', version=1, id='yard',
                        source=dict(tool='test', file='yard.blend', scene='Yard'), assets=[], nodes=[])
        self.node = dict(id='crate', name='Crate', parent=None, asset=None,
                         translation=[0, 0, 0], rotation=[0, 0, 0, 1], scale=[1, 1, 1],
                         metadata={}, source=dict(file='yard.blend', object='Yard/Crate'))
        self.doc['nodes'] = [self.node]

    def check(self):
        self.doc['revision'] = revision(self.doc)
        return validate(self.doc)

    def test_identity_and_provenance(self):
        self.check()
        self.doc['nodes'].append(copy.deepcopy(self.node))
        with self.assertRaisesRegex(ValueError, 'duplicate identity crate'):
            self.check()
        self.doc['nodes'].pop()
        self.node['source']['file'] = '/private/me/yard.blend'
        with self.assertRaisesRegex(ValueError, 'path'):
            self.check()

    def test_missing_and_cyclic_reference(self):
        self.node['parent'] = 'absent'
        with self.assertRaisesRegex(ValueError, 'missing reference absent'):
            self.check()
        self.node['parent'] = 'crate'
        with self.assertRaisesRegex(ValueError, 'cycle at crate'):
            self.check()
        self.node['parent'] = None
        self.node['asset'] = 'missing'
        with self.assertRaisesRegex(ValueError, 'missing asset'):
            self.check()

    def test_asset_dependencies_and_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'mesh.glb'
            path.write_bytes(b'fixture')
            self.doc['assets'] = [dict(id='mesh', uri='mesh.glb', hash=hashlib.sha256(b'fixture').hexdigest(), dependencies=[])]
            self.node['asset'] = 'mesh'
            publish(self.doc, directory)
            self.doc['assets'][0]['dependencies'] = ['mesh']
            with self.assertRaisesRegex(ValueError, 'cycle'):
                publish(self.doc, directory)
            self.doc['assets'][0]['dependencies'] = []
            path.write_bytes(b'broken')
            with self.assertRaisesRegex(ValueError, 'hash mismatch'):
                publish(self.doc, directory)

    def test_atomic_deterministic_publish(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertTrue(publish(self.doc, directory))
            path = Path(directory) / 'scene.json'
            previous, stamp = path.read_bytes(), path.stat().st_mtime_ns
            self.assertFalse(publish(self.doc, directory))
            self.assertEqual(path.stat().st_mtime_ns, stamp)
            self.node['rotation'] = [0, 0, 0, 0]
            with self.assertRaisesRegex(ValueError, 'normalized'):
                publish(self.doc, directory)
            self.assertEqual(path.read_bytes(), previous)
            validate(json.loads(previous))

    def test_world_partition_preserves_identity_and_static_collisions(self):
        self.node['metadata'] = {'world': {'cell': 8}}
        for key, metadata, dynamic in [('wall', {'collision': {'shape': 'box', 'size': [1, 2, 3]}}, False),
                                        ('gate', {'gate': {'name': 'gate'}}, False),
                                        ('body', {}, True)]:
            child = copy.deepcopy(self.node)
            child.update(id=key, parent='crate', metadata=metadata, dynamic=dynamic)
            self.doc['nodes'].append(child)
        self.check()
        result = partition_world(self.doc)
        self.assertEqual([n['id'] for n in result['worlds']['crate']], ['wall'])
        self.assertEqual([n['id'] for n in result['entities']], ['crate', 'gate', 'body'])
        self.assertEqual(result['provenance'], [dict(node='wall', source=self.node['source'], world='crate')])
        self.assertEqual(len(self.doc['nodes']), 4)
        for invalid in ([], ['far', 'far'], [1, .5, .2], ['ultra']):
            self.node['metadata']['world']['levels'] = invalid
            with self.assertRaisesRegex(ValueError, 'near/mid/far'):
                self.check()
        self.node['metadata']['world']['levels'] = ['mid', 'far']
        self.check()
        self.node['metadata']['world']['cell'] = 0
        with self.assertRaisesRegex(ValueError, 'positive finite'):
            self.check()


if __name__ == '__main__':
    unittest.main()
