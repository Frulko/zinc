#!/bin/sh
cd "$(dirname "$0")/../.." || exit 2
root=$(pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf '{"base":{"url":"pinned"},"hostname":"zinc","wifi":{"password":"secret"}}\n' >"$tmp/profile.json"
run() {
  env ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_FRAMES=80 ZINC_SHOT="$tmp/$1.png" ZINC_SHOT_FRAMES=4,28,68,76 \
    ZINC_PI_IMAGE_ROOT="$root" ZINC_PI_IMAGE_PROFILE="$tmp/profile.json" PI_TEST_REOPEN="$1" \
    ZINC_PI_IMAGE_TOOL="$root/tests/data/pi-image/fake-pi-image" FAKE_PI_IMAGE_ARGS="$tmp/args" \
    timeout 60 "$ZINC" run tests/data/pi-image/builder-presets.tsx >"$tmp/$1.out" 2>&1
}
run 0 || { cat "$tmp/0.out"; exit 1; }
run 1 || { cat "$tmp/1.out"; exit 1; }
grep -q '^ok: dropdown layers' "$tmp/0.out" && grep -q '^ok: cold restart' "$tmp/1.out" || { cat "$tmp"/*.out; exit 1; }
[ ! -e "$tmp/args" ] || { echo 'An unsaved profile reached the build tool'; exit 1; }
fail=0
for shot in 4:select 28:preset 76:options; do
  frame=${shot%%:*}; name=${shot##*:}; golden=tests/golden/pi-image-builder/$name.png
  [ "${ZN_UPDATE_GOLDEN:-0}" = 1 ] && cp "$tmp/0-$frame.png" "$golden"
  tools/pngdiff "$tmp/0-$frame.png" "$golden" >/dev/null || { echo "builder presets: $name differs"; fail=1; }
done
[ -z "$KEEP" ] || { mkdir -p "$KEEP"; cp "$tmp"/*.png "$tmp"/*.out "$KEEP/"; }
[ $fail = 0 ] && echo 'Pi image presets and select overlays: ok'
exit $fail
