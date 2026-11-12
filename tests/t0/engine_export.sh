#!/bin/sh
# JavaScript exports reach SBOM/signing, retain permissions and keep the signed bundle sealed.
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || exit 77
[ -f "$(dirname "$ZINC")/libzn_engine_jsc.dylib" ] || exit 77
exec python3 - "$ZINC" <<'PY'
import json, os, pathlib, shutil, subprocess, sys, tempfile
zinc = str(pathlib.Path(sys.argv[1]).resolve())
with tempfile.TemporaryDirectory(prefix='zinc-engine-export-') as tmp:
    root = pathlib.Path(tmp)
    home = root / 'home'; home.mkdir()
    tools = pathlib.Path(os.environ.get('ZINC_HOME', str(pathlib.Path.home() / '.zinc'))) / 'toolchains'
    (home / 'toolchains').symlink_to(tools, target_is_directory=True)
    env = dict(os.environ, ZINC_HOME=str(home), ZINC_HEADLESS='1', ZINC_NO_UPDATE_CHECK='1', ZINC_STEPS='0', ZINC_INDEX_URL='file:///nonexistent')
    def run(*args, ok=True):
        p = subprocess.run(args, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=25)
        assert (p.returncode == 0) == ok, (args, p.returncode, p.stdout)
        return p.stdout
    project = root / 'project'; project.mkdir()
    manifest = dict(name='engine-export', entry='main.js', engine='jsc', permissions=[], assets='payload', app=dict(id='dev.zinc.test.engineexport', name='Engine Export', version='1.0.0'))
    (project / 'payload').mkdir(); (project / 'payload/hello.txt').write_text('asset-data')
    (project / 'zinc.json').write_text(json.dumps(manifest))
    (project / 'main.js').write_text("import { readText } from 'zinc:fs'; import { readText as asset } from 'zinc:assets'; try { readText('/etc/hosts'); console.log('UNRESTRICTED'); } catch (e) { console.log(e.message); }\nconsole.log('exported', __ZINC_ENGINE__, asset('hello.txt'));\n")
    key = dict(line.split('=', 1) for line in run(zinc, 'update-keygen').splitlines() if '=' in line)
    out = root / 'export'
    run(zinc, 'export', str(project), '--target', 'macos', '-o', str(out), '--key', key['seed'])
    app = out / 'engine-export.app'
    run('codesign', '--verify', '--deep', '--strict', str(app))
    assert (app / 'Contents/Resources/libzn_text_module.LICENSE').is_file()
    assert not (app / 'Contents/MacOS/libzn_text_module.LICENSE').exists()
    run(zinc, 'verify', str(root / 'engine-export-1.0.0.zip'), '--key', key['public'])
    sbom = json.loads((out / 'sbom.spdx.json').read_text())
    assert any(p['SPDXID'] == 'SPDXRef-Engine-jsc' for p in sbom['packages'])
    assert 'Node-API' in (out / 'THIRD-PARTY-LICENSES.txt').read_text()
    saved = json.loads((app / 'Contents/Resources/zinc.json').read_text())
    assert saved['permissions'] == [] and saved['entry'] == 'app/app.js' and saved['assets'] == 'assets'
    shutil.rmtree(project)
    result = run(str(out / 'run.sh'))
    assert 'EACCES' in result and 'exported jsc asset-data' in result and 'UNRESTRICTED' not in result, result
    manifest.pop('assets')
    if (pathlib.Path(zinc).parent / 'libzn_engine_hermes.dylib').is_file():
        project.mkdir(); manifest['engine'] = 'hermes'
        (project / 'zinc.json').write_text(json.dumps(manifest))
        (project / 'main.js').write_text("// zinc-bundle-entry: retained-source\nconsole.log('SAFE_SOURCE');\n")
        malicious = root / 'malicious.js'; malicious.write_text("console.log('UNTRUSTED_HBC');\n")
        run(zinc, 'build', str(malicious), '--engine', 'hermes', '-o', str(root / 'compiled'))
        assert (root / 'compiled.hbc').is_file()
        assert 'UNTRUSTED_HBC' in run(zinc, 'run', str(root / 'compiled.hbc'))
        assert 'unknown engine' in run(zinc, 'build', str(malicious), '--engine', 'unknown', ok=False)
        assert '--engine needs' in run(zinc, 'build', str(malicious), '--engine', ok=False)
        assert 'one --engine' in run(zinc, 'build', str(malicious), '--engine', 'hermes', '--engine', 'jsc', ok=False)
        assert 'runs on this machine' in run(zinc, 'build', str(malicious), '--engine', 'hermes', '--target', 'aarch64-linux', ok=False)
        manifest['engine'] = 'jsc'; (project / 'zinc.json').write_text(json.dumps(manifest))
        run(zinc, 'build', '--engine', 'hermes', str(project), '-o', str(root / 'override'))
        assert 'SAFE_SOURCE' in run(zinc, 'run', str(root / 'override.hbc'))
        manifest['engine'] = 'hermes'; (project / 'zinc.json').write_text(json.dumps(manifest))
        shutil.copy(root / 'compiled.hbc', project / 'main.hbc')
        run(zinc, 'pack', str(project), '-o', str(root / 'source.zapp'))
        result = run(zinc, 'run', str(root / 'source.zapp'))
        assert 'SAFE_SOURCE' in result and 'UNTRUSTED_HBC' not in result, result
        shutil.rmtree(project)
    # Export must not silently ship an SDK module, including an explicit development override.
    project.mkdir(); manifest['engine'] = 'hermes'
    (project / 'zinc.json').write_text(json.dumps(manifest)); (project / 'main.js').write_text('console.log(1);')
    env['ZINC_ENGINE_HERMES'] = str(pathlib.Path(zinc).parent / 'libzn_engine_hermes.dylib')
    assert 'portable hermes app needs an engine pack' in run(zinc, 'export', str(project), '-o', str(root / 'refused'), ok=False)
PY
