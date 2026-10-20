#!/bin/sh
# Paths in a plugin manifest (`flags`, `libs`, `linkFlags`) that start with ./ or ../ are relative to the plugin, not to the directory zinc runs in (ZN dock app):
# a plugin whose header sits two directories up builds from anywhere.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"
p="$tmp/proj/plugins/rel"
mkdir -p "$p/native" "$tmp/proj/inc" "$tmp/elsewhere"
echo 'static inline int answer() { return 42; }' > "$tmp/proj/inc/rel.h"
cat > "$p/plugin.json" <<'J'
{ "name": "rel", "kind": "module", "module": "zinc:rel", "entry": "index.ts", "targets": { "macos": { "flags": ["-I../../inc"] }, "linux": { "flags": ["-I../../inc"] } } }
J
cat > "$p/native/rel.spec.ts" <<'T'
import { NativeModule, requireNative } from 'zinc:native';
export interface Spec extends NativeModule { answer(): i32; }
export default requireNative<Spec>('Rel');
T
echo "import R from './native/rel.spec'; export const answer = (): i32 => R.answer();" > "$p/index.ts"
cat > "$p/native/rel.host.cpp" <<'C'
#include "zinc_native_rel.h"
#include <rel.h>
struct HostRel : NativeRel { int32_t answer() override { return ::answer(); } };
NativeRel* zinc_create_Rel() { static HostRel inst; inst.rc = zrt::IMMORTAL; return &inst; }
C
cd "$tmp/elsewhere" || exit 2
out=$("$ZINC" plugin-build rel "$tmp/proj" 2>&1) || { echo "a plugin with a relative -I does not build from another directory: $(echo "$out" | head -c 400)"; exit 1; }
echo "$out" | grep -q "^rel built " || { echo "unexpected plugin-build output: $out"; exit 1; }
