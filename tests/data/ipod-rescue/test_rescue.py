"""Recovery safety tests. No hardware commands are executed."""
import hashlib
import json
import os
import plistlib
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'examples/ipod-rescue/backend'))
from host import inspect_firmware, read_relative, metadata
from model import plan, sample
from rescue import Rescue
from session import Session, rehearse


class RecoveryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.events = []
        self.s = Session(self.root / 'sessions', self.events.append)
        self.s.begin('test')

    def tearDown(self):
        self.s.journal.close()
        self.tmp.cleanup()

    def archive(self, entries):
        p = self.root / 'local.ipsw'
        with zipfile.ZipFile(p, 'w') as z:
            for key, value in entries:
                z.writestr(key, value)
        return p

    def test_converted_identity_and_4096_blocks_survive_both_formats(self):
        for filesystem in ('FAT32', 'HFS+'):
            d = sample()
            p = plan(d, filesystem)
            with patch('session.time.sleep'):
                result = rehearse(self.s, d, p)
            self.assertTrue(result['identityPreserved'])
            self.assertEqual(result['firmware'], '2.0.2')
            work = self.s.path / ('rehearsal-' + self.s.operation)
            self.assertEqual((work / 'syscfg.bin').read_bytes(), (work / 'syscfg.backup').read_bytes())
            volume = json.loads((work / 'volume.json').read_text())
            self.assertEqual(volume['logicalBlockSize'], 4096)
            self.assertEqual(volume['filesystem'], filesystem)
            # A separate operation owns its own artifacts.
            self.s.begin('next')

    def test_all_failure_paths_refuse_success(self):
        for fault in ('disconnect', 'wrong-target', 'wrong-firmware', 'short-write', 'scsi-error'):
            self.s.begin(fault)
            with patch('session.time.sleep'), self.assertRaises(ValueError):
                rehearse(self.s, sample(), plan(sample(), 'FAT32'), fault)
            report = json.loads((self.s.path / 'rehearsal.json').read_text())
            self.assertNotEqual(report['state'], 'verified')
            work = self.s.path / ('rehearsal-' + self.s.operation)
            self.assertEqual((work / 'syscfg.bin').read_bytes(), b'SIMULATED-SYSCFG-sim-converted')
            if fault in ('wrong-target', 'wrong-firmware', 'disconnect'):
                self.assertFalse((work / 'firmware.bin').exists())
            self.assertFalse((work / 'volume.json').exists())

    def test_hardware_cannot_be_executed_even_with_forged_plan(self):
        d = sample(); d['mode'] = 'hardware'
        p = plan(d, 'HFS+')
        self.assertFalse(p['executable'])
        self.assertGreater(len(p['blockers']), 2)
        p['simulated'] = True; p['executable'] = True
        with self.assertRaises(ValueError):
            rehearse(self.s, d, p)
        self.assertFalse(list(self.s.path.glob('rehearsal-*')))

    def test_unsupported_filesystem(self):
        with self.assertRaises(ValueError):
            plan(sample(), 'exFAT')

    def test_valid_device_plist_with_binary_data_is_json_safe(self):
        mount = self.root / 'mount'; device = mount / 'iPod_Control/Device'
        device.mkdir(parents=True)
        (device / 'SysInfo').write_text('ModelNumStr: xC297\n')
        (device / 'SysInfoExtended').write_bytes(plistlib.dumps(dict(VisibleBuildID='2.0.2', Binary=b'\x00\xff')))
        info, extended, warnings = metadata(mount)
        self.assertEqual(extended['VisibleBuildID'], '2.0.2')
        self.assertEqual(extended['Binary'], dict(encoding='hex', data='00ff'))
        json.dumps(extended)
        self.assertEqual(warnings, [])

    def test_archive_checks_integrity_without_claiming_authenticity(self):
        p = self.archive([('Firmware-35.2.0.2', b'example bytes')])
        result = inspect_firmware(p)
        self.assertEqual(result['sha256'], hashlib.sha256(p.read_bytes()).hexdigest())
        self.assertEqual(result['entries'][0]['sha256'], hashlib.sha256(b'example bytes').hexdigest())
        self.assertFalse(result['authenticated'])

    def test_archive_traversal_is_refused_without_extracting(self):
        p = self.archive([('../outside', b'bad')])
        with self.assertRaises(ValueError):
            inspect_firmware(p)
        self.assertFalse((self.root.parent / 'outside').exists())

    def test_duplicate_archive_entry(self):
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            p = self.archive([('same', b'a'), ('same', b'b')])
        with self.assertRaises(ValueError):
            inspect_firmware(p)

    def test_archive_symlink(self):
        p = self.root / 'symlink.ipsw'
        entry = zipfile.ZipInfo('link'); entry.create_system = 3
        entry.external_attr = 0o120777 << 16
        with zipfile.ZipFile(p, 'w') as z:
            z.writestr(entry, '/etc/passwd')
        with self.assertRaises(ValueError):
            inspect_firmware(p)

    def test_backup_reader_does_not_follow_any_symlink(self):
        (self.root / 'secret').write_bytes(b'host secret')
        mount = self.root / 'mount'; mount.mkdir()
        (mount / 'file').symlink_to(self.root / 'secret')
        (mount / 'directory').symlink_to(self.root, target_is_directory=True)
        for name in ('file', 'directory/secret'):
            with self.assertRaises(OSError):
                read_relative(mount, name)

    def test_parent_symlink_resolved_before_session_directory_creation(self):
        target = self.root / 'Volumes'; target.mkdir()
        link = self.root / 'link'; link.symlink_to(target, target_is_directory=True)
        with self.assertRaises(ValueError):
            Session(link / 'new', self.events.append)
        self.assertFalse((target / 'new').exists())

    def test_output_custom_removable_mount_is_rejected_before_mkdir(self):
        from types import SimpleNamespace
        mount = (self.root / 'custom-mount').resolve(); mount.mkdir()
        original_stat = Path.stat
        def removable(path, *args, **kwargs):
            if path == mount:
                return SimpleNamespace(st_dev=-1)
            return original_stat(path, *args, **kwargs)
        with patch.object(Path, 'stat', removable), self.assertRaises(ValueError):
            Session(mount / 'new', self.events.append)
        self.assertFalse((mount / 'new').exists())

    def test_export_preserves_failure_and_removes_private_evidence(self):
        self.s.write('devices.json', [dict(id='digest', name='PRIVATE-VOLUME', private=dict(serial='SECRET-SERIAL'))])
        self.s.end('failed', 'Écriture simulée refusée.', simulated=True)
        service = Rescue(self.s)
        with patch('rescue.emit') as output:
            service.handle(dict(command='export'))
        path = output.call_args.args[0]['path']
        with zipfile.ZipFile(path) as z:
            data = b'\n'.join(z.read(n) for n in z.namelist())
            self.assertNotIn(b'SECRET-SERIAL', data)
            self.assertNotIn(b'PRIVATE-VOLUME', data)
            self.assertEqual(json.loads(z.read('result.json'))['status'], 'failed')
            self.assertFalse(any('metadata' in n or 'private' in n for n in z.namelist()))

    def test_failed_scan_invalidates_previous_device_selection(self):
        service = Rescue(self.s)
        service.devices = [sample()]
        with patch('rescue.scan', side_effect=RuntimeError('unavailable')), self.assertRaises(RuntimeError):
            service.handle(dict(command='scan', mode='hardware'))
        self.assertEqual(service.devices, [])
        with self.assertRaises(ValueError):
            service.selected(dict(deviceId='sim-converted'))

    def test_raw_hardware_commands_and_stale_selections_are_rejected(self):
        service = Rescue(self.s)
        with self.assertRaises(ValueError):
            service.handle(dict(command='flash', device='/dev/disk0'))
        with self.assertRaises(ValueError):
            service.handle(dict(command='rehearse', deviceId='stale', confirmation='SIMULER'))

    def test_metadata_backup_never_calls_itself_full(self):
        mount = self.root / 'mount'; (mount / 'iPod_Control/Device').mkdir(parents=True)
        (mount / 'iPod_Control/Device/SysInfo').write_bytes(b'ModelNumStr: xC297\n')
        # A same-filesystem backup is refused even for a fake removable volume.
        with self.assertRaises(ValueError):
            self.s.backup(dict(id='fake', private=dict(mount=str(mount))))

    def test_metadata_backup_success_has_verified_files_and_explicit_exclusions(self):
        from types import SimpleNamespace
        mount = self.root / 'fake-device'; (mount / 'iPod_Control/Device').mkdir(parents=True)
        raw = b'ModelNumStr: xC297\n'
        (mount / 'iPod_Control/Device/SysInfo').write_bytes(raw)
        original_stat = os.stat
        def different_filesystem(path, *args, **kwargs):
            if str(path) == str(mount):
                return SimpleNamespace(st_dev=-1)
            return original_stat(path, *args, **kwargs)
        with patch('session.os.stat', side_effect=different_filesystem):
            out, incomplete, manifest = self.s.backup(dict(id='fixture', private=dict(mount=str(mount))))
        self.assertEqual((out / 'iPod_Control/Device/SysInfo').read_bytes(), raw)
        self.assertEqual(manifest['scope'], 'library-metadata-only')
        self.assertIn('live-NOR', manifest['excludes'])
        self.assertTrue(incomplete.exists())  # only fresh device validation can finalize this copy
        self.assertEqual(manifest['files'][0]['sha256'], hashlib.sha256(raw).hexdigest())

    def test_nonstandard_apple_nested_arrays_preserve_diagnostic_scalar_provenance(self):
        mount = self.root / 'mount'; device = mount / 'iPod_Control/Device'; device.mkdir(parents=True)
        (device / 'SysInfo').write_text('ModelNumStr: xC297\n')
        (device / 'SysInfoExtended').write_bytes(b'<plist><dict><key>VisibleBuildID</key><string>2.0.2</string><key>ImageSpecifications</key><array><key>1067</key><dict/></array></dict></plist>')
        info, extended, warnings = metadata(mount)
        self.assertEqual(extended, dict(VisibleBuildID='2.0.2'))
        self.assertTrue(any('non standard' in w for w in warnings))

    def test_jsonl_service_rehearsal_and_export(self):
        commands = [dict(command='scan', mode='simulation'),
                    dict(command='rehearse', deviceId='sim-converted', filesystem='FAT32', confirmation='SIMULER'),
                    dict(command='export')]
        run = subprocess.run([sys.executable, str(ROOT / 'examples/ipod-rescue/backend/rescue.py'),
                              '--output', str(self.root / 'cli')], input=''.join(json.dumps(x) + '\n' for x in commands),
                             text=True, capture_output=True, timeout=10, check=True)
        responses = [json.loads(line) for line in run.stdout.splitlines()]
        self.assertEqual(sum(v['type'] == 'done' for v in responses), 3)
        self.assertFalse(any(v['type'] == 'error' for v in responses))
        session = next(v['path'] for v in responses if v['type'] == 'session')
        self.assertEqual(json.loads((Path(session) / 'result.json').read_text())['identityPreserved'], True)
        self.assertFalse(next(v for v in responses if v['type'] == 'session')['hardwareWrites'])


if __name__ == '__main__':
    unittest.main()
