#!/bin/sh
# image/player's launcher (ZN-820), headless, on a pretend Pi whose agent holds eight apps (apps/<name>/app.json as the
# agent writes it: title, icon, when sent, dev or deployed; one sent by an older agent has none). Run 1: the home lists
# the six newest with their icons, a DEV band on the two zinc dev sent, and a + (frame 120); the + opens the launcher
# with all eight (240); Edit, the red button of "Hello" and Delete remove it from the agent's apps (480). Run 2: a
# tap on the newest app ends the player with exit 10 and its folder in next-app, which zinc-session starts. The texts
# are read from scene dumps (tools/scene-texts; a DEV band is drawn before its app's name). KEEP=dir keeps the frames.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
root=$(pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
tap() { printf '%d move %d %d\n%d down\n%d up\n' "$1" "$2" "$3" $(($1 + 1)) $(($1 + 3)); }
player() { # player <name> <frames> <shots>, input in $tmp/<name>.input
  env PATH="$root/image/player/dev/bin:$PATH" ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_FRAMES="$2" ZINC_SHOT="$tmp/$1.png" ZINC_SHOT_FRAMES="$3" \
    ZINC_SCENE_DUMP="$tmp/$1.scn" ZINC_INPUT="$tmp/$1.input" ZINC_PLAYER_POLL_MS=2 ZINC_VERSION=0.0.0 \
    ZINC_ADMIN="$root/image/player/dev/zinc-admin" ZINC_FAKE_PI="$tmp/pi" ZINC_PLAYER_AGENT_DIR="$tmp/agent" \
    ZINC_PLAYER_CONFIG="$tmp/player.json" ZINC_RUN="$tmp/run" ZINC_APP="$tmp/app" timeout 120 "$Z" run image/player > "$tmp/$1.out" 2>&1
}
texts() { python3 tools/scene-texts "$tmp/$1.scn" | tr '\n' '|'; }
fail=0
mkdir -p "$tmp/run" "$tmp/pi"
app() { # app <name> <title> <sent> <dev> [icon file]
  mkdir -p "$tmp/agent/apps/$1"; printf 'exit 0\n' > "$tmp/agent/apps/$1/run.sh"; icon=
  [ -n "$5" ] && cp "$5" "$tmp/agent/apps/$1/icon.png" && icon=icon.png
  printf '{"name":"%s","title":"%s","icon":"%s","sent":%s,"dev":%s}\n' "$1" "$2" "$icon" "$3" "$4" > "$tmp/agent/apps/$1/app.json"
}
app music Music 1761300800 false examples/music/icon.png
app kanban Kanban 1761300700 true examples/kanban/assets/icon.png
app hello Hello 1761300600 false
app carnet Carnet 1761300500 false examples/carnet/icon.png
app sketch Sketch 1761300400 true
app music-tree "Music Tree" 1761300300 false examples/music-tree/icon.png
app player "Zinc Player" 1761300200 false image/player/icon.png
mkdir -p "$tmp/agent/apps/old" "$tmp/agent/apps/.incoming-1"; touch -t 202001010000 "$tmp/agent/apps/old"

{ tap 160 668 202; tap 260 702 87; tap 330 274 132; tap 400 580 292; } > "$tmp/launcher.input"
player launcher 480 120,240,330,380,480 || { echo "player launcher: run 1 failed: $(tail -5 "$tmp/launcher.out")"; exit 1; }
home=$(texts launcher-120)
case $home in *"Your apps|Edit|Music|DEV|Kanban|Hello|Carnet|DEV|Sketch|Music Tree|All apps|"*) ;;
  *) echo "player launcher: the home does not show the six newest apps with their DEV bands and the +: $home"; fail=1 ;; esac
case $home in *"Zinc Player"*|*"|old|"*) echo "player launcher: the home shows more than six apps: $home"; fail=1 ;; esac
all=$(texts launcher-240)
case $all in *"8 apps on this device|Edit|Music|DEV|Kanban|Hello|Carnet|DEV|Sketch|Music Tree|Zinc Player|old|All apps|"*) ;;
  *) echo "player launcher: the launcher does not list the eight apps, newest first: $all"; fail=1 ;; esac
case $(texts launcher-380) in *"Delete “Hello”?"*) ;; *) echo "player launcher: no confirmation before deleting: $(texts launcher-380)"; fail=1 ;; esac
[ ! -e "$tmp/agent/apps/hello" ] || { echo "player launcher: Delete left apps/hello"; fail=1; }
case $(texts launcher-480) in *"|Hello|"*) echo "player launcher: Hello is still listed after Delete"; fail=1 ;; *"7 apps on this device"*) ;;
  *) echo "player launcher: the launcher after Delete: $(texts launcher-480)"; fail=1 ;; esac

tap 30 130 202 > "$tmp/start.input"
player start 120 120
status=$?
[ $status = 10 ] || { echo "player launcher: a tap on Music ended the player with $status, not 10: $(tail -3 "$tmp/start.out")"; fail=1; }
[ "$(cat "$tmp/run/next-app" 2>/dev/null)" = "$tmp/agent/apps/music" ] || { echo "player launcher: next-app does not name apps/music: $(cat "$tmp/run/next-app" 2>/dev/null)"; fail=1; }

[ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.png "$KEEP/"
[ $fail = 0 ] && echo "player launcher: ok"
exit $fail
