#!/bin/sh
# The real workspace, hostname input and build success/failure against a fake tool; no Docker or network.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
root=$(pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
golden=tests/golden/pi-image-builder
run() { # name, failure flag
  mkdir -p "$tmp/$1"
  env ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=${3:-1180x780} ZINC_FRAMES=10000 \
    ZINC_PI_IMAGE_ROOT="$root" ZINC_PI_IMAGE_PROFILE="$tmp/profile.json" ZINC_PI_IMAGE_TOOL="$root/tests/data/pi-image/fake-pi-image" \
    FAKE_PI_IMAGE_ARGS="$tmp/args" FAKE_PI_IMAGE_FAIL=$2 PI_TEST_SHOTS="$tmp/$1" \
    timeout 40 "$Z" run tests/data/pi-image/builder-session.tsx >"$tmp/$1.out" 2>&1 ||
    { echo "pi-image builder: run $1 failed: $(tail -8 "$tmp/$1.out")"; exit 1; }
  grep -q '^builder session:' "$tmp/$1.out" || { echo "builder session ended before verification"; exit 1; }
}
printf '{"base":{"url":"https://example.invalid/kept.img.xz","sha256":"00"},"zinc":{"url":"https://example.invalid/download/v9.9.9/zinc.tar.gz","sha256":"00"},"name":"demo","hostname":"zinc","libraries":["ffmpeg"]}\n' > "$tmp/profile.json"
run ok 0
[ "$(cat "$tmp/args" 2>/dev/null)" = "build $tmp/profile.json" ] || { echo "build did not receive the saved profile"; exit 1; }
jq -e '.hostname == "zinc-lab" and .base.url == "https://example.invalid/kept.img.xz" and .libraries == ["ffmpeg"]' "$tmp/profile.json" >/dev/null ||
  { echo "hostname or unknown profile keys lost"; exit 1; }
[ -n "$(find "$tmp/profile.json" -perm 600)" ] || { echo "profile is readable by others"; exit 1; }
run failed 1
run compact 0 960x720
[ -z "$KEEP" ] || { mkdir -p "$KEEP"; cp "$tmp/ok/"*.png "$tmp/failed/failed.png" "$tmp/"*.out "$KEEP/"; cp "$tmp/compact/built.png" "$KEEP/compact.png"; }
fail=0
for shot in ok/form ok/built failed/failed; do
  name=${shot##*/}
  [ "${ZN_UPDATE_GOLDEN:-0}" != 1 ] || cp "$tmp/$shot.png" "$golden/$name.png"
  tools/pngdiff "$tmp/$shot.png" "$golden/$name.png" >/dev/null || { echo "pi-image builder: $name differs"; fail=1; }
done
exit $fail
