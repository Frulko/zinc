"""Image release trust boundaries and Etcher setup on native temporary files."""
import hashlib
import io
import json
import os
from pathlib import Path
import runpy
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
release = runpy.run_path(str(ROOT / 'tools/pi-image-release'))


class Pipeline(unittest.TestCase):
    def test_library_and_filesystem_failures_stop_image_validation(self):
        source = (ROOT / 'image/check.sh').read_text()
        check = 'if libraries=' + source.split('if libraries=', 1)[1].split('check "the session script', 1)[0]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bin = root / 'bin'
            bin.mkdir()
            chroot = bin / 'chroot'
            chroot.write_text('#!/bin/sh\nprintf "%s" "$LIBRARIES"\nexit "$LDD_STATUS"\n')
            chroot.chmod(0o755)
            for status, libraries, expected in ((0, 'libc => /lib/libc.so', 'PASS'), (1, '', 'FAIL'), (0, 'libc => not found', 'FAIL')):
                env = dict(os.environ, PATH=str(bin) + ':' + os.environ['PATH'], LDD_STATUS=str(status), LIBRARIES=libraries)
                result = subprocess.run(['bash', '-c', 'pass() { echo PASS; }; miss() { echo FAIL; }; R=/unused;\n' + check],
                                        env=env, capture_output=True, text=True)
                self.assertEqual(result.stdout.strip(), expected)
        source = (ROOT / 'image/build.sh').read_text()
        final_check = 'umount -R "$R"\n' + source.split('umount -R "$R"\n', 1)[1].split('step "Compressing"', 1)[0]
        for status in (0, 1, 2):
            script = ('set -e\nR=/unused; RLOOP=/unused\numount() { :; }; e2fsck() { return ' + str(status) +
                      '; }; cleanup() { echo detached; };\n' + final_check + 'echo compress\n')
            result = subprocess.run(['bash', '-c', script], capture_output=True, text=True)
            self.assertEqual(result.returncode == 0, status < 2)
            self.assertEqual('compress' in result.stdout, status < 2)

    def test_verified_profile_and_rejections(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            private = root / 'private.pem'
            subprocess.run(['openssl', 'genpkey', '-algorithm', 'ED25519', '-out', str(private)], check=True, capture_output=True)
            public = subprocess.check_output(['openssl', 'pkey', '-in', str(private), '-pubout', '-outform', 'DER'])
            (root / 'update.pub').write_text(public[-32:].hex())
            package = io.BytesIO()
            with tarfile.open(fileobj=package, mode='w:gz') as tar:
                for name in ('bin/zinc', 'share/zinc/image/zinc-session', 'share/zinc/image/zinc-agent.service',
                             'share/zinc/image/zinc-admin', 'share/zinc/image/zinc-shell.service', 'share/zinc/image/player-source.tar.gz'):
                    member = tarfile.TarInfo('zinc-0.7.0/' + name)
                    member.size = 1
                    tar.addfile(member, io.BytesIO(b'x'))
            archive = package.getvalue()
            body = ('version=0.7.0\nurl=zinc-0.7.0-linux-aarch64.tar.gz\nsha256=' + hashlib.sha256(archive).hexdigest() + '\n').encode()
            signed = root / 'body'
            signed.write_bytes(body)
            signature = subprocess.check_output(['openssl', 'pkeyutl', '-sign', '-rawin', '-inkey', str(private), '-in', str(signed)])
            manifest = b'sig=' + signature.hex().encode() + b'\n' + body

            def fetch(worker, url, path, limit):
                path.write_bytes(manifest if url.endswith('.manifest') else archive)

            cache, output = root / 'cache', root / 'profile.json'
            # ROOT is the repository trust anchor; substitute only the test's generated public key.
            with patch.dict(release['prepare'].__globals__, ROOT=root), patch.object(release['ImageRelease'], 'fetch', fetch):
                profile = release['prepare']('0.7.0', output, cache)
                self.assertEqual(set(profile), {'name', 'zinc'})
                self.assertEqual(profile['zinc']['sha256'], hashlib.sha256(archive).hexdigest())
                self.assertEqual(json.loads(output.read_text()), profile)
                self.assertEqual((cache / 'zinc-0.7.0-linux-aarch64.tar.gz').read_bytes(), archive)
                for bad in ('../1.0.0', 'v0.7.0', '0.7.0;id'):
                    with self.assertRaises(ValueError):
                        release['prepare'](bad, output, cache)
                for bad in (b'signature=none\n' + body, manifest.replace(b'version=0.7.0', b'version=0.7.1')):
                    good, manifest = manifest, bad
                    with self.assertRaises((ValueError, subprocess.CalledProcessError)):
                        release['prepare']('0.7.0', output, cache)
                    manifest = good
                good, archive = archive, b'corrupt'
                with self.assertRaisesRegex(ValueError, 'checksum'):
                    release['prepare']('0.7.0', output, cache)
                archive = good
                # Validly signed old packages are checked too: signature alone does not provide screen coordination.
                archive = io.BytesIO()
                with tarfile.open(fileobj=archive, mode='w:gz'):
                    pass
                archive = archive.getvalue()
                body = body.replace(hashlib.sha256(good).hexdigest().encode(), hashlib.sha256(archive).hexdigest().encode())
                signed.write_bytes(body)
                signature = subprocess.check_output(['openssl', 'pkeyutl', '-sign', '-rawin', '-inkey', str(private), '-in', str(signed)])
                manifest = b'sig=' + signature.hex().encode() + b'\n' + body
                with self.assertRaisesRegex(ValueError, 'predates'):
                    release['prepare']('0.7.0', output, cache)
                self.assertEqual((cache / 'zinc-0.7.0-linux-aarch64.tar.gz').read_bytes(), good)

    def test_etcher_configuration_and_old_card_rejection(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            boot = root / 'boot volume'
            boot.mkdir()
            profile = root / 'private.json'
            profile.write_text(json.dumps({'user': {'name': 'spark', 'password': 'fixture-password'}, 'ssh': True, 'agent': True, 'debug': True,
                                           'wifi': {'ssid': 'fixture-network', 'password': 'fixture-wifi', 'country': 'FR'}}))
            for name in ('cmdline.txt', 'config.txt', 'user-data'):
                (boot / name).write_text('original\n')
            command = ['bash', str(ROOT / 'tools/pi-image'), 'configure', str(boot), str(profile)]
            result = subprocess.run(command, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn('fixture-password', result.stdout + result.stderr)
            cloud = json.loads((boot / 'user-data').read_text().split('\n', 1)[1])
            self.assertEqual(cloud['users'][0]['name'], 'spark')
            self.assertTrue(cloud['users'][0]['hashed_passwd'].startswith('$6$'))
            self.assertTrue((boot / 'ssh').exists())
            self.assertEqual((boot / 'config.txt').read_text(), 'original\n')
            self.assertIn('fixture-network', (boot / 'network-config').read_text())
            # Corrected settings must also turn off what a prior pre-boot configuration enabled.
            profile.write_text(json.dumps({'ssh': False, 'agent': False, 'debug': False}))
            result = subprocess.run(command, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            for name in ('ssh', 'zinc-agent', 'zinc-report', 'network-config'):
                self.assertFalse((boot / name).exists(), name)
            (boot / 'user-data').unlink()  # The old cleanup already consumed it: not an initial-setup card.
            result = subprocess.run(command, text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('freshly flashed', result.stderr)


if __name__ == '__main__':
    unittest.main()
