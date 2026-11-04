#!/bin/sh
# image/player's sleep (core/screen-power.ts, zinc:shell's input hook), headless on a pretend Pi. After 1 s with no input the screen fades
# to black (0.25 s) and nothing is drawn; a tap on the gear wakes it and presses nothing, the same tap once awake opens the settings;
# the Display section's delay reaches player.json. Frames are unpaced, at 1/60 s each.
# The light itself (brightness, DPMS) is display-fbdev's, on Linux: a line of backlog/later.md's cross-platform pass.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
root=$(pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
tap() { printf '%d move %d %d\n%d down\n%d up\n' "$1" "$2" "$3" $(($1 + 1)) $(($1 + 3)); }
player() { # player <name> <frames> <shots>, input in $tmp/<name>.input
  env PATH="$root/image/player/dev/bin:$PATH" ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_FRAMES="$2" ZINC_SHOT="$tmp/$1.png" ZINC_SHOT_FRAMES="$3" \
    ZINC_INPUT="$tmp/$1.input" ZINC_PLAYER_POLL_MS=2 ZINC_PLAYER_TRACE_FRAMES=1 ZINC_VERSION=0.0.0 ZINC_PLAYER_VERSION=0.0.0 \
    ZINC_ADMIN="$root/image/player/dev/zinc-admin" ZINC_FAKE_PI="$tmp/pi" ZINC_PLAYER_AGENT_DIR="$tmp/pi/agent" \
    ZINC_PLAYER_CONFIG="$tmp/player.json" ZINC_RUN="$tmp/run" ZINC_APP="$tmp/app" timeout 60 "$Z" run image/player > "$tmp/$1.out" 2>&1
}
drawn() { awk -v from="$2" -v to="$3" '$1 == "drawn" && $2 >= from && $2 <= to { n++ } END { print n + 0 }' "$tmp/$1.out"; }
same() { tools/pngdiff "$tmp/$1.png" "$tmp/$2.png" --crop 0,56,800,424 > /dev/null; }
fail=0
mkdir -p "$tmp/run"

echo '{"animation":false,"sleepDelaySeconds":1,"sleepFadeSeconds":0.25}' > "$tmp/player.json"
{ tap 200 766 28; tap 240 766 28; } > "$tmp/sleep.input"
player sleep 262 30,70,190,235,262 || { echo "pi player sleep: run failed: $(tail -5 "$tmp/sleep.out")"; exit 1; }
n=$(drawn sleep 90 199); [ "$n" = 0 ] || { echo "pi player sleep: $n frames drawn while asleep"; fail=1; }
n=$(drawn sleep 60 76); [ "$n" -ge 10 ] || { echo "pi player sleep: the fade drew $n frames of 15"; fail=1; }
same sleep-30 sleep-190 && { echo "pi player sleep: frame 190 is not dark"; fail=1; }
same sleep-70 sleep-30 && { echo "pi player sleep: frame 70 is not fading"; fail=1; }
same sleep-235 sleep-30 || { echo "pi player sleep: the tap that woke the screen pressed something"; fail=1; }
same sleep-262 sleep-30 && { echo "pi player sleep: the tap once awake did not open the settings"; fail=1; }

# the settings' Display section: the delay is saved
echo '{"animation":false,"sleepDelaySeconds":300,"sleepFadeSeconds":0}' > "$tmp/player.json"
{ tap 20 766 28; tap 60 105 260; tap 100 330 232; } > "$tmp/set.input"
player set 180 90,170 || { echo "pi player sleep: run 2 failed: $(tail -5 "$tmp/set.out")"; exit 1; }
grep -q '"sleepDelaySeconds":60' "$tmp/player.json" || { echo "pi player sleep: the delay did not reach player.json: $(cat "$tmp/player.json")"; fail=1; }
[ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.png "$KEEP/"
[ $fail = 0 ] && echo "pi player sleep: ok"
exit $fail
