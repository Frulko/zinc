#!/bin/sh
# The start's fast path of a native plugin (ZN-617): a second start takes the stamp of its last build and runs no pkg-config; a changed .pc
# file, source or spec makes the next start check and rebuild it. A plugin of a temporary project needs a fake package (its Cflags define
# the value the plugin returns); a pkg-config shim logs its calls.
cd "$(dirname "$0")/../.." || exit 2
command -v pkg-config >/dev/null || { echo "skipped: no pkg-config"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
home=${ZINC_HOME:-$HOME/.zinc}
export ZINC_HOME="$tmp/home"
mkdir -p "$ZINC_HOME" "$tmp/bin" "$tmp/pc"
[ -d "$home/toolchains" ] && ln -s "$home/toolchains" "$ZINC_HOME/toolchains"   # the pinned zig, not downloaded again
unset ZINC_DETERMINISTIC ZINC_PLUGIN_NO_STAMP
real=$(command -v pkg-config)
printf '#!/bin/sh\necho "$*" >> "%s/pkg.log"\nexec "%s" "$@"\n' "$tmp" "$real" > "$tmp/bin/pkg-config"
chmod +x "$tmp/bin/pkg-config"
export PATH="$tmp/bin:$PATH" PKG_CONFIG_PATH="$tmp/pc"
printf 'Name: fakestamp\nDescription: test\nVersion: 1\nCflags: -DFAKE_VALUE=21\nLibs:\n' > "$tmp/pc/fakestamp.pc"
p="$tmp/proj/plugins/stampy"
mkdir -p "$p/native"
cat > "$p/plugin.json" <<'J'
{ "name": "stampy", "kind": "module", "module": "zinc:stampy", "entry": "index.ts", "targets": { "macos": { "pkg": ["fakestamp"] }, "linux": { "pkg": ["fakestamp"] } } }
J
printf "import { NativeModule, requireNative } from 'zinc:native';\nexport interface Spec extends NativeModule { value(): i32; }\nexport default requireNative<Spec>('Stampy');\n" > "$p/native/stampy.spec.ts"
echo "import S from './native/stampy.spec'; export const value = (): i32 => S.value();" > "$p/index.ts"
cat > "$p/native/stampy.host.cpp" <<'C'
#include "zinc_native_stampy.h"
struct HostStampy : NativeStampy { int32_t value() override { return 2 * FAKE_VALUE; } };
NativeStampy* zinc_create_Stampy() { static HostStampy inst; inst.rc = zrt::IMMORTAL; return &inst; }
C
printf "import { value } from 'zinc:stampy';\nconsole.log(value());\n" > "$tmp/proj/main.ts"
run() { : > "$tmp/pkg.log"; "$ZINC" -v run "$tmp/proj/main.ts" --interp > "$tmp/out" 2>&1; }
fail=0
run; grep -qx 42 "$tmp/out" || { echo "first build: $(cat "$tmp/out")"; exit 1; }
run; grep -qx 42 "$tmp/out" || { echo "second start: $(cat "$tmp/out")"; fail=1; }
[ -s "$tmp/pkg.log" ] && { echo "the second start ran pkg-config: $(head -3 "$tmp/pkg.log")"; fail=1; }
grep -q "stampy: unchanged since its last build" "$tmp/out" || { echo "the second start did not take the stamp"; fail=1; }
printf 'Name: fakestamp\nDescription: test\nVersion: 2\nCflags: -DFAKE_VALUE=50\nLibs:\n' > "$tmp/pc/fakestamp.pc"
run; grep -qx 100 "$tmp/out" || { echo "a changed .pc file did not rebuild the plugin: $(grep -v '^zinc' "$tmp/out" | head -3)"; fail=1; }
[ -s "$tmp/pkg.log" ] || { echo "a changed .pc file did not run pkg-config"; fail=1; }
run; [ -s "$tmp/pkg.log" ] && { echo "the start after the rebuild ran pkg-config"; fail=1; }
printf "import { NativeModule, requireNative } from 'zinc:native';\n// the value of FAKE_VALUE, doubled\nexport interface Spec extends NativeModule { value(): i32; }\nexport default requireNative<Spec>('Stampy');\n" > "$p/native/stampy.spec.ts"
run; grep -q "stampy: unchanged since its last build" "$tmp/out" && { echo "a changed spec took the stamp"; fail=1; }
grep -qx 100 "$tmp/out" || { echo "after the spec change: $(grep -v '^zinc' "$tmp/out" | head -3)"; fail=1; }
sed -i.bak 's/2 \* FAKE_VALUE/3 * FAKE_VALUE/' "$p/native/stampy.host.cpp" && rm -f "$p/native/stampy.host.cpp.bak"
run; grep -qx 150 "$tmp/out" || { echo "a changed source did not rebuild the plugin: $(grep -v '^zinc' "$tmp/out" | head -3)"; fail=1; }
exit $fail
