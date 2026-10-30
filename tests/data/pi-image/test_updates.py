"""Pi update boundaries on the Mac: local signed archives, no system services or network."""
import fcntl
import hashlib
import importlib.machinery
import io
import json
import os
import shutil
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
        payload = generation / 'engine/share/zinc/image'
        payload.mkdir()
        (payload / 'zinc-session').write_text('#!/bin/bash\n# session ' + requested + '\n')
        (payload / 'zinc-agent.service').write_text('# agent ' + requested + '\n')
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

    def test_signed_package_carries_the_exact_system_files(self):
        loader = importlib.machinery.SourceFileLoader('zinc_package', 'tools/package')
        package = types.ModuleType(loader.name)
        package.__file__ = 'tools/package'
        loader.exec_module(package)
        share = self.root / 'share'
        # Exercise real payload metadata without copying the unchanged engine/source trees.
        copy = package.copy_tree
        def directory(src, dst, keep=None):
            if src in (str(Path(package.REPO) / 'image/player'), str(Path(package.REPO) / 'plugins/network')):
                copy(src, dst, keep)
            else:
                Path(dst).mkdir(parents=True, exist_ok=True)
        with patch.object(package, 'copy_tree', directory):
            package.payload(str(share))
        for name, (relative, _) in update.SYSTEM_FILES.items():
            self.assertEqual((share / 'image' / name).read_bytes(), (Path('image/files') / relative).read_bytes())
        with tarfile.open(share / 'image/player-source.tar.gz') as source:
            self.assertEqual(json.load(source.extractfile('zinc.json'))['targets']['linux'], {'resize': 'fill', 'fullscreen': True})
            self.assertIn('plugins/network/index.ts', source.getnames())
            self.assertFalse(any(name.startswith(('dev/', 'dist/', '.zinc/')) for name in source.getnames()))

    def test_player_sources_follow_the_signed_engine_and_legacy_fallback(self):
        worker = LocalUpdater(self.root, self.root / 'state')
        generation = self.root / 'versions/new'
        (self.root / 'player-source.tar.gz').write_bytes(b'factory')
        self.assertEqual(worker.player_source(generation), self.root / 'player-source.tar.gz')
        source = generation / 'engine/share/zinc/image/player-source.tar.gz'
        source.parent.mkdir(parents=True)
        source.write_bytes(b'new signed player')
        self.assertEqual(worker.player_source(generation).read_bytes(), b'new signed player')
        source.unlink()
        source.symlink_to(self.root / 'player-source.tar.gz')
        with self.assertRaisesRegex(ValueError, 'invalid'):
            worker.player_source(generation)

    def test_prepare_builds_signed_sources_and_probes_a_virtual_display(self):
        generation = self.root / 'versions/new'
        generation.mkdir(parents=True)
        worker = LocalUpdater(self.root, self.root / 'state')
        extracted = []
        def extract(archive, destination, strip_root=False):
            destination.mkdir(parents=True)
            extracted.append(Path(archive))
            if strip_root:
                (destination / 'share/zinc/image').mkdir(parents=True)
                (destination / 'share/zinc/VERSION').write_text('0.7.1')
                (destination / 'share/zinc/image/player-source.tar.gz').write_bytes(b'signed player')
        calls = []
        def run(args, **kwargs):
            calls.append(args)
            if args[-1] == '--version':
                return 'zinc-next 0.7.1'
            if 'pack' in args:
                Path(args[-1]).write_bytes(b'new player bundle')
            if 'ZINC_FRAMES=2' in args:
                self.assertIn('ZINC_FBDEV_SIM_FORMAT=800x480x32', args)
                display = next(arg.split('=', 1)[1] for arg in args if arg.startswith('ZINC_FBDEV_SIM='))
                shot = next(arg.split('=', 1)[1] for arg in args if arg.startswith('ZINC_SHOT='))
                self.assertEqual(Path(display).parent, Path(shot).parent)
                Path(shot).write_bytes(b'frame')
            return ''
        with patch.object(worker, 'download', return_value=self.root / 'signed-engine.tar.gz'), patch.object(update, 'extract', extract), patch.object(worker, 'run', run):
            worker.prepare('0.7.1', generation)
        self.assertEqual(extracted[-1], generation / 'engine/share/zinc/image/player-source.tar.gz')
        self.assertEqual((generation / 'player.zapp').read_bytes(), b'new player bundle')
        self.assertTrue(any('ZINC_FRAMES=2' in args for args in calls))
        self.assertFalse((generation / 'source').exists())

    def test_prepare_installs_the_packed_player_without_building(self):
        generation = self.root / 'versions/packed'
        generation.mkdir(parents=True)
        worker = LocalUpdater(self.root, self.root / 'state')
        def extract(archive, destination, strip_root=False):
            destination.mkdir(parents=True)
            (destination / 'share/zinc/image').mkdir(parents=True)
            (destination / 'share/zinc/VERSION').write_text('0.7.2')
            (destination / 'share/zinc/image/player.zapp').write_bytes(b'packed where the release was built')
        calls = []
        def run(args, **kwargs):
            calls.append(args)
            if args[-1] == '--version':
                return 'zinc-next 0.7.2'
            if 'ZINC_FRAMES=2' in args:
                Path(next(arg.split('=', 1)[1] for arg in args if arg.startswith('ZINC_SHOT='))).write_bytes(b'frame')
            return ''
        with patch.object(worker, 'download', return_value=self.root / 'signed-engine.tar.gz'), patch.object(update, 'extract', extract), patch.object(worker, 'run', run):
            worker.prepare('0.7.2', generation)
        self.assertEqual((generation / 'player.zapp').read_bytes(), b'packed where the release was built')
        self.assertFalse(any('pack' in args for args in calls))   # nothing is compiled on the device
        self.assertTrue(any('ZINC_FRAMES=2' in args for args in calls))

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
        system = self.root / 'system'
        for name, (relative, _) in update.SYSTEM_FILES.items():
            target = system / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('factory ' + name)
        worker = TransactionUpdater(root, state, system_root=system)
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
            replace = update.os.replace
            failed = []
            def fail_second_system_file(source, destination):
                if str(destination) == str(system / 'etc/systemd/system/zinc-agent.service') and not failed:
                    failed.append(True)
                    raise OSError('interrupted system file replacement')
                return replace(source, destination)
            with patch.object(update.os, 'replace', fail_second_system_file):
                with self.assertRaisesRegex(OSError, 'interrupted system'):
                    worker.install('0.7.0')
            self.assertEqual(worker.installed(), '0.6.2')
            for name, (relative, _) in update.SYSTEM_FILES.items():
                self.assertEqual((system / relative).read_text(), 'factory ' + name)
            worker.fail_ready = True
            with self.assertRaisesRegex(ValueError, 'first frame'):
                worker.install('0.7.0')
            self.assertEqual(worker.installed(), '0.6.2')
            self.assertFalse((state / 'activating').exists())
            self.assertEqual((system / 'usr/lib/zinc/zinc-session').read_text(), 'factory zinc-session')
            self.assertFalse((state / 'pending.json').exists())
            worker.fail_ready = False
            worker.install('0.7.0')
            self.assertEqual(worker.installed(), '0.7.0')
            self.assertEqual(worker.installed('previous'), '0.6.2')
            self.assertEqual((root / 'current/player.zapp').read_text(), 'player built by 0.7.0')
            self.assertIn('session 0.7.0', (system / 'usr/lib/zinc/zinc-session').read_text())
            self.assertIn('agent 0.7.0', (system / 'etc/systemd/system/zinc-agent.service').read_text())
            worker.rollback()
            self.assertEqual(worker.installed(), '0.6.2')
            self.assertEqual((root / 'current/player.zapp').read_text(), 'factory player')
            self.assertEqual((system / 'usr/lib/zinc/zinc-session').read_text(), 'factory zinc-session')
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
            worker.apply_system(root / saved['previous'])
            worker.recover()
            self.assertEqual(worker.installed(), '0.5.2')
            self.assertEqual(worker.installed('previous'), '0.6.2')
            self.assertIn('session 0.5.2', (system / 'usr/lib/zinc/zinc-session').read_text())
            self.assertFalse((state / 'pending.json').exists())
            self.assertFalse((state / 'activating').exists())
            self.assertIn(['systemctl', 'daemon-reload'], worker.calls)
        with patch.object(update.shutil, 'disk_usage', return_value=types.SimpleNamespace(free=1024)):
            with self.assertRaisesRegex(ValueError, '2 GB'):
                worker.install('0.7.0')

    def test_incomplete_system_payload_and_legacy_fallback(self):
        root, system = self.root / 'zinc', self.root / 'system'
        factory = root / 'versions/factory'
        factory.mkdir(parents=True)
        (root / 'current').symlink_to('versions/factory')
        for name, (relative, _) in update.SYSTEM_FILES.items():
            target = system / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('factory ' + name)
        worker = TransactionUpdater(root, self.root / 'state', system_root=system)
        worker.calls = []
        broken = root / 'versions/broken'
        payload = broken / 'engine/share/zinc/image'
        payload.mkdir(parents=True)
        (payload / 'zinc-session').write_text('new session')
        with self.assertRaisesRegex(ValueError, 'incomplete'):
            worker.prepare_system(broken)
        self.assertEqual((system / 'usr/lib/zinc/zinc-session').read_text(), 'factory zinc-session')
        legacy = root / 'versions/legacy'
        legacy.mkdir()
        worker.prepare_system(legacy)
        self.assertEqual((legacy / 'system/zinc-session').read_text(), 'factory zinc-session')
        # Previously published two-file payloads remain installable and preserve missing optional files.
        (payload / 'zinc-agent.service').write_text('old agent')
        worker.prepare_system(broken)
        self.assertEqual((broken / 'system/zinc-admin').read_text(), 'factory zinc-admin')
        (payload / 'player-source.tar.gz').write_bytes(b'new format')
        shutil.rmtree(broken / 'system')
        with self.assertRaisesRegex(ValueError, 'incomplete'):
            worker.prepare_system(broken)

    def test_old_system_snapshot_is_extended_before_activation(self):
        generation = self.root / 'current'
        directory = generation / 'system'
        directory.mkdir(parents=True)
        system = self.root / 'system'
        for name, (relative, _) in update.SYSTEM_FILES.items():
            file = system / relative
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text('installed ' + name)
        (directory / 'zinc-session').write_text('saved older session')
        worker = LocalUpdater(self.root, self.root / 'state', system_root=system)
        copy = update.shutil.copyfile
        def interrupted(source, destination):
            if str(destination).endswith('.zinc-admin-next'):
                Path(destination).write_text('partial')
                raise OSError('power cut during snapshot migration')
            return copy(source, destination)
        with patch.object(update.shutil, 'copyfile', interrupted):
            with self.assertRaisesRegex(OSError, 'power cut'):
                worker.snapshot_system(generation)
        self.assertFalse((directory / 'zinc-admin').exists())
        worker.snapshot_system(generation)
        self.assertEqual((directory / 'zinc-session').read_text(), 'saved older session')
        self.assertEqual((directory / 'zinc-admin').read_text(), 'installed zinc-admin')

    def test_failure_shows_the_error_not_the_compile_progress(self):
        stderr = ('  compile    read, check and lower sources...\n  compile    52 files, 323 functions    5.3 s\n'
                  '  plugin     Process: using Next implementation\nzinc: plugins: network, process, svg\n'
                  'zinc: cannot write player.zapp: No space left on device\n')
        error = subprocess.CalledProcessError(1, ['/usr/lib/zinc/versions/x/engine/bin/zinc', 'pack'], '', stderr)
        self.assertEqual(update.failure(error), 'zinc: cannot write player.zapp: No space left on device (zinc: exit code 1)')
        killed = subprocess.CalledProcessError(-9, ['zinc', 'pack'], '', stderr.splitlines(True)[0])
        self.assertEqual(update.failure(killed), '(zinc: killed by signal 9 (out of memory?))')
        self.assertEqual(update.failure(ValueError('No previous engine.')), 'No previous engine.')

    def test_lock_rejects_a_second_worker(self):
        path = self.root / 'lock'
        with path.open('a') as first, path.open('a') as second:
            fcntl.flock(first, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                fcntl.flock(second, fcntl.LOCK_EX | fcntl.LOCK_NB)


if __name__ == '__main__':
    unittest.main()
