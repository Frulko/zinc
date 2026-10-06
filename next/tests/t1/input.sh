#!/bin/sh
# Input and window (ZN-047): scripted events (ZINC_INPUT) travel through the HAL to zinc:gfx and zinc:ui exactly as a window's would. A pointer
# press on a button fills the progress bar (frames 2 and 20 equal their goldens), typed text and a Backspace reach a text field, the clipboard
# round-trips, and a run with the SDL HAL on the dummy video driver (the live path, no display needed) draws the same first frame.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
shot() {  # name, frames, input file
  ZINC_INPUT="tests/golden/ui/$3.input" ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=$2 ZINC_SHOT="$tmp/$1.png" ZINC_SHOT_FRAMES=$2 "$ZINC" run "tests/golden/ui/$1.tsx" >/dev/null 2>"$tmp/err" \
    || { echo "$1.tsx failed: $(head -c 200 "$tmp/err")"; fail=1; return; }
  tools/pngdiff "$tmp/$1-$2.png" "tests/golden/ui/$1-$2.png" >/dev/null || { echo "$1 frame $2 differs from its golden"; fail=1; }
}
shot click 2 click; shot click 20 click; shot type 20 type
printf "import { onFrame, setClipboardText, clipboardText } from 'zinc:gfx';\nonFrame((dt: number) => { setClipboardText('h\\\\u00e9llo'); console.log(clipboardText()); });\n" > "$tmp/clip.ts"
[ "$(ZINC_DETERMINISTIC=1 ZINC_FRAMES=1 "$ZINC" run "$tmp/clip.ts" 2>&1)" = "$(printf 'h\303\251llo')" ] || { echo "the clipboard does not round-trip"; fail=1; }
# fonts and images baked by the engine from the program (any text size, non-ASCII characters, an SVG of the assets directory)
ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=2 ZINC_SHOT="$tmp/res.png" ZINC_SHOT_FRAMES=2 "$ZINC" run tests/golden/res/main.ts >/dev/null 2>"$tmp/err" || { echo "res/main.ts failed: $(head -c 200 "$tmp/err")"; fail=1; }
tools/pngdiff "$tmp/res-2.png" tests/golden/res/frame-2.png >/dev/null || { echo "the baked-resources frame differs from its golden"; fail=1; }
# the window HAL (dummy video driver): the first frame is the golden one
SDL_VIDEO_DRIVER=dummy ZINC_SCALE=1 ZINC_FRAMES=1 ZINC_SHOT="$tmp/live.png" ZINC_SHOT_FRAMES=1 "$ZINC" run ../tests/visual/ui.tsx >/dev/null 2>"$tmp/err" || { echo "the live HAL run failed: $(head -c 200 "$tmp/err")"; fail=1; }
tools/pngdiff "$tmp/live-1.png" ../tests/visual/ui-1.png >/dev/null || { echo "the live HAL frame 1 differs from tests/visual/ui-1.png"; fail=1; }
exit $fail
