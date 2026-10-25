import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'tools'))
from scene_exchange import publish, revision, validate


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


if __name__ == '__main__':
    unittest.main()
