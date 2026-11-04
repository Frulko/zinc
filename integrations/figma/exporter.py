"""Standalone TSX export; snapshot assets before opening the destination picker."""
import copy
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]


def js(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False)


def project_files(document, directory, application=None):
    doc = copy.deepcopy(document)
    files, nodes, mapping, actions = {}, [], [], []
    assets = (directory / 'assets').resolve()

    def asset(path):
        path = Path(path)
        if not path.is_absolute(): path = directory / path
        if path.is_symlink() or path.resolve().parent != assets:
            raise ValueError('Asset outside the live project')
        name = 'assets/' + path.name
        files[name] = path.read_bytes()
        return name

    def walk(n, path=''):
        nodes.append(n)
        path += '/' + n['name']
        mapping.append({k:n[k] for k in ['id','name','codeName']})
        mapping[-1]['path'] = path
        mapping[-1]['exportName'] = 'Figma' + n['codeName']
        if n.get('assetPath'): n['assetPath'] = asset(n['assetPath'])
        for i, a in enumerate(n['interactions']):
            a.setdefault('key', n['codeName'] + '.' + a['trigger'] + '.' + str(i))
            actions.append({'key':a['key'],'nodeId':n['id'],'name':n['name'],'trigger':a['trigger'],'action':a['action'],'target':a['target']})
        for child in n['children']: walk(child, path)
    for screen in doc['screens']: walk(screen['tree'])
    for font in doc['fonts']:
        if font.get('path'): font['path'] = Path(asset(font['path'])).name
        if font.get('licensePath'): font['licensePath'] = asset(font['licensePath'])
    fonts = {(f['family'], f['style']): f['name'] for f in doc['fonts'] if f.get('path')}
    declarations = []
    for n in nodes:
        name = 'Figma' + n['codeName']
        declarations.append('export function ' + name + '(p: LayerProps): i32 {\n  const n = p.layer;')
        if n['type'] in {'Image', 'Svg', 'Lottie'} or n.get('native'):
            declarations.append('  return p.scene.native(n, p.path);\n}')
            continue
        classes = n['classes']
        f = n.get('font', {})
        face = fonts.get((f.get('family'), f.get('style')))
        if face: classes += ' font-[' + face + ']'
        if any(a['trigger'] == 'click' for a in n['interactions']): classes += ' cursor-pointer'
        tag = n['type']
        if n['children']: declarations.append('  const path = p.path + "/" + n.name;')
        declarations.append('  const h = <' + tag + ' className={' + js(classes) + '}>')
        if tag == 'Text': declarations.append('    {' + js(n['text']) + '}')
        for i, c in enumerate(n['children']):
            declarations.append('    <Figma' + c['codeName'] + ' scene={p.scene} layer={n.children[' + str(i) + ']} path={path} />')
        declarations.append('  </' + tag + '>;')
        # JSX hoists literal style sheets; large documents exceed the VM register limit.
        aliases = {'flexGrow':'grow','flexShrink':'shrink','flexBasis':'basis'}
        declarations.extend('  ui.setNumber(h, '+js(aliases.get(p['key'],p['key']))+', '+js(p['value'])+');' for p in n['numbers'])
        declarations.append('  return p.scene.bind(h, n, p.path);\n}')
    dispatch = '\n'.join('  if (layer.id === ' + js(n['id']) + ') return Figma' + n['codeName'] + '({scene, layer, path});' for n in nodes)
    source = ("// Generated visual components. Exporting again creates a new folder.\n"
              "import * as ui from 'zinc:ui';\nimport { Scene } from './scene';\nimport { Layer, Action } from './model';\n"
              "import { onCleanup } from 'zinc:ui/solid';\nimport { designDocument } from './document';\n"
              "import { onAction, onBinding } from '../connectors';\nimport { BindingEvent } from './native';\n"
              "type LayerProps = { scene: Scene; layer: Layer; path: string };\n\n" + '\n'.join(declarations) +
              '\n\nfunction renderLayer(scene: Scene, layer: Layer, path: string): i32 {\n' + dispatch + '\n  return -1;\n}\n'
              'export function createDesign(handler: ((key: string, action: Action) => boolean) | null = null, bindings: ((event: BindingEvent) => boolean) | null = null): Scene {\n'
              '  const scene = new Scene();\n  scene.onAction = handler;\n  scene.onBinding = bindings;\n'
              '  scene.renderer = (layer: Layer, path: string): i32 => renderLayer(scene, layer, path);\n'
              '  scene.load(designDocument);\n  return scene;\n}\n'
              'export function Design(): i32 {\n  const scene = createDesign(onAction, onBinding);\n'
              '  onCleanup(() => scene.close());\n  return scene.root;\n}\n')
    first = next(s for s in doc['screens'] if s['id'] == doc['initial'])
    def put(name, data): files[name] = data.encode()
    put('src/generated/design.tsx', source)
    put('src/generated/document.ts', 'export const designDocument = JSON.parse(' + js(js(doc)) + ');\n')
    for runtime in ['scene.ts','model.ts','native.ts']: files['src/generated/' + runtime] = (ROOT / 'app/figma-live' / runtime).read_bytes()
    put('src/main.tsx', "import { render } from 'zinc:ui/solid';\nimport { Design } from './generated/design';\nrender(() => <Design />, 0xffffff, null);\n")
    example = actions[0]['key'] if actions else 'Button.click.0'
    put('src/connectors.ts', "import { Action } from './generated/model';\nimport { BindingEvent } from './generated/native';\n\n"
        '// Return true when your application handled the action; false keeps the Figma prototype behavior.\n'
        '// Action keys and their Figma layers are listed in actions.json.\n'
        'export function onAction(key: string, action: Action): boolean {\n'
        '  // Example key: ' + js(example) + '\n  return false;\n}\n\n'
        'export function onBinding(event: BindingEvent): boolean {\n  // Slider/Switch events carry event.value; action outlets carry event.key.\n  return false;\n}\n')
    for name, data in [('design.zui.json',doc),('design-system.json',doc['designSystem']),('design-map.json',mapping),('fonts.json',doc['fonts']),('actions.json',actions),
                       ('zinc.json',{'name':doc['name'],'entry':'src/main.tsx','permissions':['fs'],'ui':{'layout':'rn'},'targets':{'macos':{'width':first['width'],'height':first['height']}}})]:
        put(name, json.dumps(data,ensure_ascii=False,indent=2) + '\n')
    put('README.md', '# ' + doc['name'] + '\n\n'
        'Run with a Zinc version that includes `ui.registerFont`:\n\n```sh\nzinc run . --interp\n```\n\n'
        'The project runs without Figma or the live bridge. All referenced media and font files are in `assets/`.\n'
        'Edit visual components in `src/generated/design.tsx`, application logic in `src/connectors.ts`, and startup in `src/main.tsx`.\n'
        '`actions.json` maps connector keys to Figma layers. Return true from a connector to replace prototype behavior, false to keep it.\n'
        'The JSON document retains screen sizes, bindings, prototype actions and motion data used by the native runtime.\n'
        'Instances currently have separate named components; shared Figma definitions and overrides remain in `design-system.json` and the document.\n'
        'Every export creates a new directory and preserves previous exports. Re-export does not merge manual edits.\n'
        'Only assets referenced by this snapshot are copied. Check font and media licenses before redistribution.\n')
    if application is not None:
        manifest = (application if application.is_dir() else application.parent) / 'zinc.json'
        if manifest.is_file():
            export_spec = manifest.parent / 'figma-export.json'
            spec = json.loads(export_spec.read_text()) if export_spec.is_file() else None
            if spec:
                base = (manifest.parent / spec.get('root','.')).resolve()
                if base not in {manifest.parent.resolve(),manifest.parent.parent.resolve()}: raise ValueError('Export source root must belong to the selected app')
                app_manifest = base / 'zinc.json'
                app_config = json.loads(app_manifest.read_text()) if app_manifest.is_file() else json.loads(manifest.read_text())
                config = json.loads(files['zinc.json'])
                for key in ['name','app','permissions']:
                    if key in app_config: config[key] = app_config[key]
                put('zinc.json',json.dumps(config,ensure_ascii=False,indent=2)+'\n')
                sources = spec.get('sources',[]) + [spec['entry']]
                for relative in sources:
                    if Path(relative).is_absolute() or '..' in Path(relative).parts: raise ValueError('Invalid application export path')
                    path = (base / relative).resolve()
                    if not path.is_relative_to(base) or path.suffix not in {'.ts','.tsx'} or path.stat().st_size > 512*1024: raise ValueError('Invalid application export source')
                    code = path.read_text()
                    for old,new in spec.get('imports',{}).items():
                        code=code.replace("'"+old+"'","'"+new+"'").replace('"'+old+'"','"'+new+'"')
                    put('src/main.tsx' if relative==spec['entry'] else 'src/'+relative,code)
                for relative in spec.get('credits',[]):
                    if Path(relative).is_absolute() or '..' in Path(relative).parts: raise ValueError('Invalid credits path')
                    path=(base/relative).resolve()
                    if not path.is_relative_to(base) or path.suffix not in {'.txt','.md'} or path.stat().st_size>65536: raise ValueError('Invalid credits file')
                    files['assets/'+path.name]=path.read_bytes()
                put('README.md',files['README.md'].decode()+'\nThis export includes the selected app’s TypeScript controller and client modules. Credentials are entered at runtime, never embedded.\n')
    return files


def write_project(files, parent, name):
    parent = Path(parent).expanduser().resolve(strict=True)
    if not parent.is_dir(): raise ValueError('Choose an existing destination folder')
    stem = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')[:64] or 'zinc-design'
    stage = Path(tempfile.mkdtemp(prefix='.zinc-export-', dir=parent))
    try:
        for relative, data in files.items():
            path = stage / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        target = parent / stem
        suffix = 2
        while True:
            try:
                target.mkdir()
                break
            except FileExistsError:
                target = parent / (stem + '-' + str(suffix)); suffix += 1
        try:
            # Replace only the empty directory we reserved, never a pre-existing export.
            stage.rename(target)
        except OSError:
            target.rmdir()
            raise
        return target
    finally:
        if stage.exists(): shutil.rmtree(stage)


def choose_folder(cancelled):
    with subprocess.Popen(['osascript','-e','POSIX path of (choose folder with prompt "Exporter le projet Zinc dans…")'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) as picker:
        while True:
            try:
                output, error = picker.communicate(timeout=.2)
                break
            except subprocess.TimeoutExpired:
                if cancelled.is_set():
                    picker.terminate()
                    try: picker.communicate(timeout=1)
                    except subprocess.TimeoutExpired: picker.kill(); picker.communicate()
                    return None
        if picker.returncode:
            if '(-128)' in error: return None
            raise OSError(error.strip() or 'The folder picker could not open')
        return Path(output.strip())
