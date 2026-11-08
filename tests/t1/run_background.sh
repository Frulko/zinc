#!/bin/sh
# zinc run builds the native program in the background (ZN-1026): a run whose executable is missing or stale interprets at once and the
# next run starts native; a failed build (CXX=/usr/bin/false) is remembered, the next runs interpret from the cached bytecode without trying
# again, until the compiler changes. A window opens for 20 frames at each run (in the background): run it alone.
cd "$(dirname "$0")/../.." || exit 2
Z="$ZINC"; case "$Z" in /*) ;; *) Z="$PWD/$Z" ;; esac
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
fail=0
export ZINC_HOME="$t/home" ZINC_BACKGROUND=1 ZINC_FRAMES=20 ZINC_STEPS=1
unset ZINC_HEADLESS ZINC_DETERMINISTIC ZINC_RUN CXX
mkdir -p "$t/p/src"
echo '{"name":"bg","entry":"src/main.ts"}' > "$t/p/zinc.json"
src() { printf "import { onFrame, clear } from 'zinc:gfx';\nconsole.log('hello %s');\nonFrame((dt: number) => { clear(0x101820); });\n" "$1" > "$t/p/src/main.ts"; }
run() { timeout 60 "$Z" run "$t/p" > "$t/out" 2>&1; }
built() { n=0; while [ $n -lt 600 ]; do ls "$ZINC_HOME"/cache/run/*/build.log >/dev/null 2>&1 && ! lsof "$ZINC_HOME"/cache/run/*/build.lock >/dev/null 2>&1 && return 0; sleep 0.2; n=$((n+1)); done; return 1; }
expect() { grep -q "$1" "$t/out" || { echo "run_background: $2: $(cat "$t/out")"; fail=1; }; }
src one; run
expect "native .*in the background" "the first run did not build in the background"
expect "run        interpreter" "the first run did not interpret at once"
expect "^hello one" "the first run did not run"
built || { echo "run_background: the background build did not end"; fail=1; }
run
expect "run        native, cached build" "the run after the background build is not native"
expect "^hello one" "the native run did not run"
src two; run
expect "native .*in the background" "a stale build did not build again in the background"
expect "^hello two" "the edited program did not run at once"
built
src three; CXX=/usr/bin/false; export CXX; run
built
ls "$ZINC_HOME"/cache/run/*/failed >/dev/null 2>&1 || { echo "run_background: the failed build is not remembered"; fail=1; }
run
expect "the native build failed" "a remembered failure was not said"
expect "cached bytecode, no compile" "a remembered failure did not start from the cached bytecode"
grep -q "in the background" "$t/out" && { echo "run_background: a remembered failure built again"; fail=1; }
unset CXX; run
expect "native .*in the background" "a new compiler did not build again"
built
run
expect "run        native, cached build" "the build with the new compiler is not used"
[ $fail -eq 0 ] && echo "run_background: ok"
exit $fail
