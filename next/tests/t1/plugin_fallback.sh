#!/bin/sh
# ZN-720: unavailable native modules explain their fallback, even on cached AOT/ZBC runs.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
unset ZINC_DETERMINISTIC ZINC_STEPS ZINC_NATIVE
export ZINC_HOME="$t/home" ZINC_HEADLESS=1 ZINC_FRAMES=1
mkdir -p "$t/project/plugins/probe/native"
cat > "$t/project/plugins/probe/plugin.json" <<'JSON'
{"name":"probe","kind":"module","module":"zinc:probe","entry":"index.ts","description":"missing native implementation","targets":{"macos":{},"linux":{}}}
JSON
cat > "$t/project/plugins/probe/native/probe.spec.ts" <<'TS'
import { NativeModule, requireNative } from 'zinc:native';
export interface Spec extends NativeModule { value(): i32; }
export default requireNative<Spec>('Probe');
TS
printf 'export default { value(): i32 { return 42; } };\n' > "$t/project/plugins/probe/native/probe.sim.ts"
printf "import P from './native/probe.spec';\nexport function value(): i32 { return P.value(); }\n" > "$t/project/plugins/probe/index.ts"
printf '{"name":"fallback","entry":"main.ts"}\n' > "$t/project/zinc.json"
cat > "$t/project/main.ts" <<'TS'
import { value } from 'zinc:probe';
import { onFrame, clear } from 'zinc:gfx';
console.log(value());
onFrame(() => { clear(0); });
TS
for engine in interp native; do
  for attempt in 1 2; do
    "$ZINC" run "--$engine" "$t/project" > "$t/out" 2> "$t/log" || { cat "$t/log"; exit 1; }
    [ "$(cat "$t/out")" = 42 ] || exit 1
    grep -q 'warning: Probe: using simulation; native implementation unavailable: .*no native source' "$t/log" || { cat "$t/log"; exit 1; }
  done
  grep -q 'cached' "$t/log" || { echo "plugin_fallback: $engine did not reuse the cache"; cat "$t/log"; exit 1; }
done
ZINC_NATIVE=real "$ZINC" run --interp "$t/project" > "$t/out" 2> "$t/log" && { echo 'plugin_fallback: real silently simulated'; exit 1; }
grep -q 'Z5011.*Probe.*no native source' "$t/log" || { cat "$t/log"; exit 1; }
ZINC_NATIVE=sim "$ZINC" run --interp "$t/project" > "$t/out" 2> "$t/log" || exit 1
grep -q 'Probe: using simulation' "$t/log" && ! grep -q 'warning:' "$t/log" || { cat "$t/log"; exit 1; }
ZINC_NATIVE=auto "$ZINC" run --interp --log-format json -v "$t/project" > "$t/out" 2> "$t/json" || exit 1
python3 - "$t/json" <<'PY'
import json, sys
lines = [json.loads(line) for line in open(sys.argv[1])]
assert any(line['level'] == 'warning' and 'Probe' in line['msg'] for line in lines), lines
PY
