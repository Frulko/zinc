#!/bin/sh
# image/builder (Zinc Pi Image), headless, with tests/data/pi-image/fake-pi-image standing for tools/pi-image (no Docker).
# Run 1 (build.input): "-lab" typed after the hostname, then "Build the image": the profile is saved before the build
# with the new hostname, the keys the builder does not know (base) kept, readable by its owner only; the tool gets
# "build <profile>"; frame 5 is the form, frame 1999 the finished build (progress, image path, log). Run 2 (build-only.input): the tool
# fails with an ::error line, and the page says so (frame 1999). Frames run unpaced, so the tool's output arrives within
# the 2000. ZN_UPDATE_GOLDEN=1 writes the goldens; KEEP=dir keeps the frames.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
root=$(pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
golden=tests/golden/pi-image-builder
run() { # run <name> <input> <fail 0|1>
  (cd image/builder && env ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_FRAMES=2000 ZINC_SHOT="$tmp/$1.png" ZINC_SHOT_FRAMES=5,1999 \
    ZINC_PI_IMAGE_ROOT="$root" ZINC_PI_IMAGE_PROFILE="$tmp/profile.json" ZINC_PI_IMAGE_TOOL="$root/tests/data/pi-image/fake-pi-image" \
    FAKE_PI_IMAGE_ARGS="$tmp/args" FAKE_PI_IMAGE_FAIL=$3 ZINC_INPUT="$2" timeout 120 "$Z" run . > "$tmp/$1.out" 2>&1) ||
    { echo "pi-image builder: run $1 failed: $(tail -5 "$tmp/$1.out")"; exit 1; }
}
printf '{"base":{"url":"https://example.invalid/kept.img.xz","sha256":"00"},"name":"demo","hostname":"zinc","libraries":["ffmpeg"]}\n' > "$tmp/profile.json"
run ok "$root/tests/data/pi-image/build.input" 0
[ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.png "$tmp/profile.json" "$KEEP/"
fail=0
[ "$(cat "$tmp/args" 2>/dev/null)" = "build $tmp/profile.json" ] || { echo "pi-image builder: the tool was not called with build <profile>: $(cat "$tmp/args" 2>/dev/null)"; fail=1; }
jq -e '.hostname == "zinc-lab" and .base.url == "https://example.invalid/kept.img.xz" and .libraries == ["ffmpeg"]' "$tmp/profile.json" > /dev/null ||
  { echo "pi-image builder: the saved profile lost the typed hostname or a key it does not know: $(cat "$tmp/profile.json")"; fail=1; }
[ -n "$(find "$tmp/profile.json" -perm 600)" ] || { echo "pi-image builder: the profile (a password, a Wi-Fi key) is readable by others"; fail=1; }
run failed "$root/tests/data/pi-image/build-only.input" 1
for shot in ok-5:form ok-1999:built failed-1999:failed; do
  frame=${shot%%:*}; name=${shot##*:}
  [ "${ZN_UPDATE_GOLDEN:-0}" = 1 ] && mkdir -p "$golden" && cp "$tmp/$frame.png" "$golden/$name.png"
  tools/pngdiff "$tmp/$frame.png" "$golden/$name.png" > /dev/null || { echo "pi-image builder: frame $frame differs from $golden/$name.png"; fail=1; }
done
[ $fail = 0 ] && echo "pi-image builder: ok"
exit $fail
