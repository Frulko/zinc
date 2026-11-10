#!/bin/sh
# The real native HAL drop callback grants one picked path before its subscriber reads it.
# Reuses the complete engine's read-only host/runtime libraries; never builds the engine.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"$ZINC" native-gen plugins/system/native/system.spec.ts "$tmp" >/dev/null
python3 - "$ZINC" "$tmp" <<'PY'
import pathlib,shlex,subprocess,sys
build=pathlib.Path(sys.argv[1]).resolve().parent
tmp=pathlib.Path(sys.argv[2])
manifest=build/'CMakeFiles/native_plugins_test.dir/link.txt'
if not manifest.exists(): raise SystemExit('system_drop_scope requires complete CMake library artifacts beside ZINC')
args=shlex.split(manifest.read_text())
links=args[args.index('libzn_native.a'):]
if sys.platform=='darwin':
    seen=set();links=[x for x in links if not x.endswith('.a') or x not in seen and not seen.add(x)]
links=[str(build/x) if x.endswith(('.a','.dylib')) and not x.startswith('/') else x for x in links]
cmd=['c++','-std=c++20','-O1','-fno-exceptions','-fno-rtti','-fwrapv','-ffp-contract=off','-fno-threadsafe-statics','-DZRT_HEAP_BYTES=536870912u','-DZRT_PLATFORM="macos"','-DZRT_POINT_POOL=262144','-DZRT_GROW_DRAW_CMDS','-Iinclude','-Isrc','-Iruntime','-Iruntime/include','-I'+str(tmp),'-Iplugins/system/native','tests/native/system_drop.cpp','-o',str(tmp/'proof'),*links]
subprocess.run(cmd,check=True)
PY
printf 'chosen\n' > "$tmp/chosen.txt"
printf 'neighbor\n' > "$tmp/neighbor.txt"
ZINC_HEADLESS=1 timeout 10 "$tmp/proof" "$tmp/chosen.txt" "$tmp/neighbor.txt"
