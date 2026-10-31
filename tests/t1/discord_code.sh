#!/bin/sh
# The Discord client's code tab (examples/discord/src/components/CodeInsert.tsx, src/code-session.ts) against the fake Discord: a block written in
# zinc:editor's editor is sent with its message as a fenced block with its language (the server receives it), the received block is read folded
# (Show code, more lines) and a second run unfolds it (Hide code). What the app prints is compared with tests/golden/discord-code.
# ZN_UPDATE_GOLDEN=1 records again.
cd "$(dirname "$0")/../.." || exit 2
golden=$PWD/tests/golden/discord-code
case $ZINC in /*) ;; *) ZINC=$PWD/$ZINC ;; esac   # the app runs from its own directory
tmp=$(mktemp -d)
cleanup() { [ -n "$fake" ] && { kill "$fake" 2>/dev/null; wait "$fake" 2>/dev/null; }; rm -rf "$tmp"; }
trap cleanup EXIT
export ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=0 ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=1000x700 ZINC_FRAMES=1000000
export ZINC_SYSTEM_RUNTIME_DIR=$tmp ZINC_STORAGE=$tmp/storage.kv DISCORD_CACHE=$tmp/cache DISCORD_TOKEN=test-token DISCORD_LOG=1
FAKE_ASSETS=$PWD/examples/discord/tests/assets FAKE_PORTS_FILE=$tmp/ports timeout 330 "$ZINC" run --interp examples/discord/tests/fake-discord.ts > "$tmp/fake" 2>&1 &
fake=$!
for _ in $(seq 2400); do [ -s "$tmp/ports" ] && break; kill -0 $fake 2>/dev/null || break; sleep 0.1; done
[ -s "$tmp/ports" ] || { echo "discord_code: the fake server did not start"; tail -5 "$tmp/fake"; exit 1; }
read -r api gw < "$tmp/ports"
export DISCORD_API="http://127.0.0.1:$api/api/v9" DISCORD_GATEWAY="ws://127.0.0.1:$gw" DISCORD_CDN="http://127.0.0.1:$api/cdn"
cd examples/discord || exit 2
DISCORD_DEMO=code timeout 60 "$ZINC" run . > "$tmp/app" 2>&1 || { echo "discord_code: the session failed"; tail -8 "$tmp/app"; exit 1; }
DISCORD_DEMO=code DISCORD_CODE=unfold timeout 60 "$ZINC" run . > "$tmp/unfold" 2>&1 || { echo "discord_code: the unfold run failed"; tail -8 "$tmp/unfold"; exit 1; }
cd ../.. || exit 2
{ grep -E '^(code tab|sent |unfolded)' "$tmp/app"; grep -E '^unfolded' "$tmp/unfold"; } > "$tmp/session"
if [ -n "$ZN_UPDATE_GOLDEN" ]; then mkdir -p "$golden"; cp "$tmp/session" "$golden/session.out"; echo "discord_code: golden recorded"; exit 0; fi
cmp -s "$tmp/session" "$golden/session.out" || { echo "discord_code: session differs"; diff "$golden/session.out" "$tmp/session" | head -12; exit 1; }
