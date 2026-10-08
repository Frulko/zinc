#!/bin/sh
# The layout engine option (ZN-285): zinc.json "ui": {"layout", "preset"} with targets/capabilities.json "ui" decides UI_LAYOUT of zinc:platform (classic by default,
# rn when asked, auto from the target); rn for esp32 or ps1 stops the build with the reason, the react-native preset falls back to classic there; a bad value is refused; the ESP32 core links no Yoga.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mk() {   # mk <dir> <zinc.json "ui" value or "">
  mkdir -p "$tmp/$1/src"
  printf "import { UI_LAYOUT } from 'zinc:platform';\nconsole.log('layout ' + UI_LAYOUT);\n" > "$tmp/$1/src/main.ts"
  if [ -n "$2" ]; then echo "{ \"name\": \"$1\", \"ui\": $2 }" > "$tmp/$1/zinc.json"; else echo "{ \"name\": \"$1\" }" > "$tmp/$1/zinc.json"; fi
}
expect() {   # expect <dir> <wanted output line> [zinc args...]
  d=$1; want=$2; shift 2
  got=$("$ZINC" run "$tmp/$d" "$@" 2>&1 | grep -v "^zinc: warning")
  case "$got" in *"$want"*) ;; *) echo "$d $*: wanted '$want', got: $(echo "$got" | head -3)"; fail=1 ;; esac
}
mk none ""
mk rn '{"layout": "rn"}'
mk preset '{"preset": "react-native"}'
mk auto '{"layout": "auto"}'
mk classic '{"layout": "classic", "preset": "react-native"}'
mk bad '{"layout": "yoga"}'
expect none "layout classic"
expect rn "layout rn"
expect preset "layout rn"
expect auto "layout classic"
expect classic "layout classic"
expect bad '"ui.layout" must be "classic", "rn" or "auto"'
expect rn "the rn layout (Yoga) is not available on esp32: Yoga needs" --profile esp32
expect rn "not available on ps1: soft float" --profile ps1
expect rn "not available on esp32" --target esp32 --device true
expect preset "layout classic" --profile esp32   # the preset where Yoga is not available: classic with React Native styles (ZN-288)
expect none "layout classic" --profile esp32
# a classic ESP32 build holds no Yoga: none of its symbols in the core's ELF (when built here), none of its messages in the committed image
LC_ALL=C grep -aq "measure function" build/libzn_yoga.a 2>/dev/null || { echo "probe: Yoga's message not found in build/libzn_yoga.a"; fail=1; }
LC_ALL=C grep -aq "measure function\|YGNode" firmware/esp32/prebuilt/esp32-core-flash.bin && { echo "the ESP32 core image holds Yoga"; fail=1; }
nm=$(find "$HOME/.zinc/esp-tools" -name xtensa-esp32-elf-nm 2>/dev/null | head -1)
if [ -n "$nm" ] && [ -f firmware/esp32/build/zinc-core.elf ]; then
  [ "$("$nm" firmware/esp32/build/zinc-core.elf | grep -c 'YG\|yoga')" = 0 ] || { echo "the ESP32 core ELF has Yoga symbols"; fail=1; }
fi
[ $fail -eq 0 ] && echo "ui layout option: ok"
exit $fail
