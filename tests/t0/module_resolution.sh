#!/bin/sh
# One module resolver for every engine (src/frontend/resolve.h). tests/data/resolve: which.ts with .macos, .esp32 and .native variants (the
# .native one imports its own stem and gets the generic one), ext.ts beside ext.native.tsx (.ts first, each with the suffixes: Metro's order),
# an index directory with a platform file, './helper.js' naming helper.ts, and a tsconfig.json paths entry onto a platform file. The
# interpreter and --engine quickjs print the same files for macos, linux and esp32, and the board's check under mquickjs (zinc check
# --target esp32 --engine mquickjs, which shows no output when it passes) runs the program's own check of what it got; without
# which.esp32.ts that check fails and says what it got.
cd "$(dirname "$0")/../data/resolve" || exit 2
fail=0
expect() {   # $1 the platform, $2 the line both engines print
  for engine in --interp '--engine quickjs'; do
    got=$(ZINC_HEADLESS=1 ZINC_PLATFORM=$1 "$ZINC" -q run . $engine 2>&1)
    [ "$got" = "$2" ] || { echo "module_resolution: ZINC_PLATFORM=$1 $engine printed '$got', want '$2'"; fail=1; }
  done
}
expect macos 'which.macos.ts ext.ts lib/index.ts helper.ts src/mapped.native.ts'
expect linux 'which.native.ts+which.ts ext.ts lib/index.ts helper.ts src/mapped.native.ts'
expect esp32 'which.esp32.ts ext.ts lib/index.esp32.ts helper.esp32.ts src/mapped.native.ts'
if [ -x "$(dirname "$ZINC")/zinc-mqjs" ] && ZINC_OFFLINE=1 "$ZINC" toolchain esbuild >/dev/null 2>&1 && ZINC_OFFLINE=1 "$ZINC" toolchain swc >/dev/null 2>&1; then
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  "$ZINC" check . --target esp32 --engine mquickjs >"$tmp/log" 2>&1 || { echo "module_resolution: mquickjs resolved other files:"; cat "$tmp/log"; fail=1; }
  cp -R . "$tmp/p" && rm "$tmp/p/which.esp32.ts"
  "$ZINC" check "$tmp/p" --target esp32 --engine mquickjs >"$tmp/log" 2>&1 && { echo "module_resolution: the mquickjs check does not see what the program resolved"; fail=1; }
  grep -q "resolved which.native.ts+which.ts" "$tmp/log" || { echo "module_resolution: the failing mquickjs check does not say what it got:"; cat "$tmp/log"; fail=1; }
else
  echo "module_resolution: mquickjs not checked (needs zinc-mqjs beside zinc, esbuild and SWC in ZINC_HOME)"
fi
[ $fail -eq 0 ] && echo "module resolution: ok"
exit $fail
