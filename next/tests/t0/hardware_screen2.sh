#!/bin/sh
# A second screen (ZN-759): the 3DS's bottom screen is a zinc:gfx window, as a desktop's second window is: openWindow('...', 320, 240, cb) gives an
# id, the callback draws it every frame with its own size, and the touches on it (here a ZINC_INPUT script's `window 1` events) are its pointer.
# The 3DS's HAL maps the window to the bottom screen and its stylus (targets/n3ds/hal_n3ds.cpp, hal_win_*).
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}; case $Z in /*) ;; *) Z=$PWD/$Z ;; esac
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/main.ts" <<'EOF'
import { onFrame, openWindow, frame, quit, width, height, pointerX, pointerY, pointerDown, clear } from 'zinc:gfx';
let seen = '';
const id = openWindow('Bottom screen', 320, 240, (dt: number) => {
  clear(0x223344);
  if (pointerDown() && seen === '') seen = `touch ${pointerX()} ${pointerY()} in ${width()}x${height()}`;
});
onFrame((dt: number) => {
  clear(0x000000);
  if (frame() === 5) { console.log(`window ${id > 0} top ${width()}x${height()} ${seen}`); quit(); }
});
EOF
printf '1 window 1\n1 move 100 80\n2 window 1\n2 down\n' > "$tmp/input"
got=$(cd "$tmp" && ZINC_HEADLESS=1 ZINC_SIZE=400x240 ZINC_FRAMES=10 ZINC_INPUT="$tmp/input" "$Z" run main.ts 2>&1 | grep '^window')
[ "$got" = "window true top 400x240 touch 100 80 in 320x240" ] || { echo "hardware screen2: $got"; exit 1; }
echo "hardware screen2: ok"
