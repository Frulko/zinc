#!/bin/sh
# Zinc Go on the phone simulators (ZN-631, docs/reports/zinc-next-zinc-go.md): the player exported from examples/zinc-go runs rn-showcase from
# `zinc dev --lan` on this Mac, and a scripted save of a .tsx updates the screen in place, state kept, in under a second.
# Android (an emulator: ZINC_GO_EMULATOR, default emulator-5554; never a device): the deep link of the emulator's address for the Mac
# (10.0.2.2), the Forms tab and its checkbox tapped, src/screens/Forms.tsx saved with a new heading: `refreshed` under 1000 ms, the checkbox
# still ticked on the new frame and the heading's pixels changed.
# iOS (the booted simulator, else skipped): the app built for the simulator, launched with the link and on Forms (SHOWCASE_SCREEN), the same
# save: `refreshed` under 1000 ms and the heading's pixels changed (simctl has no taps: no state is made by hand there).
# Skipped (77) without an emulator and a booted simulator. ZINC_GO_SKIP_BUILD=1 reuses /tmp/zn631-go-android and /tmp/zn631-go-ios.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "${ZINC:-build/zinc}")" && pwd)/$(basename "${ZINC:-build/zinc}")
ADB=${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}
EMU=${ZINC_GO_EMULATOR:-emulator-5554}
case "$EMU" in emulator-*) ;; *) echo "ZINC_GO_EMULATOR must be an emulator, not a device"; exit 2 ;; esac
android=; ios=
[ -x "$ADB" ] && "$ADB" -s "$EMU" get-state >/dev/null 2>&1 && android=1
sim=$(xcrun simctl list devices booted 2>/dev/null | grep -o '[0-9A-F-]\{36\}' | head -1); [ -n "$sim" ] && ios=1
[ -n "$android$ios" ] || { echo "skipped: no Android emulator and no booted iOS simulator"; exit 77; }
t=$(mktemp -d); trap 'kill $dev 2>/dev/null; wait $dev 2>/dev/null; rm -rf "$t"' EXIT
fail=0
waitfor() { n=0; while [ $n -lt $(( $3 * 20 )) ]; do grep -aq "$2" "$1" 2>/dev/null && return 0; sleep 0.05; n=$((n+1)); done; return 1; }
cp -R examples/rn-showcase "$t/rn" && rm -rf "$t/rn/build"
"$Z" dev "$t/rn" --lan --port 18300 > "$t/dev.log" 2>&1 &
dev=$!
waitfor "$t/dev.log" "Scan it with Zinc Go" 20 || { echo "zinc dev --lan did not start: $(tail -3 "$t/dev.log")"; exit 1; }
code=$(sed -n 's/.*or open zinc:\/\/[^/]*\/\([0-9a-f]*\).*/\1/p' "$t/dev.log" | head -1)
port=$(sed -n 's/.*or open zinc:\/\/[^:]*:\([0-9]*\)\/.*/\1/p' "$t/dev.log" | head -1)
# the pixel at (fx, fy) of a screenshot, as fractions of its size: "r g b"; how many pixels differ between two screenshots in a band of rows
pixel() { python3 -c "from PIL import Image; i=Image.open('$1').convert('RGB'); w,h=i.size; print(*i.getpixel((int(w*$2),int(h*$3))))"; }
changed() { python3 -c "
from PIL import Image, ImageChops
a=Image.open('$1').convert('RGB'); b=Image.open('$2').convert('RGB'); w,h=a.size
d=ImageChops.difference(a.crop((0,int(h*$3),w,int(h*$4))),b.crop((0,int(h*$3),w,int(h*$4))))
print(sum(1 for p in d.getdata() if max(p)>40))"; }
save() {   # $1: the new heading, $2: the device, $3: the heading it replaces
  perl -pi -e "s/<Section title=\"(?:$3)\">/<Section title=\"$1\">/" "$t/rn/src/screens/Forms.tsx"   # the heading on screen
  waitfor "$t/dev.log" "refreshed src/screens/Forms.tsx on $2" 10 || { echo "no refresh on $2: $(grep -a 'zinc dev:' "$t/dev.log" | tail -3)"; return 1; }
  ms=$(grep -a "refreshed src/screens/Forms.tsx on $2" "$t/dev.log" | tail -1 | sed 's/.*(\([0-9]*\) ms after the save.*/\1/')
  grep -a "refreshed src/screens/Forms.tsx on $2" "$t/dev.log" | tail -1 | sed 's/^zinc dev: /  /'
  [ "$ms" -lt 1000 ] || { echo "the refresh on $2 took $ms ms"; return 1; }
}
if [ -n "$android" ]; then
  abi=$("$ADB" -s "$EMU" shell getprop ro.product.cpu.abi | tr -d '\r')
  if [ -z "$ZINC_GO_SKIP_BUILD" ]; then
    rm -rf /tmp/zn631-go-android
    "$Z" export examples/zinc-go --target android -o /tmp/zn631-go-android --apk --abis "$abi" > "$t/apk.log" 2>&1 || { echo "the Android player did not build: $(grep -a -m3 'error' "$t/apk.log")"; exit 1; }
  fi
  "$ADB" -s "$EMU" install -r /tmp/zn631-go-android/app/build/outputs/apk/debug/app-debug.apk >/dev/null || { echo "install failed"; exit 1; }
  "$ADB" -s "$EMU" shell am force-stop dev.zinc.go
  "$ADB" -s "$EMU" shell am start -a android.intent.action.VIEW -d "zinc://10.0.2.2:$port/$code" dev.zinc.go >/dev/null
  waitfor "$t/dev.log" "v1 started on Android" 30 || { echo "rn-showcase did not start on the emulator: $(grep -a 'zinc dev:' "$t/dev.log" | tail -3)"; fail=1; }
  sleep 2
  size=$("$ADB" -s "$EMU" shell wm size | sed 's/.* //' | tr -d '\r'); W=${size%x*}; H=${size#*x}
  tap() { "$ADB" -s "$EMU" shell input swipe $(( W * $1 / 1000 )) $(( H * $2 / 1000 )) $(( W * $1 / 1000 )) $(( H * $2 / 1000 )) 120; sleep 1.2; }   # a press held 120 ms
  tap 506 953   # the Forms tab
  tap 121 503   # Show password
  "$ADB" -s "$EMU" exec-out screencap -p > "$t/a1.png"
  set -- $(pixel "$t/a1.png" 0.121 0.503)
  [ "$1" -gt 180 ] && [ "$3" -lt 120 ] || { echo "the checkbox was not ticked by the tap ($*)"; fail=1; }
  save "Saved on the Mac" Android "Create your account" || fail=1
  sleep 0.5
  "$ADB" -s "$EMU" exec-out screencap -p > "$t/a2.png"
  set -- $(pixel "$t/a2.png" 0.121 0.503)
  [ "$1" -gt 180 ] && [ "$3" -lt 120 ] || { echo "the state was lost: the checkbox is not ticked after the refresh ($*)"; fail=1; }
  [ "$(changed "$t/a1.png" "$t/a2.png" 0.14 0.17)" -gt 100 ] || { echo "the heading did not change on the screen"; fail=1; }
  [ -n "$KEEP" ] && cp "$t"/a*.png "$KEEP"
  "$ADB" -s "$EMU" shell am force-stop dev.zinc.go
fi
if [ -n "$ios" ]; then
  if [ -z "$ZINC_GO_SKIP_BUILD" ]; then
    rm -rf /tmp/zn631-go-ios
    "$Z" export examples/zinc-go --target ios -o /tmp/zn631-go-ios --ipa --simulator > "$t/ios.log" 2>&1 || { echo "the iOS player did not build: $(grep -a -m3 'error' "$t/ios.log")"; exit 1; }
  fi
  xcrun simctl install "$sim" /tmp/zn631-go-ios/build/Debug-iphonesimulator/zinc-go.app || { echo "install failed"; exit 1; }
  # the link as the launch's argument, as a deep link at a cold start (`simctl openurl` asks "Open in Zinc Go?" first, which simctl cannot tap)
  SIMCTL_CHILD_SHOWCASE_SCREEN=forms xcrun simctl launch --terminate-running-process "$sim" dev.zinc.go "zinc://127.0.0.1:$port/$code" >/dev/null
  waitfor "$t/dev.log" "started on iOS" 30 || { echo "rn-showcase did not start on the simulator: $(grep -a 'zinc dev:' "$t/dev.log" | tail -3)"; fail=1; }
  sleep 2
  xcrun simctl io "$sim" screenshot "$t/i1.png" >/dev/null 2>&1
  save "Saved again on the Mac" iOS "Create your account|Saved on the Mac" || fail=1
  sleep 0.5
  xcrun simctl io "$sim" screenshot "$t/i2.png" >/dev/null 2>&1
  [ "$(changed "$t/i1.png" "$t/i2.png" 0.12 0.2)" -gt 100 ] || { echo "the heading did not change on the simulator"; fail=1; }
  [ -n "$KEEP" ] && cp "$t"/i*.png "$KEEP"
  xcrun simctl terminate "$sim" dev.zinc.go
fi
[ $fail -eq 0 ] && echo "zinc go on the phones: ok${android:+ (Android)}${ios:+ (iOS)}"
exit $fail
