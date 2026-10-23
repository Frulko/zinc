"""First-boot credentials and cleanup policy, on native temporary files only."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]


class Bootstrap(unittest.TestCase):
    def test_generated_credentials(self):
        source = (ROOT / 'image/build.sh').read_text()
        writer = source.split('HASH=\n', 1)[1].split('if [ -n "$(q .wifi.ssid)" ]; then', 1)[0]
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            profile = directory / 'profile.json'
            cases = [('spark', 'test-password', []), ('spark', '', ['ssh-ed25519 fixture']), ('', '', [])]
            for name, password, keys in cases:
                profile.write_text(json.dumps(dict(hostname='fixture', timezone='', keyboard='',
                                                  user=dict(name=name, password=password, sshKeys=keys))))
                script = 'P=$1; FW=$2; HASH=; q() { jq -r "$1" "$P"; };\n' + writer
                subprocess.run(['bash', '-eu', '-c', script, '_', str(profile), tmp], check=True, capture_output=True)
                data = (directory / 'user-data').read_text()
                self.assertTrue(data.startswith('#cloud-config\n'))
                config = json.loads(data.split('\n', 1)[1])
                if not name:
                    self.assertNotIn('users', config)
                    continue
                user = config['users'][0]
                self.assertNotIn('passwd', user)  # Ignored by cloud-init for an existing/renamed Pi user.
                self.assertEqual(user['lock_passwd'], not bool(password))
                self.assertEqual(config['ssh_pwauth'], bool(password))
                if password:
                    hashed = user['hashed_passwd']
                    self.assertTrue(hashed.startswith('$6$'))
                    salt = hashed.split('$')[2]
                    expected = subprocess.check_output(['openssl', 'passwd', '-6', '-salt', salt, '-stdin'],
                                                       input=password + '\n', text=True).strip()
                    self.assertEqual(hashed, expected)
                    self.assertNotIn(password, data)
                else:
                    self.assertNotIn('hashed_passwd', user)
                    self.assertEqual(user['ssh_authorized_keys'], keys)

    def test_failed_setup_keeps_settings_and_initramfs(self):
        source = (ROOT / 'image/files/usr/lib/zinc/zinc-firstboot').read_text()
        for status in (1, 2, 0):  # Failed, degraded, successful cloud-init.
            with self.subTest(status=status), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                for name in ('boot/firmware', 'etc/cloud', 'etc/initramfs-tools', 'var/lib/zinc', 'bin'):
                    (root / name).mkdir(parents=True)
                boot = root / 'boot/firmware'
                (boot / 'config.txt').write_text('auto_initramfs=1\n')
                (boot / 'cmdline.txt').write_text('root=fixture ds=nocloud resize\n')
                for name in ('user-data', 'network-config', 'initramfs8', 'initramfs_2712'):
                    (boot / name).write_text('keep\n')
                (root / 'etc/initramfs-tools/update-initramfs.conf').write_text('update_initramfs=yes\n')
                cloud = root / 'bin/cloud-init'
                cloud.write_text('#!/bin/sh\n[ "$*" = "status --wait" ] || exit 99\nexit ' + str(status) + '\n')
                cloud.chmod(0o755)
                # The unchanged cleanup uses GNU sed -i; adapt only that argument on the Mac.
                sed = root / 'bin/sed'
                sed.write_text('#!/bin/sh\nshift\nexec /usr/bin/sed -i "" "$@"\n' if os.uname().sysname == 'Darwin'
                               else '#!/bin/sh\nexec /usr/bin/sed "$@"\n')
                sed.chmod(0o755)
                script = source
                for path in ('/boot/firmware', '/etc/cloud', '/etc/initramfs-tools', '/var/lib/zinc'):
                    script = script.replace(path, str(root) + path)
                result = subprocess.run(['sh', '-c', script], env=dict(os.environ, PATH=str(root / 'bin') + ':' + os.environ['PATH']),
                                        capture_output=True, text=True)
                done = root / 'var/lib/zinc/firstboot.done'
                disabled = root / 'etc/cloud/cloud-init.disabled'
                self.assertEqual(result.returncode, 0 if status == 0 else 1)
                self.assertEqual(done.exists(), status == 0)
                self.assertEqual(disabled.exists(), status == 0)
                for name in ('user-data', 'network-config', 'initramfs8'):
                    self.assertEqual((boot / name).exists(), status != 0)
                self.assertIn('auto_initramfs=' + ('0' if status == 0 else '1'), (boot / 'config.txt').read_text())


if __name__ == '__main__':
    unittest.main()
