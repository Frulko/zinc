#!/bin/sh
# zinc:gfx imageFromBytes decodes WebP (a picture of Discord's media proxy comes as WebP): two files give their size, a truncated one -1, the same lines on the
# interpreter, QuickJS and the AOT build.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
d=tests/data/webp_bytes
want="photo.webp true 16x8
photo.webp true 160x120
truncated -1"
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_FRAMES=1
fail=0
check() { [ "$2" = "$want" ] || { printf 'webp_bytes: %s gave:\n%s\nwant:\n%s\n' "$1" "$2" "$want"; fail=1; }; }
check interpreter "$("$ZINC" run $d/main.ts 2>&1 | grep -v '^zinc')"
check quickjs "$("$ZINC" run $d/main.ts --engine quickjs 2>&1 | grep -v '^zinc')"
if command -v c++ >/dev/null; then
  "$ZINC" build $d/main.ts -o "$t/app" >"$t/build.log" 2>&1 || { echo "webp_bytes: AOT build failed: $(head -c 300 "$t/build.log")"; exit 1; }
  check aot "$("$t/app" 2>&1 | grep -v '^zinc')"
fi
exit $fail
