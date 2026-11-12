import ast, json, os, pathlib, re, shlex, shutil, subprocess, sys, tempfile
root = pathlib.Path.cwd()
zinc = str(pathlib.Path(sys.argv[1]).resolve())
build = pathlib.Path(zinc).parent
with tempfile.TemporaryDirectory(prefix='zinc-opus-') as temp:
    tmp = pathlib.Path(temp)
    # Execute only the inert package helper, as if WebRTC had shipped its prebuilt without sources.
    tree = ast.parse((root / 'tools/package').read_text())
    helper = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'copy_audio_codec_sources')
    scope = dict(os=os, shutil=shutil, REPO=str(root))
    exec(compile(ast.Module(body=[helper], type_ignores=[]), 'tools/package', 'exec'), scope)
    scope['copy_audio_codec_sources'](str(tmp))
    shutil.copytree(root / 'plugins/audio', tmp / 'plugins/audio', ignore=shutil.ignore_patterns('prebuilt'))
    manifest = json.loads((tmp / 'plugins/audio/plugin.json').read_text())
    for settings in manifest['targets'].values():
        for source in settings['sources']:
            assert (tmp / 'plugins/audio' / source).is_file(), source
    (tmp / 'zinc.json').write_text(json.dumps(dict(name='opus-test', plugins={'audio': {'opus': True}}, pluginCompiler='system')))
    env = dict(os.environ, ZINC_ROOT=str(root), ZINC_HEADLESS='1', ZINC_PLUGIN_CC='system', ZINC_PREBUILT='0')
    result = subprocess.run([zinc, 'plugin-build', 'audio', str(tmp), '--prebuild'], env=env, capture_output=True, text=True)
    if result.returncode:
        raise SystemExit(result.stdout + result.stderr)
    prebuilt = pathlib.Path(next(line[10:] for line in result.stdout.splitlines() if line.startswith('prebuilt: ')))
    subprocess.run([zinc, 'native-gen', 'plugins/audio/native/audio.spec.ts', str(tmp)], check=True, stdout=subprocess.DEVNULL)
    args = shlex.split((build / 'CMakeFiles/native_plugins_test.dir/link.txt').read_text())
    links = args[args.index('libzn_native.a'):]
    seen = set()
    links = [x for x in links if not x.endswith('.a') or x not in seen and not seen.add(x)]
    links = [str(build / x) if x.endswith(('.a', '.dylib')) and not x.startswith('/') else x for x in links]
    frameworks = ['-framework', 'AudioToolbox', '-framework', 'CoreFoundation'] if sys.platform == 'darwin' else ['-ldl', '-lm', '-pthread']
    # Existing archives only: opt in without compiling WebRTC or opening a connection.
    rtc = os.environ.get('AUDIO_OPUS_WEBRTC_ARCHIVE')
    rtc_vendor = os.environ.get('AUDIO_OPUS_WEBRTC_VENDOR')
    assert bool(rtc) == bool(rtc_vendor), 'set both WebRTC archive paths'
    nm = ['nm', '-gU'] if sys.platform == 'darwin' else ['nm', '-g', '--defined-only']
    exported = subprocess.check_output([*nm, str(prebuilt / 'vendor.a')], text=True)
    first_opus = next(i for i, source in enumerate(manifest['targets']['macos']['sources']) if source.startswith('../webrtc/vendor/opus/'))
    index, count = -1, 0
    for line in exported.splitlines():
        member = re.search(r'v(\d+)\.o:', line)
        if member:
            index = int(member[1])
        fields = line.split()
        if index >= first_opus and len(fields) == 3:
            symbol = fields[-1][1:] if sys.platform == 'darwin' else fields[-1]
            assert symbol.startswith('zn_audio_'), 'unprefixed Opus symbol: ' + symbol
            count += 1
    assert count >= 425, 'Opus object symbol inspection failed'
    for enabled in (1, 0):
        exe = tmp / ('proof' + str(enabled))
        combined = []
        if rtc and enabled:
            assert pathlib.Path(rtc).is_file() and pathlib.Path(rtc_vendor).is_file()
            combined = ['-DZN_AUDIO_OPUS_WEBRTC_TEST', '-I' + str(pathlib.Path(rtc).parent / 'gen')]
            if sys.platform == 'darwin':
                combined += ['-mmacosx-version-min=15.7.4']
        extra_links = [rtc, rtc_vendor, '-framework', 'VideoToolbox', '-framework', 'CoreMedia', '-framework', 'CoreVideo'] if rtc and enabled and sys.platform == 'darwin' else [rtc, rtc_vendor] if rtc and enabled else []
        subprocess.run(['c++', *combined, '-std=c++20', '-O1', '-fno-exceptions', '-fno-rtti', '-fwrapv', '-DZRT_GROW_DRAW_CMDS',
                        '-DMA_NO_ENCODING', '-DMA_NO_RESOURCE_MANAGER', '-DZP_AUDIO_OPUS=' + str(enabled),
                        '-Iinclude', '-Isrc', '-Iruntime', '-Iruntime/include', '-I' + str(tmp),
                        'tests/native/audio_opus_test.cpp', str(prebuilt / 'vendor.a'), *extra_links, '-o', str(exe), *links, *frameworks], check=True)
        subprocess.run([str(exe), str(root / 'tests/fixtures/audio-opus/tone.opus')], env=env, check=True, timeout=10)
        if not enabled:
            symbols = subprocess.check_output(['nm', str(exe)], text=True)
            assert 'opus_decode' not in symbols and 'op_open_' not in symbols
    (tmp / 'zinc.json').write_text(json.dumps(dict(name='opus-test', plugins={'audio': {'opus': False}}, pluginCompiler='system')))
    result = subprocess.run([zinc, 'plugin-build', 'audio', str(tmp), '--prebuild'], env=env, capture_output=True, text=True)
    if result.returncode:
        raise SystemExit(result.stdout + result.stderr)
    library = prebuilt / ('plugin.dylib' if sys.platform == 'darwin' else 'plugin.so')
    symbols = subprocess.check_output(['nm', str(library)], text=True)
    assert 'opus_decode' not in symbols and 'op_open_' not in symbols
    print('installed source staging and disabled plugin symbol check passed')
