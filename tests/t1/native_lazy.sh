#!/bin/sh
# A native plugin loaded before is registered from its exports and its library loads at the first call of one of them (ZN-615): a program that
# calls it works, one that only imports it never loads it, and a missing module or a signature mismatch is still a compile error.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
home=${ZINC_HOME:-$HOME/.zinc}
export ZINC_HOME="$tmp/home"
mkdir -p "$ZINC_HOME"
[ -d "$home/toolchains" ] && ln -s "$home/toolchains" "$ZINC_HOME/toolchains"   # the pinned zig, not downloaded again
unset ZINC_DETERMINISTIC
p="$tmp/proj/plugins/lazy"
mkdir -p "$p/native"
cat > "$p/plugin.json" <<'J'
{ "name": "lazy", "kind": "module", "module": "zinc:lazy", "entry": "index.ts", "targets": { "macos": {}, "linux": {} } }
J
cat > "$p/native/lazy.spec.ts" <<'T'
import { NativeModule, requireNative } from 'zinc:native';
export interface Spec extends NativeModule { twice(x: i32): i32; }
export default requireNative<Spec>('Lazy');
T
echo "import L from './native/lazy.spec'; export const twice = (x: i32): i32 => L.twice(x);" > "$p/index.ts"
cat > "$p/native/lazy.host.cpp" <<'C'
#include "zinc_native_lazy.h"
struct HostLazy : NativeLazy { int32_t twice(int32_t x) override { return 2 * x; } };
NativeLazy* zinc_create_Lazy() { static HostLazy inst; inst.rc = zrt::IMMORTAL; return &inst; }
C
printf "import { twice } from 'zinc:lazy';\nconsole.log('start');\nconsole.log(twice(21));\n" > "$tmp/proj/calls.ts"
printf "import { twice } from 'zinc:lazy';\nconst f = twice;\nconsole.log('no call');\n" > "$tmp/proj/imports.ts"
fail=0
out=$("$ZINC" run "$tmp/proj/calls.ts" --interp 2>/dev/null)   # builds the plugin, loads it, writes its exports
[ "$out" = "$(printf 'start\n42')" ] || { echo "first run: $out"; exit 1; }
out=$("$ZINC" -v run "$tmp/proj/calls.ts" --interp 2>&1)
echo "$out" | grep -q "^start$" && echo "$out" | grep -q "^42$" || { echo "a deferred module does not answer its first call: $out"; fail=1; }
echo "$out" | grep -q "lazy: loaded at its first call" || { echo "the module was not deferred: $out"; fail=1; }
out=$("$ZINC" -v run "$tmp/proj/imports.ts" --interp 2>&1)
echo "$out" | grep -q "^no call$" || { echo "imports.ts: $out"; fail=1; }
echo "$out" | grep -q "loaded at its first call" && { echo "a module that is never called was loaded: $out"; fail=1; }
printf "import { NativeModule, requireNative } from 'zinc:native';\ninterface S extends NativeModule { twice(x: string): i32; }\nconst L = requireNative<S>('Lazy');\nconsole.log(L.twice('a'));\n" > "$tmp/proj/bad.ts"
out=$("$ZINC" run "$tmp/proj/bad.ts" --interp 2>&1) && { echo "a signature mismatch ran: $out"; fail=1; }
echo "$out" | grep -q "the Spec says 's>i', the module has 'i>i'" || { echo "no signature mismatch at compile time: $out"; fail=1; }
printf "import { NativeModule, requireNative } from 'zinc:native';\ninterface S extends NativeModule { twice(x: i32): i32; }\nconst L = requireNative<S>('Nope');\nconsole.log(L.twice(1));\n" > "$tmp/proj/missing.ts"
out=$("$ZINC" run "$tmp/proj/missing.ts" --interp 2>&1) && { echo "a missing module ran: $out"; fail=1; }
echo "$out" | grep -q "no plugin provides it" || { echo "no missing-module error at compile time: $out"; fail=1; }
[ $fail -eq 0 ] && echo "native lazy: ok"
exit $fail
