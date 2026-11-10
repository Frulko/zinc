import configparser
import hashlib
import os
from pathlib import Path
import platform
import plistlib
import runpy
import shutil
import subprocess
import tarfile
import tempfile
import xml.etree.ElementTree as ET


def run(*args, **kw):
    return subprocess.run(args, check=True, text=True, capture_output=True, timeout=15, **kw)


package = runpy.run_path('tools/package')
plist = plistlib.loads((package['PLIST'] % ('1.0', '1.0')).encode())
ut = plist['UTExportedTypeDeclarations'][0]
assert ut['UTTypeIdentifier'] == 'dev.zinc.zapp'
assert ut['UTTypeConformsTo'] == ['public.data']
assert ut['UTTypeTagSpecification'] == {
    'public.filename-extension': ['zapp'], 'public.mime-type': 'application/x-zinc-app'}
doc = plist['CFBundleDocumentTypes'][0]
assert doc['LSItemContentTypes'] == ['dev.zinc.zapp']
assert (doc['CFBundleTypeRole'], doc['LSHandlerRank']) == ('Viewer', 'Owner')

with tempfile.TemporaryDirectory() as temp:
    t = Path(temp)
    share = t / 'release/zinc-test/share'
    package['desktop_linux'](str(share))
    xml = share / 'mime/packages/zinc-zapp.xml'
    root = ET.parse(xml).getroot()
    ns = '{http://www.freedesktop.org/standards/shared-mime-info}'
    mime = root.find(ns + 'mime-type')
    assert mime.attrib['type'] == 'application/x-zinc-app'
    assert mime.find(ns + 'glob').attrib['pattern'] == '*.zapp'
    desktop = share / 'applications/zinc-zapp.desktop'
    entry = configparser.ConfigParser(interpolation=None)
    entry.read(desktop)
    assert entry['Desktop Entry']['Exec'] == 'zinc run %f'
    assert entry['Desktop Entry']['MimeType'] == 'application/x-zinc-app;'
    for program, arg in [('xmllint', str(xml)), ('desktop-file-validate', str(desktop))]:
        if shutil.which(program):
            run(program, *(['--noout'] if program == 'xmllint' else []), arg)
    if shutil.which('update-mime-database'):
        run('update-mime-database', str(share / 'mime'))
        assert 'application/x-zinc-app:*.zapp' in (share / 'mime/globs').read_text()

    # Exercise the actual installer without --atelier or the network, including Exec escaping.
    binary = share.parent / 'bin/zinc'
    binary.parent.mkdir()
    binary.write_text('#!/bin/sh\necho zinc 1.0\n')
    binary.chmod(0o755)
    fake = t / 'fake'
    fake.mkdir()
    (fake / 'uname').write_text('#!/bin/sh\ncase "$1" in -s) echo Linux;; *) echo x86_64;; esac\n')
    (fake / 'uname').chmod(0o755)
    release = t / 'release'
    archive = release / 'zinc-test-linux-x86_64.tar.gz'
    with tarfile.open(archive, 'w:gz') as tar:
        tar.add(share.parent, arcname='zinc-test')
    (release / 'SHA256SUMS').write_text(hashlib.sha256(archive.read_bytes()).hexdigest() + '  ' + archive.name + '\n')
    installed = t / 'install space " $ ` % \\ &' / 'engine'
    env = dict(os.environ, PATH=str(fake) + ':' + os.environ['PATH'], HOME=str(t / 'home'),
               ZINC_INSTALL_URL=release.as_uri(), ZINC_INSTALL_DIR=str(installed),
               ZINC_BIN_DIR=str(t / 'bin'), ZINC_NO_MODIFY_PATH='1', XDG_DATA_HOME=str(t / 'xdg'))
    run('sh', 'tools/install.sh', env=env)
    result = (t / 'xdg/applications/zinc-zapp.desktop').read_text()
    line = next(x for x in result.splitlines() if x.startswith('Exec='))
    value = str(installed.resolve() / 'bin/zinc').replace('\\', '\\\\\\\\')
    for char in ('"', '$', '`'):
        value = value.replace(char, '\\\\' + char)
    assert line == 'Exec="' + value.replace('%', '%%') + '" run %f', line
    assert (t / 'xdg/mime/packages/zinc-zapp.xml').read_bytes() == xml.read_bytes()
    assert not (t / 'xdg/applications/zinc-atelier.desktop').exists()
    if shutil.which('desktop-file-validate'):
        run('desktop-file-validate', str(t / 'xdg/applications/zinc-zapp.desktop'))

    # The current installer also accepts releases made before desktop metadata shipped.
    shutil.rmtree(share / 'mime')
    shutil.rmtree(share / 'applications')
    atelier = binary.parent / 'zinc-atelier'
    atelier.write_text('#!/bin/sh\nexit 0\n')
    atelier.chmod(0o755)
    with tarfile.open(archive, 'w:gz') as tar:
        tar.add(share.parent, arcname='zinc-test')
    (release / 'SHA256SUMS').write_text(hashlib.sha256(archive.read_bytes()).hexdigest() + '  ' + archive.name + '\n')
    old_env = dict(env, ZINC_INSTALL_DIR=str(t / 'old-release'), XDG_DATA_HOME=str(t / 'old-xdg'))
    run('sh', 'tools/install.sh', '--atelier', env=old_env)
    assert (t / 'old-xdg/applications/zinc-atelier.desktop').exists()
    assert not (t / 'old-xdg/applications/zinc-zapp.desktop').exists()

    # The AppImage entry must forward the supplied archive and preserve an ordinary launch.
    appimage = Path('tools/appimage').read_text()
    app_run = appimage.split("<<'RUN'\n", 1)[1].split('\nRUN', 1)[0]
    assert 'Exec=AppRun %f\n' in appimage and 'MimeType=application/x-zinc-app;' in appimage
    app = t / 'app'
    (app / 'usr/bin').mkdir(parents=True)
    (app / 'usr/bin/zinc').write_text('#!/bin/sh\nprintf "%s\\n" "$@"\n')
    (app / 'usr/bin/zinc').chmod(0o755)
    (app / 'AppRun').write_text(app_run)
    path = str(t / 'space $(touch never) " apostrophe\'.zapp')
    assert run('sh', str(app / 'AppRun'), path).stdout.splitlines() == ['run', path]
    assert not (t / 'never').exists()

    if platform.system() == 'Darwin':
        bundle = t / 'Probe.app/Contents'
        macos = bundle / 'MacOS'
        macos.mkdir(parents=True)
        package['build_macos_launcher'](str(macos / 'zinc-atelier'))
        run('xcrun', 'clang', '-fobjc-arc', '-Wall', '-Wextra',
            'tests/data/zapp-desktop/state.m', '-framework', 'AppKit', '-o', str(t / 'state'))
        run(str(t / 'state'))
        (bundle / 'Info.plist').write_bytes(plistlib.dumps(plist))
        (macos / 'zinc').write_text('#!/bin/sh\nprintf "%s\\n" "$@"\nexit 17\n')
        (macos / 'zinc').chmod(0o755)
        direct = subprocess.run([str(macos / 'zinc-atelier'), path], text=True, capture_output=True, timeout=5)
        assert direct.returncode == 17 and direct.stdout.splitlines() == ['run', path]
        project = t / 'project'
        project.mkdir()
        (project / 'hello.ts').write_text('preserve me\n')
        headless = subprocess.run([str(macos / 'zinc-atelier')], text=True, capture_output=True, timeout=5,
                                  env=dict(os.environ, ZINC_HEADLESS='1', ZINC_PROJECT=str(project)))
        assert headless.returncode == 17
        assert headless.stdout.splitlines()[-2:] == ['--', str(project)]
        assert (project / 'hello.ts').read_text() == 'preserve me\n'
print('desktop metadata, install, AppImage argv and native direct launch: PASS')
