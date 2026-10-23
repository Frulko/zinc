"""Pi update boundaries on the Mac: local signed archives, no system services or network."""
import fcntl
import hashlib
import importlib.machinery
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import types
import unittest
from unittest.mock import patch

loader = importlib.machinery.SourceFileLoader('pi_update', 'image/files/usr/lib/zinc/zinc-player-update')
update = types.ModuleType(loader.name)
loader.exec_module(update)
ZINC = str(Path(os.environ['ZINC']).resolve())


def archive(path, name='zinc-0.5.2-linux-aarch64/bin/zinc', kind=tarfile.REGTYPE):
    with tarfile.open(path, 'w:gz') as tar:
        entry = tarfile.TarInfo(name)
        entry.type = kind
        entry.linkname = '/etc/passwd'
        data = b'#!/bin/sh\necho zinc-next 0.5.2\n'
        entry.size = len(data) if kind == tarfile.REGTYPE else 0
        entry.mode = 0o755
        tar.addfile(entry, io.BytesIO(data) if entry.size else None)


class LocalUpdater(update.Updater):
    def arch(self):
        return 'aarch64'

    def fetch(self, url, destination, limit):
        destination.write_bytes(self.manifest if url.endswith('.manifest') else self.archive)


class TransactionUpdater(update.Updater):
    fail_prepare = False
    fail_ready = False

    def run(self, args, **kwargs):
        self.calls.append(args)
        return ''

    def prepare(self, requested, generation):
        (generation / 'engine/share/zinc').mkdir(parents=True)
        (generation / 'engine/share/zinc/VERSION').write_text(requested)
        (generation / 'player.zapp').write_text('player built by ' + requested)
        if self.fail_prepare:
            raise ValueError('compile failed')

    def wait_ready(self):
        if self.fail_ready:
            raise ValueError('no first frame')


class UpdatesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def test_userspace_architecture_and_catalog(self):
        self.assertEqual(update.architecture('armhf'), 'armhf')
        self.assertEqual(update.architecture('arm64'), 'aarch64')
        with self.assertRaises(ValueError):
            update.architecture('riscv64')
        releases = []
        for ver, arch, pre in [('0.5.2', 'armhf', False), ('0.6.2', 'aarch64', False), ('0.7.0', 'aarch64', False), ('9.0.0', 'aarch64', True)]:
            releases.append({'tag_name': 'v' + ver, 'prerelease': pre, 'assets': [
                {'name': 'zinc-linux-' + arch + '.manifest'}, {'name': 'zinc-' + ver + '-linux-' + arch + '.tar.gz'}]})
        self.assertEqual(update.release_versions(releases, 'aarch64'), ['0.7.0', '0.6.2'])
        self.assertEqual(update.release_versions(releases, 'armhf'), ['0.5.2'])
        for bad in ['../1.0.0', '1.0.0;reboot', 'v1.0.0', '01.0.0', '1.0']:
            with self.assertRaises(ValueError):
                update.version(bad)

    def test_signed_download_including_an_older_version(self):
        keys = subprocess.check_output([ZINC, 'update-keygen'], text=True)
        keys = dict(line.split('=', 1) for line in keys.splitlines())
        key = self.root / 'key'
        key.write_text(keys['public'])
        archive_path = self.root / 'engine.tar.gz'
        archive(archive_path)
        worker = LocalUpdater(self.root, self.root / 'state', key, ZINC)
        worker.archive = archive_path.read_bytes()
        body = ('version=0.5.2\nurl=zinc-0.5.2-linux-aarch64.tar.gz\nsha256=' + hashlib.sha256(worker.archive).hexdigest() + '\n')
        unsigned = self.root / 'unsigned'

        def signed(text):
            unsigned.write_text(text)
            return subprocess.check_output([ZINC, 'update-sign', str(unsigned), keys['seed']])

        worker.manifest = signed(body)
        self.assertEqual(worker.download('0.5.2', self.root).read_bytes(), worker.archive)
        good_manifest = worker.manifest
        worker.manifest = worker.manifest.replace(b'0.5.2', b'0.5.1')
        with self.assertRaises(subprocess.CalledProcessError):
            worker.download('0.5.2', self.root)
        for bad in [body.replace('aarch64', 'armhf'), body.replace('version=0.5.2', 'version=0.5.1'), body + 'version=0.5.2\n', body.replace('url=', 'url=https://evil.invalid/')]:
            worker.manifest = signed(bad)
            with self.assertRaises(ValueError):
                worker.download('0.5.2', self.root)
        worker.manifest = body.encode() + b'signature=none\n'
        with self.assertRaises(ValueError):
            worker.download('0.5.2', self.root)
        worker.manifest = good_manifest
        worker.archive = b'corrupted download'
        with self.assertRaisesRegex(ValueError, 'checksum'):
            worker.download('0.5.2', self.root)

    def test_extract_rejects_escape_links_and_special_files(self):
        for i, (name, kind) in enumerate([('../escape', tarfile.REGTYPE), ('/absolute', tarfile.REGTYPE),
                                          ('root/link', tarfile.SYMTYPE), ('root/hardlink', tarfile.LNKTYPE), ('root/device', tarfile.CHRTYPE)]):
            path = self.root / ('bad' + str(i) + '.tar.gz')
            archive(path, name, kind)
            with self.assertRaises(ValueError):
                update.extract(path, self.root / ('out' + str(i)), True)
        path = self.root / 'good.tar.gz'
        archive(path)
        out = self.root / 'good'
        update.extract(path, out, True)
        self.assertTrue((out / 'bin/zinc').stat().st_mode & 0o111)

    @patch.object(update.subprocess, 'run', return_value=types.SimpleNamespace(returncode=0))
    def test_activation_downgrade_rollback_and_failed_preparation(self, systemctl):
        root, state = self.root / 'zinc', self.root / 'state'
        factory = root / 'versions/factory'
        (factory / 'engine/share/zinc').mkdir(parents=True)
        (factory / 'engine/share/zinc/VERSION').write_text('0.6.2')
        (factory / 'player.zapp').write_text('factory player')
        (root / 'current').symlink_to('versions/factory')
        worker = TransactionUpdater(root, state)
        worker.calls = []
        # The disk threshold is checked too, without depending on the developer's free space.
        with patch.object(update.shutil, 'disk_usage', return_value=types.SimpleNamespace(free=4 * 1024**3)):
            worker.fail_prepare = True
            with self.assertRaisesRegex(ValueError, 'compile failed'):
                worker.install('0.7.0')
            self.assertEqual(worker.installed(), '0.6.2')
            self.assertFalse((root / 'previous').exists())
            self.assertEqual(len(list((root / 'versions').iterdir())), 1)
            worker.fail_prepare = False
            worker.fail_ready = True
            with self.assertRaisesRegex(ValueError, 'first frame'):
                worker.install('0.7.0')
            self.assertEqual(worker.installed(), '0.6.2')
            self.assertFalse((state / 'activating').exists())
            self.assertFalse((state / 'pending.json').exists())
            worker.fail_ready = False
            worker.install('0.7.0')
            self.assertEqual(worker.installed(), '0.7.0')
            self.assertEqual(worker.installed('previous'), '0.6.2')
            self.assertEqual((root / 'current/player.zapp').read_text(), 'player built by 0.7.0')
            worker.rollback()
            self.assertEqual(worker.installed(), '0.6.2')
            self.assertEqual((root / 'current/player.zapp').read_text(), 'factory player')
            worker.install('0.5.2')
            self.assertEqual(worker.installed(), '0.5.2')
            self.assertEqual(worker.installed('previous'), '0.6.2')
            self.assertEqual(len(list((root / 'versions').iterdir())), 2)
            self.assertIn(['systemctl', 'start', 'zinc-agent.service'], worker.calls)
            # Simulate a power cut after switching current, before its first-frame confirmation.
            saved = {'current': os.readlink(root / 'current'), 'previous': os.readlink(root / 'previous')}
            (state / 'pending.json').write_text(json.dumps(saved))
            (state / 'activating').touch()
            worker.link('current', saved['previous'])
            worker.recover()
            self.assertEqual(worker.installed(), '0.5.2')
            self.assertEqual(worker.installed('previous'), '0.6.2')
            self.assertFalse((state / 'pending.json').exists())
            self.assertFalse((state / 'activating').exists())
        with patch.object(update.shutil, 'disk_usage', return_value=types.SimpleNamespace(free=1024)):
            with self.assertRaisesRegex(ValueError, '2 GB'):
                worker.install('0.7.0')

    def test_lock_rejects_a_second_worker(self):
        path = self.root / 'lock'
        with path.open('a') as first, path.open('a') as second:
            fcntl.flock(first, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                fcntl.flock(second, fcntl.LOCK_EX | fcntl.LOCK_NB)


if __name__ == '__main__':
    unittest.main()
