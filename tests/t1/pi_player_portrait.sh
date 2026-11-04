#!/bin/sh
# image/player on a narrow screen (480x800: the Pi's panel turned by ZINC_ROTATE=90), headless, on a pretend Pi with eight apps:
# the home page wraps its tiles into a grid, the card puts its button under its text and the footer takes two lines; Settings
# turns its sidebar into a row of tabs under the bar; the loading view of an app that is starting is centred in the narrow area.
# The frames are compared below the top bar (its clock is the machine's). Landscape stays as tests/t1/pi_image_player.sh has it.
# KEEP=dir keeps the frames, ZN_UPDATE_GOLDEN=1 writes the goldens.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || { echo "skipped: no python3"; exit 77; }
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
root=$(pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
golden=tests/golden/pi-player-portrait
mkdir -p "$tmp/home" "$tmp/app" "$tmp/run" "$tmp/pi/agent/apps"
real=${ZINC_HOME:-$HOME/.zinc}
for e in "$real"/*; do [ -e "$e" ] && [ "$(basename "$e")" != agent ] && ln -s "$e" "$tmp/home/"; done
n=0
for name in Fatty just-giants Clearly redbox Pixelart Minuit extra1 extra2; do
  mkdir -p "$tmp/pi/agent/apps/$name"; printf '{"title":"%s","sent":%d}' "$name" $((2000000000 - n)) > "$tmp/pi/agent/apps/$name/app.json"; n=$((n + 1))
done
printf '#!/bin/sh\nexec python3 -I "%s" "%s"\n' "$root/tests/golden/shell/standin.py" "$tmp/app.out" > "$tmp/app/run.sh"
printf '{"animation":false}' > "$tmp/player.json"
: > "$tmp/input"
player() { # player <name> <frames> <shots> [env...]
  name=$1; frames=$2; shots=$3; shift 3
  env -u ZINC_DETERMINISTIC PATH="$root/image/player/dev/bin:$PATH" ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=480x800 ZINC_FRAMES="$frames" ZINC_SHOT="$tmp/$name.png" ZINC_SHOT_FRAMES="$shots" \
    ZINC_INPUT="$tmp/input" ZINC_PLAYER_POLL_MS=2 ZINC_VERSION=0.0.0 ZINC_PLAYER_VERSION=0.0.0 \
    ZINC_ADMIN="$root/image/player/dev/zinc-admin" ZINC_FAKE_PI="$tmp/pi" ZINC_PLAYER_AGENT_DIR="$tmp/pi/agent" \
    ZINC_PLAYER_CONFIG="$tmp/player.json" ZINC_RUN="$tmp/run" ZINC_APP="$tmp/none" ZINC_HOME="$tmp/home" "$@" timeout 100 "$Z" run image/player > "$tmp/$name.out" 2>&1 \
    || { echo "pi player portrait: run $name failed: $(tail -5 "$tmp/$name.out")"; exit 1; }
}
player home 80 80
player settings 80 80 ZINC_PLAYER_START_PAGE=settings:display
player apps 80 80 ZINC_PLAYER_START_PAGE=apps
player loading 30 20 ZINC_SHELL_SOCKET="$tmp/s.sock" ZINC_SHELL_START="$tmp/app" STANDIN_DELAY=3
[ -z "$KEEP" ] || { mkdir -p "$KEEP"; cp "$tmp"/*.png "$KEEP/"; }
fail=0
for shot in home-80:home settings-80:settings apps-80:apps loading-20:loading; do
  frame=${shot%%:*}; name=${shot##*:}
  [ "${ZN_UPDATE_GOLDEN:-0}" = 1 ] && mkdir -p "$golden" && cp "$tmp/$frame.png" "$golden/$name.png"
  tools/pngdiff "$tmp/$frame.png" "$golden/$name.png" --crop 0,56,480,744 > /dev/null || { echo "pi player portrait: frame $frame differs from $golden/$name.png"; fail=1; }
done
[ $fail = 0 ] && echo "pi player portrait: ok"
exit $fail
