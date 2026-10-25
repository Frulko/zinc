#!/bin/sh
# A player runs one program after another in one process (Zinc Go, ZN-840): each program's resources put its baked fonts at the same ids,
# so the caches keyed by a font id (gfx's logical -> physical map at a pixel scale above 1, the ASCII glyph tables, the runtime TrueType
# fonts) must start again. The iPhone showed the home screen's texts in the last app's sizes. Here, at ZINC_SCALE=3: a zinc:ui program with
# small text, then one with large text, then the first again: its two frames are the same. It guards the sequence; it stayed green on this
# Mac without the fix too (the iPhone's broken home screen did not reproduce headless): the fix was proven on the iPhone 17 Pro.
cd "$(dirname "$0")/../.." || exit 2
BUILD=${BUILD:-build}
Z="${ZINC:-$BUILD/zinc}"; case "$Z" in /*) ;; *) Z="$PWD/$Z" ;; esac
[ -f "$BUILD/libzn_app_player.a" ] && [ -f "$BUILD/zn_app.link" ] || { echo "skipped: the player is not built (tools/build zn_app_player)"; exit 77; }
t=${KEEP:-$(mktemp -d)}; mkdir -p "$t"; trap 'kill $pl 2>/dev/null; wait $pl 2>/dev/null; [ -n "$KEEP" ] || rm -rf "$t"' EXIT
case $(uname) in
  Darwin) sys="-Wl,-dead_strip"; for fw in Cocoa CoreMedia CoreVideo IOKit Carbon Foundation Metal QuartzCore AppKit CoreFoundation CoreGraphics CoreServices UniformTypeIdentifiers CoreHaptics GameController ForceFeedback AudioToolbox AVFoundation CoreAudio CoreBluetooth CoreMotion OpenGL; do sys="$sys -framework $fw"; done; sys="$sys -lobjc" ;;
  *) sys="-Wl,--gc-sections -ldl -lm -lpthread" ;;
esac
printf '#include "zn/app.h"\nint main(int argc, char** argv) { return zn_app_main(argc, argv); }\n' > "$t/main.cpp"
c++ -std=c++20 -O1 -w -I include "$t/main.cpp" "$BUILD/libzn_app_player.a" $(tr '\n' ' ' < "$BUILD/zn_app.link") $sys -o "$t/player" 2>"$t/link.log" || { echo "linking the player failed: $(head -5 "$t/link.log")"; exit 1; }
mkdir -p "$t/phone" "$t/work"
env -u ZINC_DETERMINISTIC ZINC_HEADLESS=1 ZINC_SCALE=3 ZINC_FRAMES=2000000000 ZINC_GO_HOME="$t/none.unit" ZINC_PLAYER_HOME="$t/phone" ZINC_PLAYER_CODE=123456 \
  ZINC_PLAYER_PORT=0 ZINC_PLAYER_BIND=127.0.0.1 ZINC_PLAYER_NAME=zn-fonts "$t/player" > "$t/player.log" 2>&1 & pl=$!
n=0; while [ $n -lt 200 ] && ! grep -q "listening on" "$t/player.log"; do sleep 0.05; n=$((n+1)); done
port=$(sed -n 's/.*listening on [0-9.]*:\([0-9]*\).*/\1/p' "$t/player.log" | head -1)
[ -n "$port" ] || { echo "zinc go fonts: the player did not listen: $(cat "$t/player.log")"; exit 1; }
dev() { ZINC_HOME="$t/work" timeout 60 "$Z" device "$@"; }
dev pair "127.0.0.1:$port" 123456 >/dev/null 2>&1 || { echo "zinc go fonts: pairing failed"; exit 1; }

app() {   # app <name> <font size>: a line of zinc:ui text in that size (drawn through the runtime's commands, which map fonts at the pixel scale)
  mkdir -p "$t/$1/src"
  printf '{ "name": "%s", "entry": "src/main.tsx", "ui": { "preset": "react-native" } }\n' "$1" > "$t/$1/zinc.json"
  printf 'import { render } from "zinc:ui/react";\nimport { View, Text } from "zinc:react-native";\nfunction App() { return <View style={{ flex: 1, padding: 10 }}><Text style={{ fontSize: %s, color: 0x111111 }}>Zinc Go 0123</Text></View>; }\nrender(App, 0xFFFFFF, null);\n' "$2" > "$t/$1/src/main.tsx"
}
shot() { sleep 0.6; (cd "$t" && dev shot "$1" "$2") >/dev/null 2>"$t/shot.err" || { echo "zinc go fonts: shot of $1: $(cat "$t/shot.err")"; exit 1; }; }
# the iPhone's sequence: a React Native screen (bold text rasterized from its TrueType files at scale 3), bouncing-ball (zinc:gfx's own
# font), the screen again; and two zinc:ui programs whose fonts differ in size
app small 14; app large 40
mkdir -p "$t/home/src"   # the home screen's styles: bold titles and buttons
printf '{ "name": "home", "entry": "src/main.tsx", "ui": { "preset": "react-native" } }\n' > "$t/home/zinc.json"
printf 'import { render } from "zinc:ui/react";\nimport { View, Text } from "zinc:react-native";\nfunction App() { return <View style={{ flex: 1, padding: 10, gap: 8 }}><Text style={{ fontSize: 32, fontWeight: "800", color: 0x111111 }}>Zinc Go</Text><Text style={{ fontSize: 17, fontWeight: "700", color: 0x0EA5E9 }}>Scan QR code</Text><Text style={{ fontSize: 15, color: 0x555555 }}>Run your project</Text></View>; }\nrender(App, 0xFFFFFF, null);\n' > "$t/home/src/main.tsx"
for first in "$t/home" "$t/small"; do
  name=$(basename "$first")
  dev deploy "$first" --no-logs >/dev/null 2>"$t/d.err" || { echo "zinc go fonts: deploy $name: $(cat "$t/d.err")"; exit 1; }
  shot "$name" first.png
  for other in "$PWD/examples/bouncing-ball" "$t/large"; do
    dev deploy "$other" --no-logs >/dev/null 2>"$t/d.err" || { echo "zinc go fonts: deploy $other: $(cat "$t/d.err")"; exit 1; }
    sleep 0.6
  done
  dev run "$name" >/dev/null 2>&1
  shot "$name" again.png
  cmp -s "$t/first.png" "$t/again.png" || { echo "zinc go fonts: $name is drawn differently after bouncing-ball and large ran (stale font caches)"; cp "$t/first.png" "$t/$name-first.png"; cp "$t/again.png" "$t/$name-again.png"; exit 1; }
done
echo "zinc go fonts: ok"
