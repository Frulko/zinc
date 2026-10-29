#!/usr/bin/env python3
"""Execute a user-supplied original speedometer component and export its layers."""
import argparse
import hashlib
import importlib.machinery
import json
from pathlib import Path
import shutil
import struct
import subprocess


HERE = Path(__file__).resolve().parent
probe = importlib.machinery.SourceFileLoader('archive_probe', str(HERE.parent/'run')).load_module()


def bundle(archive):
    metadata = {n: list(struct.unpack('>II', archive.read(n)[16:24]))
                for n in archive.namelist() if n.endswith('.png')}
    parts = ['local imageMetadata={' + ','.join(
        '['+json.dumps(n)+']={'+','.join(map(str, size))+'}' for n, size in metadata.items())+'}',
        (HERE/'bridge.luau').read_text()]
    hashes = {}
    for n in archive.namelist():
        if n.endswith('.lua'):
            data = archive.read(n)
            hashes[n] = hashlib.sha256(data).hexdigest()
            # Each original module is byte-for-byte unchanged inside its wrapper.
            parts.append('modules['+json.dumps(n[:-4])+']=function(...)\n'+data.decode()+'\nend')
    parts.append('local main=coroutine.create(function()\n'+(HERE/'driver.luau').read_text()+'''
end)
for i=1,900 do
 local ok,err=coroutine.resume(main)
 assert(ok,err)
 if coroutine.status(main)=="dead" then break end
 advance(1/60)
end
assert(coroutine.status(main)=="dead","Component driver did not finish")
''')
    return '\n'.join(parts), hashes


def walk(layer):
    yield layer
    for child in layer.get('children', []):
        yield from walk(child)
    if 'mask' in layer:
        yield from walk(layer['mask'])


def verify(samples):
    assert [s['speed'] for s in samples] == [0, 65, 130], 'Missing snapshots'
    glyphs = []
    for sample in samples:
        layers = list(walk(sample['scene']))
        progress = next(l for l in layers if l['name'] == 'SpeedometerProgressBar')
        assert abs(progress['strokeEnd']-sample['speed']/160) < 1e-6
        assert any(l['name'] == 'MeasurementLabel:PrimarySpeed' for l in layers)
        assert any('decorative_speedometer.png' in l.get('texture', {}).get('path', '') for l in layers)
        primary = next(l for l in layers if l['name'] == 'MeasurementLabel:PrimarySpeed')
        glyphs.append([l['bounds'] for l in walk(primary) if l.get('maskToBounds')])
    assert glyphs[0] != glyphs[1] != glyphs[2], 'Speed glyph atlas windows did not change'


def main():
    from render_scene import Renderer
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--luau', required=True, type=Path, help='Official Luau 0.692 CLI')
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists():
        parser.error('Choose a new output directory')
    if args.archive.stat().st_size > probe.MAX_TOTAL:
        parser.error('Archive too large')
    rasterizer = shutil.which('rsvg-convert')
    if not rasterizer:
        parser.error('rsvg-convert (librsvg) is required for offline snapshots')
    outer = args.archive.read_bytes()
    nested = probe.checked_zip(outer).read('AssetData/CarPlayAccessory.assets.zip')
    archive = probe.checked_zip(nested)
    source, hashes = bundle(archive)
    args.out.mkdir(parents=True)
    (args.out/'original-component.luau').write_text(source)
    result = subprocess.run([str(args.luau.resolve()), str((args.out/'original-component.luau').resolve())],
                            capture_output=True, text=True, timeout=60)
    (args.out/'execution.log').write_text(result.stdout+result.stderr)
    result.check_returncode()
    samples = [json.loads(line[11:]) for line in result.stdout.splitlines() if line.startswith('SCENE_JSON:')]
    for marker in ('UNSUPPORTED_DATA', 'MISSING_DATA', 'Invalid Gauge Style', 'Unsupported CP call'):
        if marker in result.stdout+result.stderr:
            raise RuntimeError(f'Incomplete component: {marker}; see execution.log')
    verify(samples)
    report = {'provenance': 'Local catalog archive, not an observed iPhone transfer',
              'archiveSha256': hashlib.sha256(outer).hexdigest(),
              'accessorySha256': hashlib.sha256(nested).hexdigest(),
              'moduleSha256': hashes, 'signatureVerified': False,
              'runtime': 'Luau 0.692 (9457397af45f9d69423c5168d23fddd998a5f0fd)',
              'renderer': 'Offline layer export / librsvg snapshots / Zinc image viewer',
              'samples': [], 'approximations': []}
    (args.out/'assets').mkdir()
    for sample in samples:
        speed = sample['speed']; renderer = Renderer(archive)
        (args.out/f'scene-{speed}.json').write_text(json.dumps(sample['scene'], indent=2))
        svg = args.out/f'gauge-{speed}.svg'
        svg.write_text(renderer.render(sample['scene']))
        subprocess.run([rasterizer, str(svg), '-o', str(args.out/'assets'/f'gauge-{speed}.png')], check=True, timeout=30)
        report['samples'].append({'speed': speed, 'layers': len(list(walk(sample['scene']))), 'assets': sorted(renderer.assets)})
        report['approximations'] = sorted(set(report['approximations']) | renderer.approximations)
    (args.out/'report.json').write_text(json.dumps(report, indent=2))
    (args.out/'src').mkdir()
    (args.out/'src/main.tsx').write_text('''import { render } from 'zinc:ui/solid';
function App(): i32 {
  return <View className="flex-col h-full p-6 gap-4 bg-slate-950">
    <Text className="text-2xl text-white">Ultra Local UI · original component</Text>
    <Text className="text-slate-300">Original scripts, glyph atlases and images · simulated 0 / 65 / 130 km/h</Text>
    <View className="flex-row gap-4">
      <Image className="w-96 h-96" src="gauge-0.png" />
      <Image className="w-96 h-96" src="gauge-65.png" />
      <Image className="w-96 h-96" src="gauge-130.png" />
    </View>
    <Text className="text-slate-300">Offline snapshots · gradients and blending still approximate · no live UI Sync</Text>
  </View>;
}
render(App, 0x020617, () => {});
''')
    (args.out/'zinc.json').write_text(json.dumps({'name': 'carplay-original-component', 'entry': 'src/main.tsx',
        'targets': {'macos': {'width': 1260, 'height': 560}}}, indent=2))
    print(f'Original component exported: {args.out}\n3 state updates verified; see report.json for limitations')


if __name__ == '__main__':
    main()
