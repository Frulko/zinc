#!/bin/sh
# ZN-1027: a plugin whose native code does not compile fails loudly. zinc run says so in one line (the plugin, the first compiler error,
# ZINC_NATIVE=sim) and runs the stand-in; zinc pack stops with the whole compiler error; ZINC_NATIVE=sim packs the stand-in on purpose.
# (zinc export sets the same rule for the builds it runs.) The plugin is compiled with the toolchain of the usual ZINC_HOME.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
unset ZINC_DETERMINISTIC ZINC_NATIVE ZINC_NATIVE_REQUIRED
export ZINC_HEADLESS=1 ZINC_FRAMES=1 ZINC_STEPS=0
mkdir -p "$t/project/plugins/probe/native"
printf '{"name":"probe","kind":"module","module":"zinc:probe","entry":"index.ts","description":"broken native code","targets":{"macos":{},"linux":{}}}\n' > "$t/project/plugins/probe/plugin.json"
cat > "$t/project/plugins/probe/native/probe.spec.ts" <<'TS'
import { NativeModule, requireNative } from 'zinc:native';
export interface Spec extends NativeModule { value(): i32; }
export default requireNative<Spec>('Probe');
TS
printf 'export default { value(): i32 { return 42; } };\n' > "$t/project/plugins/probe/native/probe.sim.ts"
printf 'this is not C++;\n' > "$t/project/plugins/probe/native/probe.host.cpp"
printf "import P from './native/probe.spec';\nexport function value(): i32 { return P.value(); }\n" > "$t/project/plugins/probe/index.ts"
printf '{"name":"broken","entry":"main.ts"}\n' > "$t/project/zinc.json"
printf "import { value } from 'zinc:probe';\nconsole.log(value());\n" > "$t/project/main.ts"
fail=0
timeout 120 "$ZINC" run --interp "$t/project" > "$t/out" 2> "$t/log" || { echo "zinc run of a broken plugin failed: $(head -c 300 "$t/log")"; fail=1; }
[ "$(cat "$t/out")" = 42 ] && [ "$(grep -c 'plugin probe did not build.*probe.host.cpp:1:1: error.*ZINC_NATIVE=sim' "$t/log")" = 1 ] \
  || { echo "zinc run: a broken plugin is not one line naming it: $(head -c 400 "$t/log")"; fail=1; }
timeout 120 "$ZINC" pack "$t/project" -o "$t/p.zapp" > /dev/null 2> "$t/log" && { echo "zinc pack shipped the stand-in of a plugin that does not build"; fail=1; }
grep -q 'plugin probe did not build' "$t/log" && grep -q 'probe.host.cpp:1:1: error: expected unqualified-id' "$t/log" || { echo "zinc pack does not print the compiler error: $(head -c 400 "$t/log")"; fail=1; }
ZINC_NATIVE=sim timeout 120 "$ZINC" pack "$t/project" -o "$t/p.zapp" > /dev/null 2> "$t/log" && [ -s "$t/p.zapp" ] || { echo "ZINC_NATIVE=sim does not pack the stand-in: $(head -c 300 "$t/log")"; fail=1; }
exit $fail
