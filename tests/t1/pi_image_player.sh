#!/bin/sh
# image/player, the screen of the Zinc Pi image when its app does not run, headless, on a pretend Pi (the zinc-admin and
# nmcli of image/player/dev). Run 1: the home page with remote access off (frame 150, its animation drawn at 12 of the 60
# frames), "Turn on" shows the pairing code (350), the gear opens the Wi-Fi list (600), "Atelier" asks for its password
# with the on-screen keyboard, two keys typed on it (900), the rest from the computer's keyboard and Enter join it (1200);
# the settings page then draws at most 2 of 300 frames. Run 2: zinc-session left a crash report (frame 100); "Dismiss"
# deletes it and the home page offers the installed app, with what the boot, still starting, does beside the engine's
# version at the bottom (250); "Start the app" ends the player with exit 10, which tells
# zinc-session to start it. The frames are compared below the top bar (its clock is the machine's). Frames run unpaced
# (ZINC_PLAYER_POLL_MS lets the helpers answer). ZN_UPDATE_GOLDEN=1 writes the goldens; KEEP=dir keeps the frames.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
root=$(pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
golden=tests/golden/pi-image-player
tap() { printf '%d move %d %d\n%d down\n%d up\n' "$1" "$2" "$3" $(($1 + 1)) $(($1 + 3)); }
player() { # player <name> <frames> <shots>, input in $tmp/<name>.input
  env PATH="$root/image/player/dev/bin:$PATH" ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_FRAMES="$2" ZINC_SHOT="$tmp/$1.png" ZINC_SHOT_FRAMES="$3" \
    ZINC_INPUT="$tmp/$1.input" ZINC_PLAYER_POLL_MS=2 ZINC_PLAYER_TRACE_FRAMES=1 ZINC_VERSION=0.0.0 \
    ZINC_ADMIN="$root/image/player/dev/zinc-admin" ZINC_FAKE_PI="$tmp/pi" ZINC_PLAYER_AGENT_DIR="$tmp/pi/agent" \
    ZINC_PLAYER_CONFIG="$tmp/player.json" ZINC_RUN="$tmp/run" ZINC_APP="$tmp/app" timeout 120 "$Z" run image/player > "$tmp/$1.out" 2>&1
}
drawn() { awk -v from="$2" -v to="$3" '$1 == "drawn" && $2 >= from && $2 <= to { n++ } END { print n + 0 }' "$tmp/$1.out"; }
fail=0
mkdir -p "$tmp/run"

{ tap 160 641 325; tap 400 766 28; tap 700 400 206; tap 820 320 391; tap 828 677 277
  printf '910 text "rrect horse"\n920 key Enter\n'; } > "$tmp/wifi.input"
player wifi 1500 150,350,600,900,1200 || { echo "pi-image player: run 1 failed: $(tail -5 "$tmp/wifi.out")"; exit 1; }
n=$(drawn wifi 1 150); [ "$n" -ge 26 ] && [ "$n" -le 40 ] || { echo "pi-image player: the home page drew $n of frames 1-150, not about 30 (12 fps)"; fail=1; }
n=$(drawn wifi 1200 1499); [ "$n" -le 2 ] || { echo "pi-image player: the idle settings page drew $n of 300 frames"; fail=1; }
grep -q -- '--wait 45 device wifi connect Atelier password correct horse' "$tmp/pi/calls.log" || { echo "pi-image player: the join did not reach nmcli"; fail=1; }

mkdir -p "$tmp/app"; cp image/player/dev/crash.txt "$tmp/run/crash.txt"
printf starting > "$tmp/pi/boot.value"; printf 'Cloud-init: Network Stage' > "$tmp/pi/activity.value"
tap 110 308 407 > "$tmp/crash.input"
player crash 260 100,250 || { echo "pi-image player: run 2 failed: $(tail -5 "$tmp/crash.out")"; exit 1; }
[ ! -e "$tmp/run/crash.txt" ] || { echo "pi-image player: Dismiss left the crash report"; fail=1; }
tap 30 172 389 > "$tmp/start.input"
player start 200 199
status=$?
[ $status = 10 ] || { echo "pi-image player: Start the app ended the player with $status, not 10: $(tail -3 "$tmp/start.out")"; fail=1; }

[ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.png "$KEEP/"
for shot in wifi-150:home wifi-350:pairing wifi-600:wifi wifi-900:password wifi-1200:joined crash-100:crash crash-250:home-app; do
  frame=${shot%%:*}; name=${shot##*:}
  [ "${ZN_UPDATE_GOLDEN:-0}" = 1 ] && mkdir -p "$golden" && cp "$tmp/$frame.png" "$golden/$name.png"
  tools/pngdiff "$tmp/$frame.png" "$golden/$name.png" --crop 0,56,800,424 > /dev/null || { echo "pi-image player: frame $frame differs from $golden/$name.png"; fail=1; }
done
[ $fail = 0 ] && echo "pi-image player: ok"
exit $fail
