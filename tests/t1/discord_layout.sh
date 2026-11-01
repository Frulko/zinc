#!/bin/sh
# The Discord client's layout presets (ZN-923): a theme names a layout (discord, slack, teams) that changes the structure, the colours kept.
# Each preset runs against the fake Discord (DISCORD_DEMO=layout) and prints what its screen holds: the Discord layout has the member list and
# none of the others' parts; Slack has the Channels and Huddles sections and the formatting row of the composer, no member list; Teams has the
# activity rail and the tabs row, no member list. Slack then switches to the Teams theme live (the Appearance page's call) and the structure follows.
cd "$(dirname "$0")/../.." || exit 2
case $ZINC in /*) ;; *) ZINC=$PWD/$ZINC ;; esac   # the app runs from its own directory
tmp=$(mktemp -d)
cleanup() { [ -n "$fake" ] && { kill "$fake" 2>/dev/null; wait "$fake" 2>/dev/null; }; rm -rf "$tmp"; }
trap cleanup EXIT
fail=0
export ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=0 ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=1000x760 ZINC_FRAMES=1000000
export ZINC_SYSTEM_RUNTIME_DIR=$tmp ZINC_STORAGE=$tmp/storage.kv DISCORD_CACHE=$tmp/cache DISCORD_TOKEN=test-token ZINC_LANG=en
FAKE_ASSETS=$PWD/examples/discord/tests/assets FAKE_PORTS_FILE=$tmp/ports timeout 330 "$ZINC" run --interp examples/discord/tests/fake-discord.ts > "$tmp/fake" 2>&1 &
fake=$!
for _ in $(seq 2400); do [ -s "$tmp/ports" ] && break; kill -0 $fake 2>/dev/null || break; sleep 0.1; done
[ -s "$tmp/ports" ] || { echo "discord_layout: the fake server did not start"; tail -5 "$tmp/fake"; exit 1; }
read -r api gw < "$tmp/ports"
export DISCORD_API="http://127.0.0.1:$api/api/v9" DISCORD_GATEWAY="ws://127.0.0.1:$gw" DISCORD_CDN="http://127.0.0.1:$api/cdn"
cd examples/discord || exit 2
run() {   # theme, switch-to
  DISCORD_THEME=$1 DISCORD_SWITCH=$2 DISCORD_DEMO=layout timeout 90 "$ZINC" run . 2>&1 | grep '^layout ' > "$tmp/$1"
}
want() {  # theme, line start, the rest
  grep -qF "$2: $3" "$tmp/$1" || { echo "discord_layout: $1 $2 is not '$3'"; cat "$tmp/$1"; fail=1; }
}
run discord-dark ''
want discord-dark 'layout discord channel' 'members true, tabs false, format false, channels false, huddles false, activity rail false'
run slack ''
want slack 'layout slack channel' 'members false, tabs false, format true, channels true, huddles true, activity rail false'
want slack 'layout slack dm' 'members false, tabs false, format true, channels false, huddles false, activity rail false'
run slack-dark ''
want slack-dark 'layout slack channel' 'members false, tabs false, format true, channels true, huddles true, activity rail false'
run teams ''
want teams 'layout teams channel' 'members false, tabs true, format true, channels false, huddles false, activity rail true'
run slack teams
want slack 'layout teams switched' 'members false, tabs true, format true, channels false, huddles false, activity rail true'
run teams discord-dark
want teams 'layout discord switched' 'members true, tabs false, format false, channels false, huddles false, activity rail false'
# a narrow window (320 px) shows one column at a time: the channel has its Back button and no sidebar
DISCORD_THEME=discord-dark DISCORD_DEMO=layout ZINC_SIZE=320x700 timeout 90 "$ZINC" run . 2>&1 | grep '^layout ' > "$tmp/narrow"
grep -qF 'layout discord channel: members false, tabs false, format false, channels false, huddles false, activity rail false, back true' "$tmp/narrow" || { echo "discord_layout: narrow: no Back button"; cat "$tmp/narrow"; fail=1; }
exit $fail
