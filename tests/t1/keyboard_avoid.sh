#!/bin/sh
# The on-screen keyboard never covers the focused field (ZN-626, docs/ui.md "Text input on phones"): rn-showcase's sign-up form as a phone shows
# it (ZINC_PLATFORM android or ios, a phone's surface and safe area), a finger on the Phone field (low on the page), then the keyboard's height as
# the OS sends it. KeyboardAvoidingView pads by the part of it the keyboard covers and zinc:ui scrolls the field above the keyboard once the room is
# made. The boxes are read from the screen reader's mirror (`a11y 1`: each node's box on the surface, ZINC_DEVICE_LOG): the focused field must end
# above the keyboard's top and start below the safe area's top.
cd "$(dirname "$0")/../.." || exit 2
app=$PWD/../examples/rn-showcase
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
# check <platform> <W>x<H> <safe area> <keyboard>
check() {
  w=${2%x*}; h=${2#*x}; set -- "$1" "$2" "$3" "$4"
  printf '1 safe-area %s\n1 a11y 1\n3 touch 1 %s 530\n5 touchup 1\n8 keyboard %s\n' "$3" $((w / 2)) "$4" > "$tmp/in"
  rm -f "$tmp/dev.log"
  env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_PLATFORM="$1" SHOWCASE_SCREEN=forms SHOWCASE_LANG=en ZINC_SIZE="$2" ZINC_FRAMES=20 \
    ZINC_INPUT="$tmp/in" ZINC_DEVICE_LOG="$tmp/dev.log" "$ZINC" run "$app" > "$tmp/out" 2>&1 || { echo "keyboard_avoid: $1 run failed"; tail -5 "$tmp/out"; fail=1; return; }
  top=${3%% *}
  # the last box of the focused node (flag 128) that is a text field (flag 16)
  sed 's/^a11y //' "$tmp/dev.log" | awk -v kb=$((h - $4)) -v top="$top" -v p="$1" '
    $1 == "n" { f = $4; if (int(f / 128) % 2 == 1 && int(f / 16) % 2 == 1) { y = $6; hh = $8; name = $0 } }
    END {
      if (name == "") { print "keyboard_avoid: " p ": no focused field"; exit 1 }
      if (y + hh > kb || y < top) { print "keyboard_avoid: " p ": the field (y " y ", h " hh ") is not between the safe area (" top ") and the keyboard (" kb ")"; exit 1 }
      if (y + hh < kb - 40) { print "keyboard_avoid: " p ": the field ends at " y + hh ", far above the keyboard (" kb "): room made for more than the keyboard covers"; exit 1 }
      print "keyboard_avoid: " p ": field " y ".." y + hh ", keyboard from " kb
    }' || fail=1
}
check android 360x808 "47 0 21 0" 290
check ios 402x874 "62 0 34 0" 336
[ $fail -eq 0 ] && echo "keyboard avoid: ok"
exit $fail
