#!/bin/sh
# The platform look (ZN-748, lib/std/platform, docs/ui.md "Platform look"): the kit gallery and rn-showcase drawn as iOS, Android and macOS draw
# (ZINC_PLATFORM=ios|android|macos on the desktop), one frame hash per profile and screen in tests/golden/platform-look/hashes.txt: the kit at rest,
# rn-showcase's components (its React Native switches), and a finger pulling that screen past its top (iOS's rubber band, Android's stretch).
# Then the one switch: zinc.json "ui": {"platformLook"} forces the kit's, Nuxt UI's and React Native's switches to one look whatever the
# platform (app.tsx prints their widths), and draws what the platform itself draws; a long press opens the kit's context menu on a touch screen,
# with the platform's haptic, and a flipped switch ticks on iOS only (ZINC_DEVICE_LOG). ZN_UPDATE_GOLDEN=1 records the hashes again.
cd "$(dirname "$0")/../.." || exit 2
golden=$PWD/tests/golden/platform-look; ex=$PWD/../examples
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
hash() { sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p'; }
# shot <app> <profile> <screen> [input]: the frame hash of one case
shot() {
  case $1 in
    kit) (cd "$ex/ui/kit-gallery" && ZINC_PLATFORM=$2 ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_FRAMES=3 ZINC_SIZE=480x1300 ZINC_FRAMEHASH=last "$ZINC" run src/main.tsx 2>&1 | hash) ;;
    rn) rm -f "$tmp/s.kv"; scheme=${3#*@}; [ "$scheme" = "$3" ] && scheme=light
      (cd "$ex/rn-showcase" && env ZINC_PLATFORM=$2 ZINC_STORAGE="$tmp/s.kv" ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=420x860 ZINC_FRAMES=${5:-20} ZINC_FRAMEHASH=last \
        SHOWCASE_SCREEN=${3%@*} SHOWCASE_SCHEME=$scheme ${4:+ZINC_INPUT=$golden/$4} "$ZINC" run . 2>&1 | hash) ;;
  esac
}
: > "$tmp/hashes"
while read -r app profile screen input frames want; do
  got=$(shot "$app" "$profile" "$screen" "$([ "$input" = - ] || echo "$input")" "$frames")
  echo "$app $profile $screen $input $frames $got" >> "$tmp/hashes"
  [ -n "$got" ] && [ "$got" = "$want" ] || { [ -n "$ZN_UPDATE_GOLDEN" ] || echo "platform-look $app $profile $screen: ${got:-no frame}, recorded $want"; fail=1; }
done < "$golden/hashes.txt"
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/hashes" "$golden/hashes.txt"; echo "platform-look: hashes recorded"; fail=0; fi
# the compiled program draws what the interpreter draws (one hash)
got=$(cd "$ex/ui/kit-gallery" && ZINC_PLATFORM=android ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_FRAMES=3 ZINC_SIZE=480x1300 ZINC_FRAMEHASH=last "$ZINC" run --native src/main.tsx 2>&1 | hash)
[ "$got" = "$(awk '$1 == "kit" && $2 == "android" {print $6}' "$golden/hashes.txt")" ] || { echo "platform-look compiled kit android: $got"; fail=1; }
# the rubber band and the stretch are different frames, and each profile's controls differ from the others'
[ "$(grep ' pull.input ' "$golden/hashes.txt" | awk '{print $6}' | sort -u | wc -l | tr -d ' ')" = 3 ] || { echo "platform-look: the pulls of the three profiles are not all different"; fail=1; }
[ "$(grep '^kit ' "$golden/hashes.txt" | awk '{print $6}' | sort -u | wc -l | tr -d ' ')" = 3 ] || { echo "platform-look: the kit gallery looks the same on two profiles"; fail=1; }

# the switch: app.tsx in a project whose zinc.json forces a look
look() {   # look <platformLook> <ZINC_PLATFORM> [env...]: app.tsx's line and frame hash
  d=$tmp/p-$1-$2; mkdir -p "$d"; cp "$golden/app.tsx" "$d/main.tsx"
  printf '{"name":"look","entry":"main.tsx"%s}\n' "$([ "$1" = - ] || echo ", \"ui\": {\"platformLook\": \"$1\"}")" > "$d/zinc.json"
  pl=$2; shift 2
  (cd "$d" && env "$@" ZINC_PLATFORM=$pl ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_FRAMES=60 ZINC_SIZE=360x640 ZINC_FRAMEHASH=last "$ZINC" run . 2>&1 | grep -E '^look|^kit switch|^zinc: framehash' | sed 's/^zinc: framehash [0-9]* [0-9x]* /hash /')
}
expect() { [ "$1" = "$2" ] || { echo "platform-look $3: $1"; echo "  expected: $2"; fail=1; }; }
forced=$(look android ios); native=$(look - android)
expect "$(echo "$forced" | head -1)" "look android kit 52 nuxt 52 rn 52" "android forced on ios"
expect "$(echo "$forced" | tail -1)" "$(echo "$native" | tail -1)" "android forced on ios draws Android's frame"
expect "$(look neutral android | head -1)" "look neutral kit 36 nuxt 36 rn 51" "neutral forced on android"
expect "$(look - ios ZINC_PLATFORM_LOOK=macos | head -1)" "look macos kit 38 nuxt 38 rn 38" "ZINC_PLATFORM_LOOK=macos on ios"
expect "$(look - linux | head -1)" "look neutral kit 36 nuxt 36 rn 51" "auto on linux"
# a tap on the kit's switch, then a long press on the kit's context menu: the haptics each platform plays
for p in ios android; do
  rm -f "$tmp/dev.log"
  look - $p ZINC_INPUT="$golden/press.input" ZINC_DEVICE_LOG="$tmp/dev.log" > "$tmp/out"
  grep -q '^kit switch false' "$tmp/out" || { echo "platform-look $p: the kit switch did not flip: $(cat "$tmp/out")"; fail=1; }
  got=$(grep '^haptic' "$tmp/dev.log" 2>/dev/null | tr '\n' ',')
  want=$([ $p = ios ] && echo 'haptic impact light,haptic impact medium,' || echo 'haptic impact heavy,')
  expect "$got" "$want" "$p haptics"
done
[ $fail -eq 0 ] && echo "platform look: ok"
exit $fail
