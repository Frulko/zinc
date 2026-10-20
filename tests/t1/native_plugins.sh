#!/bin/sh
# The plugins' native sources run unchanged behind the native-module ABI (ZN-099): sqlite, process and socket through the C++ driver (callbacks included),
# and the sqlite conformance program, built with the plugin from the cache (ZINC_NATIVE=real), prints the frozen output.
cd "$(dirname "$0")/../.." || exit 2
b=$(dirname "$ZINC")
[ -x "$b/native_plugins_test" ] && [ -f "$b/libzn_plugin_sqlite.a" ] || { echo "skipped: the plugin libraries are not built (needs the host library)"; exit 77; }
fail=0
"$b/native_plugins_test" | grep -q "all checks passed" || { "$b/native_plugins_test"; fail=1; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZINC_NATIVE=real "$ZINC" build ../tests/conformance/sqlite.ts -o "$tmp/sq" >"$tmp/build.log" 2>&1 || { echo "sqlite.ts does not build with the native plugin: $(head -c 300 "$tmp/build.log")"; exit 1; }
"$tmp/sq" 2>&1 | diff -q - ../tests/conformance/sqlite.out >/dev/null || { echo "sqlite.ts differs from its frozen output with the native plugin"; fail=1; }
# the other plugins' conformance programs on their native code: WebAssembly (wasm3, imports are closures that return a value) and sockets (callbacks from the loop)
for n in wasm socket; do
  ZINC_NATIVE=real "$ZINC" run ../tests/conformance/$n.ts 2>&1 | diff -q - ../tests/conformance/$n.out >/dev/null || { echo "$n.ts differs from its frozen output on the native plugin"; fail=1; }
done
# zinc:process: a child's output and exit arrive as callbacks from the loop
cat > "$tmp/p.ts" <<'TS'
import { spawn } from 'zinc:process';
const p = spawn('sh', ['-c', 'echo out; echo err 1>&2; exit 3'], {});
p.onStdout((l: string) => console.log('stdout', l));
p.onStderr((l: string) => console.log('stderr', l));
p.exited.then((code: i32) => console.log('exit', code));
TS
[ "$(ZINC_NATIVE=real "$ZINC" run "$tmp/p.ts" 2>&1 | sort)" = "$(printf 'exit 3\nstderr err\nstdout out')" ] || { echo "zinc:process does not report a child's lines and exit on the native plugin"; fail=1; }
exit $fail
