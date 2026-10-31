#!/bin/sh
# The guided flow: the shell and A/B options reach the profile, the live steps view shows done, running and pending steps,
# and image/build.sh writes ZINC_SHELL=1 only for a profile that asks for it.
cd "$(dirname "$0")/../.." || exit 2
root=$(pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
golden=tests/golden/pi-image-builder
printf '{"zinc":{"url":"https://example.invalid/download/v9.9.9/zinc.tar.gz"},"name":"demo"}\n' >"$tmp/profile.json"
mkdir -p "$tmp/shots"
env ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=1180x780 ZINC_FRAMES=40 ZINC_PI_IMAGE_ROOT="$root" ZINC_PI_IMAGE_PROFILE="$tmp/profile.json" PI_TEST_SHOTS="$tmp/shots" \
  timeout 40 "$ZINC" run tests/data/pi-image/builder-flow.tsx >"$tmp/out" 2>&1
grep -q '^builder flow:' "$tmp/out" || { cat "$tmp/out"; exit 1; }
# the session setting: the very line of image/build.sh, run on a profile with and without the shell
line=$(grep -F 'ZINC_SHELL=1' image/build.sh | grep -F "'.shell" | head -n 1)
[ -n "$line" ] || { echo "image/build.sh does not write ZINC_SHELL"; exit 1; }
for want in true false; do
  R=$tmp/root-$want; mkdir -p "$R/etc/zinc"; P=$tmp/p-$want.json; echo "{\"shell\":$want}" >"$P"
  q() { jq -r "$1" "$P"; }
  eval "$line"
  if [ $want = true ]; then grep -qx 'ZINC_SHELL=1' "$R/etc/zinc/session.conf" || { echo "shell: no session.conf"; exit 1; }
  else [ ! -e "$R/etc/zinc/session.conf" ] || { echo "no shell: session.conf written"; exit 1; }; fi
done
[ -z "$KEEP" ] || { mkdir -p "$KEEP"; cp "$tmp/shots/"*.png "$KEEP/"; }
fail=0
for name in apps steps; do
  [ "${ZN_UPDATE_GOLDEN:-0}" != 1 ] || cp "$tmp/shots/$name.png" "$golden/$name.png"
  tools/pngdiff "$tmp/shots/$name.png" "$golden/$name.png" >/dev/null || { echo "pi-image builder flow: $name differs"; fail=1; }
done
exit $fail
