import copy
import base64
import http.client
import json
import os
from pathlib import Path
import runpy
import signal
import subprocess
import tempfile
import threading
import time
import struct
import zlib
from http.server import HTTPServer
from unittest.mock import patch

m = runpy.run_path('tools/figma-live')
subprocess.run(['node', 'tests/data/figma-live/panel.cjs'], check=True)
document = json.loads(subprocess.check_output(['node', 'tests/data/figma-live/plugin.cjs']))
source, images, w, h = m['generate'](document)
assert (w, h) == (320, 200) and any(name.endswith('.svg') for name in images)
checked, _, mapping = m['normalize'](document)
assert checked['screens'][0]['tree']['children'][0]['text'].startswith('Hello {Zinc}')
assert mapping[0]['codeName'] == 'HelloZinc'
assert 'new Scene()' in source and 'HelloZinc' in source
# A tiny real PNG exercises generated asset references in the native compiler as well.
def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>2I5B', 1, 1, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b'\0\xff\0\0\xff')) + chunk(b'IEND', b'')
document['assets']['layer-1.png'] = base64.b64encode(png).decode()
document['assets']['spinner.json'] = base64.b64encode(Path('examples/ui/lottie-gallery/assets/spinner.json').read_bytes()).decode()
document['screens'][0]['tree']['children'].append({'type':'Image', 'asset':'layer-1.png', 'style':{'position':'absolute','left':20,'top':90,'width':40,'height':40}})
document['screens'][0]['tree']['children'].append({'type':'Lottie', 'asset':'spinner.json', 'style':{'position':'absolute','left':240,'top':90,'width':40,'height':40}})
for mutate in [lambda d: d.update(format='other'),
               lambda d: d['screens'][0]['tree'].update(type='script'),
               lambda d: d['screens'][0]['tree']['style'].update(width=float('nan')),
               lambda d: d['screens'][0]['tree']['style'].update(backgroundColor='"};evil()'),
               lambda d: d.update(assets={'../escape.png': 'aaa'}),
               lambda d: d['screens'][0]['tree'].update(children='invalid'),
               lambda d: d['screens'][0]['tree']['children'][0].update(font=['bad']),
               lambda d: d.update(designSystem={'bad': float('nan')})]:
    bad = copy.deepcopy(document); mutate(bad)
    try:
        m['generate'](bad)
        raise AssertionError('Untrusted input accepted')
    except ValueError:
        pass

with tempfile.TemporaryDirectory(prefix='figma-live-test-') as tmp:
    project = Path(tmp) / 'project'
    preview = m['Preview'](project, os.environ['ZINC'], companion=True)
    preview.update(document)
    path = project / 'src/design.tsx'
    original = path.read_text()
    path.write_text('// my edits')
    try:
        edited = copy.deepcopy(document)
        edited['screens'][0]['tree']['children'][0]['text'] = 'A new design'
        preview.update(edited)
        raise AssertionError('Hand edit overwritten')
    except ValueError:
        assert path.read_text() == '// my edits'
    path.write_text(original)
    assert preview.document['fonts'][0]['extraction'] == 'fichier TrueType natif', preview.document['warnings']
    assert json.loads((project / 'design-system.json').read_text())['variables'][0]['name'] == 'Canvas'
    assert preview.document['screens'][0]['tree']['component']['id'] == 'component:card'
    fallback = copy.deepcopy(document)
    fallback['fonts'][0]['family'] = 'Zinc Missing Font Fixture'
    fallback['screens'][0]['tree']['children'][0]['font']['family'] = 'Zinc Missing Font Fixture'
    missing = m['Preview'](Path(tmp) / 'missing-font', os.environ['ZINC'], companion=True)
    missing.update(fallback)
    assert missing.document['fonts'][0]['extraction'] == 'repli natif Inter'
    assert missing.document['screens'][0]['tree']['children'][0]['type'] == 'Text'
    assert any('police absente' in w for w in missing.document['warnings'])
    (project / 'runtime.json').write_text(json.dumps(preview.document))
    runtime = subprocess.run([os.environ['ZINC'], 'run', 'tests/data/figma-live/runtime.ts', '--interp'],
        env=dict(os.environ, ZINC_LIVE_FIXTURE=str(project / 'runtime.json'), ZINC_FRAMES='2'), capture_output=True, text=True, timeout=30)
    assert runtime.returncode == 0, runtime.stdout + runtime.stderr
    exported = subprocess.run([os.environ['ZINC'], 'run', str(project), '--interp'],
        env=dict(os.environ, ZINC_FRAMES='2'), capture_output=True, text=True, timeout=30)
    assert exported.returncode == 0, exported.stdout + exported.stderr
    files = m['project_files'](preview.document, project)
    assert '<View className=' in files['src/generated/design.tsx'].decode()
    assert 'export function FigmaTitle' in files['src/generated/design.tsx'].decode()
    assert 'assets/' in files['design.zui.json'].decode()
    assert str(project).encode() not in b''.join(files.values())
    destination = Path(tmp) / 'Exports'; destination.mkdir()
    saved = m['write_project'](files, destination, preview.document['name'])
    (saved / 'src/connectors.ts').write_text('// application edits')
    second = m['write_project'](files, destination, preview.document['name'])
    assert second != saved and second.name.endswith('-2')
    assert (saved / 'src/connectors.ts').read_text() == '// application edits'
    assert not list(destination.glob('.zinc-export-*'))
    original_runtime = Path('tests/data/figma-live/runtime.ts').read_text()
    verify = original_runtime.replace("import { Scene } from '../../../app/figma-live/scene';", "import { createDesign } from './generated/design';")
    verify = verify.replace('const scene = new Scene(); scene.load(raw);', 'const scene = createDesign();')
    verify = verify.replace('ui.click(icon); check(scene.current', "let captured = '';\nscene.onAction = (key: string): boolean => { captured = key; return true; };\nui.click(icon); check(captured === 'IconArrow.click.0', 'Connector key was not stable');\ncheck(scene.current === '1:1', 'Handled connector did not suppress the prototype');\nscene.onAction = null;\nui.click(icon); check(scene.current")
    (second / 'src/verify.ts').write_text(verify)
    result = subprocess.run([os.environ['ZINC'], 'run', str(second / 'src/verify.ts'), '--interp'],
        env=dict(os.environ, ZINC_LIVE_FIXTURE=str(project / 'runtime.json'), ZINC_FRAMES='2'), capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
    app_run = subprocess.run([os.environ['ZINC'], 'run', str(second), '--interp'],
        env=dict(os.environ, ZINC_FRAMES='2'), capture_output=True, text=True, timeout=30)
    assert app_run.returncode == 0, app_run.stdout + app_run.stderr
    with patch.dict(m['Preview'].start_export.__globals__, choose_folder=lambda cancelled: destination):
        preview.start_export(preview.revision)
        for _ in range(100):
            if preview.export['status'] != 'choosing': break
            time.sleep(.01)
        assert preview.export['status'] == 'done', preview.export
        assert Path(preview.export['path']).is_dir()
    with patch.dict(m['Preview'].start_export.__globals__, choose_folder=lambda cancelled: None):
        preview.start_export(preview.revision)
        for _ in range(100):
            if preview.export['status'] != 'choosing': break
            time.sleep(.01)
        assert preview.export['status'] == 'cancelled'
    preview.child = None
    server = HTTPServer(('127.0.0.1', 0), m['handler'](preview, 'test-token'))
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()

    def request(body, token='test-token', host=None, endpoint='/design'):
        c = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=10)
        c.request('POST', endpoint, json.dumps(body), {'Authorization': 'Bearer '+token, 'Content-Type':'application/json', 'Host':host or 'localhost:' + str(server.server_port)})
        r = c.getresponse(); status, content = r.status, r.read(); c.close()
        return status, content

    assert request(document, token='wrong')[0] == 401
    assert request(document, host='attacker.example')[0] == 403
    assert request({'format':'wrong'})[0] == 400
    assert request({'revision':preview.revision,'path':'/arbitrary/write'}, endpoint='/export')[0] == 400
    assert request({'revision':-1}, endpoint='/export')[0] == 400
    entered, release = threading.Event(), threading.Event()
    def picker(cancelled):
        entered.set(); release.wait(3); return destination
    with patch.dict(m['Preview'].start_export.__globals__, choose_folder=picker):
        assert request({'revision':preview.revision}, endpoint='/export')[0] == 200
        assert entered.wait(1)
        assert request({'live':True}, endpoint='/heartbeat')[0] == 200
        assert request({'revision':preview.revision}, endpoint='/export')[0] == 400
        original_text = preview.document['screens'][0]['tree']['children'][0]['text']
        preview.document['screens'][0]['tree']['children'][0]['text'] = 'Edit during export'
        release.set(); preview.export_thread.join(2)
        assert preview.export['status'] == 'done', preview.export
        frozen = json.loads((Path(preview.export['path']) / 'design.zui.json').read_text())
        assert frozen['screens'][0]['tree']['children'][0]['text'] == original_text
        preview.document['screens'][0]['tree']['children'][0]['text'] = original_text
    assert preview.child is None
    log = Path(tmp) / 'dev.log'
    scenes = Path(tmp) / 'scenes'
    scenes.mkdir()
    real_popen = subprocess.Popen

    def launch(*args, **kwargs):
        if kwargs.get('start_new_session'):
            kwargs['stdout'] = output; kwargs['stderr'] = subprocess.STDOUT
            kwargs['env'] = dict(kwargs['env'], ZINC_SCENE_DUMP=str(scenes / 'frame.bin'), ZINC_SHOT_EVERY='10')
        return real_popen(*args, **kwargs)

    def waitfor(pattern):
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if pattern in log.read_text():
                return
            time.sleep(.05)
        raise AssertionError('Missing ' + pattern + '\n' + log.read_text())

    def waitscene(text):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            files = list(scenes.glob('frame-*.bin'))
            if files:
                latest = max(files, key=lambda p: int(p.stem.split('-')[-1]))
                result = subprocess.run(['python3', 'tools/scene-texts', str(latest)], capture_output=True, text=True)
                if result.returncode == 0 and text in result.stdout:
                    return
            time.sleep(.05)
        raise AssertionError('The rendered frame never displayed ' + repr(text) + '\n' + log.read_text())

    try:
        with log.open('w') as output, patch('subprocess.Popen', side_effect=launch):
            preview.origin = 'http://127.0.0.1:' + str(server.server_port)
            preview.start('test-token')
            assert request(document)[0] == 200
            waitfor('displayed revision')
            waitscene('Hello {Zinc}')
            waitscene('Copier le chemin')
            pid = preview.child.pid
            changed = copy.deepcopy(document)
            changed['screens'][0]['tree']['children'][0]['text'] = 'Updated live'
            assert request(changed)[0] == 200
            waitfor('displayed revision 2')
            waitscene('Updated live')
            assert preview.child.pid == pid and preview.child.poll() is None
            assert preview.applied == preview.revision
            # Same snapshot does not rewrite the module or trigger another compile.
            stamp = (project / 'src/design.tsx').stat().st_mtime_ns
            assert request(changed)[0] == 200
            assert (project / 'src/design.tsx').stat().st_mtime_ns == stamp
    finally:
        preview.close(); server.shutdown(); thread.join(); server.server_close()
    assert preview.child.poll() is not None
print('figma live: plugin pin/pause/edit, validation, pairing, ownership, persistent native start/content refresh and cleanup ok')
