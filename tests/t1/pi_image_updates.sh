#!/bin/sh
# An actual .zapp: notification -> Updates -> old release -> confirmation/cancel -> install -> local rollback.
# A second session restarts NetworkManager through the pretend helper, with an explicit confirmation.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
root=$(pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
tap() { printf '%d move %d %d\n%d down\n%d up\n' "$1" "$2" "$3" $(($1 + 1)) $(($1 + 3)); }
env ZINC_NO_UPDATE_CHECK=1 "$Z" pack image/player -o "$tmp/player.zapp" >"$tmp/pack.log" 2>&1 || { tail -10 "$tmp/pack.log"; exit 1; }
# Pure Zinc plugins are inside the bytecode: a release predating zinc:network needs no network source at runtime.
python3 - "$root" "$tmp/engine-root" <<'PY'
from pathlib import Path
import sys
root, out = map(Path, sys.argv[1:])
out.mkdir()
for path in root.iterdir():
    if not path.name.startswith('.') and path.name != 'plugins':
        (out / path.name).symlink_to(path, target_is_directory=path.is_dir())
(out / 'plugins').mkdir()
for path in (root / 'plugins').iterdir():
    if path.name != 'network':
        (out / 'plugins' / path.name).symlink_to(path, target_is_directory=path.is_dir())
PY
{
  tap 400 674 28
  tap 700 400 386
  tap 850 310 206
  tap 1100 450 265
  tap 1200 310 206
  tap 1300 310 265
  tap 1750 530 232
  tap 1850 310 291
} >"$tmp/updates.input"
env PATH="$root/image/player/dev/bin:$PATH" ZINC_ROOT="$tmp/engine-root" ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_FRAMES=2200 ZINC_SHOT="$tmp/update.png" ZINC_SHOT_FRAMES=600,1000,1650,2150 \
  ZINC_INPUT="$tmp/updates.input" ZINC_PLAYER_POLL_MS=2 ZINC_VERSION=0.6.2 ZINC_FAKE_UPDATES=1 \
  ZINC_ADMIN="$root/image/player/dev/zinc-admin" ZINC_FAKE_PI="$tmp/pi" ZINC_PLAYER_AGENT_DIR="$tmp/pi/agent" \
  ZINC_PLAYER_CONFIG="$tmp/player.json" ZINC_RUN="$tmp/run" ZINC_APP="$tmp/app" \
  ZINC_PLAYER_READY_FILE="$tmp/ready" timeout 60 "$Z" run "$tmp/player.zapp" >"$tmp/player.out" 2>&1 || { tail -10 "$tmp/player.out"; exit 1; }
fail=0
expect_call() { grep -qx "$1" "$tmp/pi/calls.log" || { echo "no helper call: $1"; fail=1; }; }
expect_call 'zinc-admin update-check'
expect_call 'zinc-admin update-install 0.5.2'
expect_call 'zinc-admin update-rollback'
[ "$(grep -c '^zinc-admin update-install' "$tmp/pi/calls.log")" = 1 ] || { echo 'Cancel installed a version or confirmation ran twice'; fail=1; }
[ "$(cat "$tmp/pi/engine.value" 2>/dev/null)" = 0.6.2 ] || { echo 'Rollback did not restore 0.6.2'; fail=1; }
[ "$(cat "$tmp/ready" 2>/dev/null)" = ready ] || { echo 'The bundled player never reported its first frame'; fail=1; }

{ tap 300 770 28; tap 600 510 94; tap 800 510 94; } >"$tmp/network.input"
env PATH="$root/image/player/dev/bin:$PATH" ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_FRAMES=1100 ZINC_SHOT="$tmp/network.png" ZINC_SHOT_FRAMES=700,1050 \
  ZINC_INPUT="$tmp/network.input" ZINC_PLAYER_POLL_MS=2 ZINC_VERSION=0.6.2 ZINC_PLAYER_UPDATE_CHECK=0 \
  ZINC_ADMIN="$root/image/player/dev/zinc-admin" ZINC_FAKE_PI="$tmp/pi" ZINC_PLAYER_AGENT_DIR="$tmp/pi/agent" \
  ZINC_PLAYER_CONFIG="$tmp/player.json" ZINC_RUN="$tmp/run" ZINC_APP="$tmp/app" \
  timeout 60 "$Z" run "$tmp/player.zapp" >"$tmp/network.out" 2>&1 || { tail -10 "$tmp/network.out"; exit 1; }
expect_call 'zinc-admin network-restart'
[ "$(grep -c '^zinc-admin network-restart' "$tmp/pi/calls.log")" = 1 ] || { echo 'Network restarted without its second press'; fail=1; }
golden=tests/golden/pi-image-updates
for shot in update-600:versions update-1000:confirm update-1650:installed update-2150:restored network-700:restart-confirm network-1050:network; do
  frame=${shot%%:*}; name=${shot##*:}
  [ "${ZN_UPDATE_GOLDEN:-0}" = 1 ] && mkdir -p "$golden" && cp "$tmp/$frame.png" "$golden/$name.png"
  tools/pngdiff "$tmp/$frame.png" "$golden/$name.png" --crop 0,56,800,424 >/dev/null || { echo "updates: $frame differs"; fail=1; }
done
[ -z "$KEEP" ] || { mkdir -p "$KEEP"; cp "$tmp"/*.png "$tmp"/*.out "$KEEP/"; cp "$tmp/pi/calls.log" "$KEEP/"; }
[ $fail = 0 ] && echo 'Pi updates: bundle, older version, confirmation, rollback and network restart ok'
exit $fail
