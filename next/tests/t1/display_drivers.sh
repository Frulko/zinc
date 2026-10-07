#!/bin/sh
# Display drivers (ZN-104): zinc.json `display` (or the board's, or ZINC_DISPLAY) builds the driver plugin into the cache and loads it. The three emulator drivers open their window
# (SDL's dummy video driver here) for the board and LED examples and draw the program's frame; the remote display and its viewer, two programs on loopback, end on the same pixels.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null && command -v python3 >/dev/null || { echo "skipped: no C++ compiler or python3"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"; [ -z "$srv" ] || kill "$srv" 2>/dev/null' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
distinct() { python3 -c "
import sys
d = open(sys.argv[1], 'rb').read()
off = int.from_bytes(d[10:14], 'little')
px = d[off:]
print(len({px[i:i+3] for i in range(0, len(px) - 2, 3)}))" "$1"; }
for e in led/scroll-text:ws2812:'ws2812: 32x8' led/oled-clock:ssd1306:'ssd1306: 128x64' boards/scrollphat/badge:scrollphat:'scrollphat: 11x5' boards/s3-matrix/dice:ws2812:'ws2812: 8x8'; do
  ex=${e%%:*}; rest=${e#*:}; drv=${rest%%:*}; want=${rest#*:}
  rm -f "$tmp/shot.bmp"
  out=$(SDL_VIDEODRIVER=dummy ZINC_DISPLAY=$drv ZINC_FRAMES=20 ZINC_SHOT="$tmp/shot.bmp" "$ZINC" run "../examples/$ex" 2>&1)
  case "$out" in *"SDL"*"not"*|*"SDL_Init"*) echo "skipped: no SDL here"; exit 77 ;; esac
  echo "$out" | grep -q "$want" || { echo "$ex: the driver did not start ($want): $(echo "$out" | head -c 300)"; fail=1; continue; }
  [ -s "$tmp/shot.bmp" ] && [ "$(distinct "$tmp/shot.bmp")" -ge 2 ] || { echo "$ex: the emulator window shows no picture"; fail=1; }
done
# remote display pair (zinc:remote refuses a deterministic run: it is real network I/O): a still scene served by display-remote, a viewer that saves what it shows; the reference is the same scene rendered headless
port=$(python3 -c "import socket; s = socket.socket(); s.bind(('127.0.0.1', 0)); print(s.getsockname()[1])")
ZINC_HEADLESS=1 ZINC_FRAMES=10 ZINC_SHOT="$tmp/ref.png" ZINC_SHOT_FRAMES=10 "$ZINC" run tests/golden/host/remote_scene.ts >/dev/null 2>&1
env -u ZINC_DETERMINISTIC ZINC_DISPLAY=remote ZINC_REMOTE_PORT=$port ZINC_FRAMES=600 "$ZINC" run tests/golden/host/remote_scene.ts >"$tmp/srv.log" 2>&1 &
srv=$!
n=0; until grep -q "display-remote" "$tmp/srv.log" 2>/dev/null; do n=$((n + 1)); [ $n -gt 600 ] && break; sleep 0.2; done
env -u ZINC_DETERMINISTIC RV_SHOT="$tmp/rv.png" RV_PORT=$port ZINC_HEADLESS=1 ZINC_FRAMES=100000 timeout 90 "$ZINC" run tests/golden/host/remote_viewer.ts >"$tmp/rv.log" 2>&1
[ -s "$tmp/rv.png" ] || { echo "the viewer saved no picture: $(head -c 300 "$tmp/rv.log") $(head -c 300 "$tmp/srv.log")"; exit 1; }
[ "$(shasum "$tmp/rv.png" | cut -d' ' -f1)" = "$(shasum "$tmp/ref-10.png" | cut -d' ' -f1)" ] || tools/pngdiff "$tmp/rv.png" "$tmp/ref-10.png" >/dev/null || { echo "the viewer's frame differs from the server's"; fail=1; }
exit $fail
