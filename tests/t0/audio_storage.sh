#!/bin/sh
# Production clip storage and mixer: retain every short s16 tail, halve its PCM allocation, preserve other formats.
set -eu
cd "$(dirname "$0")/../.."
command -v c++ >/dev/null || { echo 'skipped: no C++ compiler'; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"$ZINC" native-gen plugins/audio/native/audio.spec.ts "$tmp" >/dev/null
cc -O0 -w -DMA_NO_ENCODING -DMA_NO_RESOURCE_MANAGER -c plugins/audio/vendor/miniaudio_impl.c -o "$tmp/ma.o"
python3 - "$ZINC" "$tmp" <<'PY'
import pathlib,shlex,subprocess,sys
build=pathlib.Path(sys.argv[1]).resolve().parent
tmp=pathlib.Path(sys.argv[2])
manifest=build/'CMakeFiles/native_plugins_test.dir/link.txt'
if not manifest.exists(): raise SystemExit('audio_storage requires complete CMake library artifacts beside ZINC')
args=shlex.split(manifest.read_text())
links=args[args.index('libzn_native.a'):]
if sys.platform=='darwin':
    seen=set();links=[x for x in links if not x.endswith('.a') or x not in seen and not seen.add(x)]
links=[str(build/x) if x.endswith(('.a','.dylib')) and not x.startswith('/') else x for x in links]
frameworks=['-framework','AudioToolbox','-framework','CoreFoundation'] if sys.platform=='darwin' else ['-ldl','-lm','-pthread']
subprocess.run(['c++','-std=c++20','-O1','-fno-exceptions','-fno-rtti','-fwrapv','-DZRT_GROW_DRAW_CMDS','-DMA_NO_ENCODING','-DMA_NO_RESOURCE_MANAGER','-Iinclude','-Isrc','-Iruntime','-Iruntime/include','-I'+str(tmp),'tests/native/audio_storage_test.cpp',str(tmp/'ma.o'),'-o',str(tmp/'proof'),*links,*frameworks],check=True)
PY
ZINC_HEADLESS=1 timeout 10 "$tmp/proof"
