#!/bin/sh
# An audited native plugin can use the lite host; opaque plugins and reached network rows keep the full host.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
[ -f "$(dirname "$ZINC")/libzn_host_sys_lite.a" ] || exit 77
mkdir -p "$tmp/plugins/probe/native"
cat > "$tmp/plugins/probe/native/probe.spec.ts" <<'TS'
import { NativeModule, requireNative } from 'zinc:native';
export interface Spec extends NativeModule { answer(): i32; }
export default requireNative<Spec>('HostProbe');
TS
cat > "$tmp/plugins/probe/native/probe.host.cpp" <<'CPP'
#include "zinc_native_hostprobe.h"
struct Probe : NativeHostProbe { int32_t answer() override { return 42; } };
NativeHostProbe* zinc_create_HostProbe() { static Probe p; p.rc = zrt::IMMORTAL; return &p; }
CPP
echo "export { default } from './native/probe.spec';" > "$tmp/plugins/probe/index.ts"
echo "import probe from 'zinc:probe'; console.log(probe.answer());" > "$tmp/main.ts"
manifest() { printf '{"name":"probe","module":"zinc:probe","targets":{"macos":{},"linux":{}},"native":{%s}}\n' "$1" > "$tmp/plugins/probe/plugin.json"; }
build() { ZINC_COMPONENTS=1 ZINC_LOG=plugin=info "$ZINC" build "$tmp/main.ts" -o "$tmp/$1" > "$tmp/$1.log" 2>&1 || { cat "$tmp/$1.log"; exit 1; }; }
manifest '"systemHost":"lite"'
for name in lite cached; do
  build "$name"
  ! grep -qx net "$tmp/$name.components"
  [ "$(ZINC_HEADLESS=1 timeout 10 "$tmp/$name")" = 42 ]
done
grep -q 'unchanged since its last build' "$tmp/cached.log"
# Simulate a pre-field cache record for this test's own plugin only.
python3 - "$tmp/cached.log" "$tmp" <<'PYTEST'
from pathlib import Path
import sys
line = next(s for s in Path(sys.argv[1]).read_text().splitlines() if 'unchanged since its last build (' in s)
stamp = Path(line.split('unchanged since its last build (', 1)[1].split(')', 1)[0])
text = stamp.read_text()
assert 'module HostProbe\n' in text and sys.argv[2] in text
stamp.write_text('\n'.join(s for s in text.split('\n') if not s.startswith('system-host ')))
PYTEST
build legacy
grep -qx net "$tmp/legacy.components"
manifest ''
build full
grep -qx net "$tmp/full.components"
manifest '"systemHost":"lite"'
echo "fetch('http://127.0.0.1:1/').catch(() => {});" >> "$tmp/main.ts"
build network
grep -qx net "$tmp/network.components"
cat > "$tmp/main.ts" <<'TS'
import probe from 'zinc:probe';
import { Script } from 'zinc:script';
const vm = new Script({ engine: 'quickjs' });
console.log(vm.eval('6 * 7'));
vm.dispose();
if (probe.answer() !== 42) throw new Error('lite plugin lost');
TS
ZINC_TEXT=simple build script
grep -qx net "$tmp/script.components"
[ "$(ZINC_HEADLESS=1 timeout 10 "$tmp/script")" = 42 ]
manifest '"systemHost":"typo"'
"$ZINC" plugins "$tmp" > "$tmp/out" 2> "$tmp/err" && exit 1
grep -q 'native.systemHost.*full or lite' "$tmp/err"
