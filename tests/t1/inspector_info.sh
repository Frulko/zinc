#!/bin/sh
# The Info view of the Zinc Inspector (Zinc.getProgramInfo): tests/data/inspector_info (zinc:devtools, a worker, zinc:storage, a zinc.json
# with an app id, a version and permissions) on the interpreter: the card names the program, the engine, the renderer, the plugins, the files
# and functions compiled, the zinc: modules its own files import, the permissions, the worker and the live numbers. Then the engine line on
# the AOT program (zinc run --native: the card crosses the exec through ZINC_PROGRAM_INFO) and on QuickJS (tests/data/inspector: QuickJS has
# no workers; the plugin's C++ transport answers there).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'kill $target 2>/dev/null; rm -rf "$tmp"' EXIT
fail=0
card() {   # card <dir> [run flags...]: the target started on a free port, the inspector's Info dump in $tmp/dump
  dir=$1; shift
  port=$(python3 tests/free_ports.py 1)
  ZINC_HEADLESS=1 ZINC_FRAMES=100000000 ZINC_DEVTOOLS_PORT=$port timeout 90 "$ZINC" run "$dir" "$@" > "$tmp/target.log" 2>&1 & target=$!
  n=0; while [ $n -lt $((800 * ${ZN_WAIT_SCALE:-1})) ] && ! grep -q "zinc devtools:" "$tmp/target.log"; do sleep 0.05; n=$((n+1)); done
  grep -q "localhost:$port)" "$tmp/target.log" || { echo "the target does not listen on $port: $(tail -5 "$tmp/target.log")"; exit 1; }
  ZINC_INSPECTOR_DUMP=info ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 timeout 60 "$ZINC" run app/inspector/main.tsx -- "$port" > "$tmp/dump" 2>&1 ||
    { echo "the inspector failed: $(head -c 600 "$tmp/dump")"; exit 1; }
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
want "^    files: 30 source files, [1-9][0-9]* functions compiled$"   # the program's 26 files and its worker's 4
want "^    assets: [1-9][0-9]* fonts, 0 images baked$"
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
want "^    files: 30 source files, [1-9][0-9]* functions compiled$"
want "^    workers: 1 worker$"
[ $fail -eq $f0 ] || cat "$tmp/dump"

f0=$fail
card tests/data/inspector --engine quickjs
want "^    engine: QuickJS \(JavaScript\)$"
want "^    plugins: devtools \(native\), socket \(Zinc\)$"
want "^    imports: zinc:devtools, zinc:net, zinc:socket, zinc:sys, zinc:ui/solid$"
want "^    permissions: not declared$"
[ $fail -eq $f0 ] || cat "$tmp/dump"
exit $fail
