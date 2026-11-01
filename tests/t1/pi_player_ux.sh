#!/bin/sh
# image/player, what the screen says while it waits and when it is touched, headless, on a pretend Pi.
# Run 1: the player is the shell (ZINC_SHELL_SOCKET) and starts a stand-in app (tests/golden/shell/standin.py) whose first frame
# comes STANDIN_DELAY seconds late. Frame 20: the black area says "Starting Demo Game..." with a spinner and no second line; frame 150
# (the "slow" delay is 1 s here, ZINC_PLAYER_SLOW_START_SECONDS, 8 s on a device): the second line is there too; the last frame: the app's
# own colour fills the area and the overlay is gone. The spinner steps 12 times a second and the player draws nothing once the app shows.
# Run 2: the home page with one installed app; a pointer held DOWN on its tile (frame 40) shows the pressed tile (smaller, dimmer),
# released (frame 80) it is the normal tile again.
# KEEP=dir keeps the frames, ZN_UPDATE_GOLDEN=1 writes the goldens.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || { echo "skipped: no python3"; exit 77; }
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
root=$(pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
golden=tests/golden/pi-player-ux
mkdir -p "$tmp/home" "$tmp/app" "$tmp/run" "$tmp/pi/agent/apps/demo"
real=${ZINC_HOME:-$HOME/.zinc}
for e in "$real"/*; do [ -e "$e" ] && [ "$(basename "$e")" != agent ] && ln -s "$e" "$tmp/home/"; done
printf '#!/bin/sh\nexec python3 -I "%s" "%s"\n' "$root/tests/golden/shell/standin.py" "$tmp/app.out" > "$tmp/app/run.sh"
printf '{"title":"Demo Game"}' > "$tmp/pi/agent/apps/demo/app.json"
player() { # player <name> <frames> <shots> [env...], input in $tmp/<name>.input
  name=$1; frames=$2; shots=$3; shift 3
  env -u ZINC_DETERMINISTIC PATH="$root/image/player/dev/bin:$PATH" ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_FRAMES="$frames" ZINC_SHOT="$tmp/$name.png" ZINC_SHOT_FRAMES="$shots" \
    ZINC_INPUT="$tmp/$name.input" ZINC_PLAYER_POLL_MS=2 ZINC_PLAYER_TRACE_FRAMES=1 ZINC_VERSION=0.0.0 ZINC_PLAYER_VERSION=0.0.0 \
    ZINC_ADMIN="$root/image/player/dev/zinc-admin" ZINC_FAKE_PI="$tmp/pi" ZINC_PLAYER_AGENT_DIR="$tmp/pi/agent" \
    ZINC_PLAYER_CONFIG="$tmp/player.json" ZINC_RUN="$tmp/run" ZINC_APP="$tmp/none" ZINC_HOME="$tmp/home" "$@" timeout 100 "$Z" run image/player > "$tmp/$name.out" 2>&1
}
fail=0
: > "$tmp/start.input"
player start 3400 20,150,3300 ZINC_SHELL_SOCKET="$tmp/s.sock" ZINC_SHELL_START="$tmp/app" STANDIN_DELAY=3 ZINC_PLAYER_SLOW_START_SECONDS=1 \
  || { echo "pi player ux: run 1 failed: $(tail -5 "$tmp/start.out")"; exit 1; }
grep -q '^buffers ' "$tmp/app.out" 2>/dev/null || { echo "pi player ux: the stand-in never got its buffers: $(tail -3 "$tmp/start.out")"; exit 1; }
# the overlay is drawn at about 12 a second while it waits (frames 1-300 are 5 virtual seconds) and not at all after the first frame
n=$(awk '$1 == "drawn" && $2 >= 20 && $2 <= 140 { n++ } END { print n + 0 }' "$tmp/start.out")
[ "$n" -ge 10 ] && [ "$n" -le 32 ] || { echo "pi player ux: the loading view drew $n frames of 20-140, not about 24 (12 fps)"; fail=1; }
n=$(awk '$1 == "drawn" && $2 > 2300 { n++ } END { print n + 0 }' "$tmp/start.out")
[ "$n" -le 3 ] || { echo "pi player ux: $n frames drawn in 2300-3400, after the app showed"; fail=1; }

printf '{"animation":false}' > "$tmp/player.json"   # nothing moves behind the tile
printf '30 move 131 202\n40 down\n70 move 500 420\n80 up\n' > "$tmp/press.input"
player press 120 20,60,110; st=$?; [ $st = 0 ] || { echo "pi player ux: run 2 failed ($st): $(grep -v "^drawn" "$tmp/press.out" | tail -5)"; exit 1; }

[ -z "$KEEP" ] || { mkdir -p "$KEEP"; cp "$tmp"/*.png "$tmp"/*.out "$KEEP/"; }
for shot in start-20:loading start-150:loading-slow start-3300:started press-20:tile press-60:tile-pressed press-110:tile-released; do
  frame=${shot%%:*}; name=${shot##*:}
  [ "${ZN_UPDATE_GOLDEN:-0}" = 1 ] && mkdir -p "$golden" && cp "$tmp/$frame.png" "$golden/$name.png"
  tools/pngdiff "$tmp/$frame.png" "$golden/$name.png" --crop 0,56,800,424 > /dev/null || { echo "pi player ux: frame $frame differs from $golden/$name.png"; fail=1; }
done
# released, the tile is the one of before the press; pressed, it is not
tools/pngdiff "$tmp/press-110.png" "$tmp/press-20.png" --crop 85,160,100,100 > /dev/null || { echo "pi player ux: the tile did not return to normal"; fail=1; }
tools/pngdiff "$tmp/press-60.png" "$tmp/press-20.png" --crop 85,160,100,100 > /dev/null && { echo "pi player ux: a pressed tile looks like a normal one"; fail=1; }
[ $fail = 0 ] && echo "pi player ux: ok"
exit $fail
