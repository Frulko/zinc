#!/bin/sh
# The Info view of the Zinc Inspector (Zinc.getProgramInfo): tests/data/inspector_info (zinc:devtools, a worker, zinc:storage, a zinc.json
# with an app id, a version and permissions) on the interpreter: the card names the program, the engine, the renderer, the plugins, the files
# and functions compiled, the assets on disk and in packs, the zinc: modules its own files import, the permissions, the worker and the live
# numbers. Then the engine line on the AOT program (zinc run --native: the card crosses the exec through ZINC_PROGRAM_INFO), the files of
# its .zapp (program.info), of a zinc build executable (baked in) with an asset added while it runs, and on QuickJS and JavaScriptCore (tests/data/inspector: no workers; the plugin's C++ transport answers there)
# their JavaScript heap. The display's refresh rate needs a window: not checked headless.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'kill $target 2>/dev/null; rm -rf "$tmp"' EXIT
fail=0
start() {   # start <command...>: the target started on a free port
  port=$(python3 tests/free_ports.py 1)
  ZINC_HEADLESS=1 ZINC_FRAMES=100000000 ZINC_DEVTOOLS_PORT=$port timeout 90 "$@" > "$tmp/target.log" 2>&1 & target=$!
  n=0; while [ $n -lt $((800 * ${ZN_WAIT_SCALE:-1})) ] && ! grep -q "zinc devtools:" "$tmp/target.log"; do sleep 0.05; n=$((n+1)); done
  grep -q "localhost:$port)" "$tmp/target.log" || { echo "the target does not listen on $port: $(tail -5 "$tmp/target.log")"; exit 1; }
}
dump() {   # the inspector's Info dump of the target in $tmp/dump
  ZINC_INSPECTOR_DUMP=info ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 timeout 60 "$ZINC" run app/inspector/main.tsx -- "$port" > "$tmp/dump" 2>&1 ||
    { echo "the inspector failed: $(head -c 600 "$tmp/dump")"; exit 1; }
}
card() {   # card <dir> [run flags...]: zinc run, one dump, stopped
  dir=$1; shift
  start "$ZINC" run "$dir" "$@"; dump
  kill $target 2>/dev/null; wait $target 2>/dev/null
}
want() { grep -qE -- "$1" "$tmp/dump" || { echo "missing in the Info view: $1"; fail=1; }; }

card tests/data/inspector_info
want "^    name: inspector-info$"
want "^    id: dev.zinc.tests.inspectorinfo$"
want "^    version: 1.2.3$"
want "^    entry: /.*/tests/data/inspector_info/src/main.tsx$"
want "^    run: zinc run \(not a dev run\)$"
want "^    pid: [1-9][0-9]*$"
want "^    on: this machine$"
want "^    engine: interpreter \(ZBC bytecode\)$"
want "^    renderer: CPU raster, headless \(no window\)$"
want "^    window: 320 x 240 \(320 x 240 pixels\)$"
want "^    plugins: devtools \(Zinc\), socket \(Zinc\)$"
want "^    files: [1-9][0-9]* source files, [1-9][0-9]* functions compiled$"   # the program's 29 files (zinc:devtools brings its stage view and zinc:hardware) and its worker's 4
want "^    assets: [1-9][0-9]* fonts, 0 images baked; 1 files on disk \(/.*/tests/data/inspector_info/assets\); no pack$"
want "^    imports: zinc:devtools, zinc:storage, zinc:ui/solid, zinc:worker$"
want "^    permissions: fs, net$"
want "^    workers: 1 worker$"
want "^    running: zinc worker work.ts#1: running, .*messages [1-9][0-9]* in"
want "^    frame rate: [1-9][0-9.]* fps"
want "^    phases: app .*, present "
want "^    memory: [0-9.]+ MB resident, [1-9][0-9]* live blocks$"
[ $fail -eq 0 ] || cat "$tmp/dump"

f0=$fail
card tests/data/inspector_info --native
want "^    engine: AOT \(compiled to native code\)$"
want "^    files: [1-9][0-9]* source files, [1-9][0-9]* functions compiled$"
want "^    workers: 1 worker$"
[ $fail -eq $f0 ] || cat "$tmp/dump"

f0=$fail   # an executable of zinc build carries the program info its compile knew; an asset saved while it runs is counted at the next request
ZINC_HOME="$tmp/home" "$ZINC" build tests/data/inspector_info -o "$tmp/info-app" > "$tmp/build.log" 2>&1 || { echo "zinc build failed: $(tail -3 "$tmp/build.log")"; fail=1; }
mkdir -p "$tmp/assets"; echo a > "$tmp/assets/a.txt"
start env ZINC_HOME="$tmp/home" ZINC_ASSETS="$tmp/assets" "$tmp/info-app"; dump
want "^    files: [1-9][0-9]* source files, [1-9][0-9]* functions compiled$"
want "^    imports: zinc:devtools, zinc:storage, zinc:ui/solid, zinc:worker$"
want "^    assets: .* 1 files on disk "
echo b > "$tmp/assets/b.txt"; dump
want "^    assets: .* 2 files on disk "
kill $target 2>/dev/null; wait $target 2>/dev/null
[ $fail -eq $f0 ] || cat "$tmp/dump"

f0=$fail   # a packed program carries what its compile knew of its sources (program.info)
ZINC_HOME="$tmp/home" "$ZINC" pack tests/data/inspector_info -o "$tmp/info.zapp" > /dev/null 2>&1 || { echo "zinc pack failed"; fail=1; }
ZINC_HOME="$tmp/home" card "$tmp/info.zapp"
want "^    files: [1-9][0-9]* source files, [1-9][0-9]* functions compiled$"
want "^    imports: zinc:devtools, zinc:storage, zinc:ui/solid, zinc:worker$"
[ $fail -eq $f0 ] || cat "$tmp/dump"

f0=$fail
card tests/data/inspector --engine quickjs
want "^    engine: QuickJS \(JavaScript\)$"
want "^    plugins: devtools \(native\), socket \(Zinc\)$"
want "^    imports: zinc:devtools, zinc:net, zinc:socket, zinc:sys, zinc:ui/solid$"
want "^    permissions: not declared$"
want "^    memory: [0-9.]+ MB resident, (.*, )?[0-9.]+ [KM]B JavaScript heap$"
[ $fail -eq $f0 ] || cat "$tmp/dump"

f0=$fail   # the JavaScript heap on JavaScriptCore (the system's on macOS; V8 and Hermes need their SDK, tools/v8-pack and tools/hermes-pack)
if [ "$(uname)" = Darwin ] && [ -f "$(dirname "$ZINC")/libzn_engine_jsc.dylib" ]; then
  card tests/data/inspector --engine jsc
  want "^    engine: JavaScriptCore \(JavaScript\)$"
  want "^    memory: [0-9.]+ MB resident, (.*, )?[0-9.]+ [KM]B JavaScript heap$"
  [ $fail -eq $f0 ] || cat "$tmp/dump"
fi
exit $fail
