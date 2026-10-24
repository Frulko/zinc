"""First-boot credentials and cleanup policy, on native temporary files only."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]


class Bootstrap(unittest.TestCase):
    def test_auto_name_boot_configuration(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            profile = json.loads((ROOT / 'image/profile.json').read_text())
            config = root / 'profile.json'
            config.write_text(json.dumps(profile))
            command = ['bash', str(ROOT / 'image/configure-boot.sh'), str(config), tmp]
            subprocess.run(command, check=True, capture_output=True)
            cloud = json.loads((root / 'user-data').read_text().split('\n', 1)[1])
            self.assertEqual(cloud, {'preserve_hostname': True})
            self.assertTrue((root / 'zinc-auto-name').exists())
            profile['hostname'] = 'studio'
            config.write_text(json.dumps(profile))
            subprocess.run(command, check=True, capture_output=True)
            self.assertFalse((root / 'zinc-auto-name').exists())
            self.assertEqual(json.loads((root / 'user-data').read_text().split('\n', 1)[1])['hostname'], 'studio')

    def test_identity_is_per_flash_and_keeps_existing_cards_and_custom_names(self):
        source = (ROOT / 'image/files/usr/lib/zinc/zinc-admin').read_text().split("<<'PY_IDENTITY'\n", 1)[1].split('\nPY_IDENTITY', 1)[0]
        names = []
        for flash in range(2):
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                (root / 'boot/firmware').mkdir(parents=True)
                (root / 'etc').mkdir()
                (root / 'etc/hostname').write_text('old\n')
                (root / 'etc/hosts').write_text('127.0.0.1 localhost\n127.0.1.1 old\n')
                script = source
                for path in ('/boot/firmware', '/etc/zinc', '/etc/hostname', '/etc/hosts'):
                    script = script.replace(path, str(root) + path)
                def boot():
                    with patch('subprocess.run') as hostname:
                        try:
                            exec(compile(script, 'zinc-admin identity', 'exec'), {})
                        except SystemExit as result:
                            self.assertEqual(result.code, 0)
                    return hostname
                saved = root / 'etc/zinc/device-name'
                boot().assert_not_called()  # Updating an existing card changes no identity.
                self.assertFalse(saved.exists())
                marker = root / 'boot/firmware/zinc-auto-name'
                marker.touch()
                boot()
                name = saved.read_text().strip()
                names.append(name)
                self.assertRegex(name, r'^[a-f0-9]{4}-[a-f0-9]{6}-[a-f0-9]{5}$')
                self.assertEqual((root / 'etc/hostname').read_text().strip(), name)
                boot().assert_called_once_with(['/bin/hostname', name], check=True)
                self.assertEqual(saved.read_text().strip(), name)
                self.assertEqual((root / 'etc/hosts').read_text().count('127.0.1.1'), 1)
                saved.unlink()
                marker.touch()
                (root / 'boot/firmware/user-data').write_text('#cloud-config\nhostname: custom-imager\n')
                import types
                with patch.dict('sys.modules', {'yaml': types.SimpleNamespace(safe_load=lambda text: {'hostname': 'custom-imager'})}):
                    boot().assert_called_once_with(['/bin/hostname', 'custom-imager'], check=True)
                self.assertEqual(saved.read_text().strip(), 'custom-imager')
                self.assertFalse(marker.exists())
        self.assertNotEqual(names[0], names[1])

    def test_generated_credentials(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            profile = directory / 'profile.json'
            cases = [('spark', 'test-password', []), ('spark', '', ['ssh-ed25519 fixture']), ('', '', [])]
            for name, password, keys in cases:
                profile.write_text(json.dumps(dict(hostname='fixture', timezone='', keyboard='',
                                                  name='fixture', ssh=bool(name), agent=False, debug=False, wifi=dict(ssid='', password='', country=''),
                                                  user=dict(name=name, password=password, sshKeys=keys))))
                subprocess.run(['bash', str(ROOT / 'image/configure-boot.sh'), str(profile), tmp], check=True, capture_output=True)
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

    def test_keyboard_is_a_file_not_the_cloud_init_module(self):
        # cc_keyboard restarts console-setup, masked in the image: the config stage failed and the first boot never ended
        with tempfile.TemporaryDirectory() as tmp:
            profile = Path(tmp) / 'profile.json'
            base = dict(hostname='fixture', timezone='', name='fixture', ssh=False, agent=False, debug=False,
                        wifi=dict(ssid='', password='', country=''), user=dict(name='', password='', sshKeys=[]))
            profile.write_text(json.dumps(dict(base, keyboard='fr')))
            subprocess.run(['bash', str(ROOT / 'image/configure-boot.sh'), str(profile), tmp], check=True, capture_output=True)
            config = json.loads((Path(tmp) / 'user-data').read_text().split('\n', 1)[1])
            self.assertNotIn('keyboard', config)
            self.assertEqual(config['write_files'][0]['path'], '/etc/default/keyboard')
            self.assertIn('XKBLAYOUT="fr"\n', config['write_files'][0]['content'])
            profile.write_text(json.dumps(dict(base, keyboard='fr"; reboot')))
            self.assertNotEqual(subprocess.run(['bash', str(ROOT / 'image/configure-boot.sh'), str(profile), tmp],
                                               capture_output=True).returncode, 0)

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
