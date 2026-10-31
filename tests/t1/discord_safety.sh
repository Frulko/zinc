#!/bin/sh
# The Discord client's safety model (examples/discord/src/safety, docs/reports/discord-safety-model.md) against the fake Discord with
# FAKE_GUARDS=1: a launch that identifies and quits, a second launch a moment later that resumes the session (READY read back, RESUME, no
# IDENTIFY), then the scripted session of src/safety-session.ts (a read-only channel, a blocked person's DM, a slowmode, a repeated text,
# too many mentions, a burst of reactions, a loop of history pages, a captcha, a long 429, op 9 d:false, a 401) while a second instance
# is started and refused. What the app prints and what the fake received (the writes, the pages, IDENTIFY and RESUME; sorted) are compared
# with tests/golden/discord-safety. ZN_UPDATE_GOLDEN=1 records again.
cd "$(dirname "$0")/../.." || exit 2
golden=$PWD/tests/golden/discord-safety
case $ZINC in /*) ;; *) ZINC=$PWD/$ZINC ;; esac   # the app runs from its own directory
tmp=$(mktemp -d)
cleanup() { for p in $fake $app; do kill "$p" 2>/dev/null; wait "$p" 2>/dev/null; done; rm -rf "$tmp"; }
trap cleanup EXIT
export ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=0 ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=1200x760 ZINC_FRAMES=1000000
export ZINC_SYSTEM_RUNTIME_DIR=$tmp ZINC_STORAGE=$tmp/storage.kv ZINC_SYSTEM_LOG=$tmp/system DISCORD_CACHE=$tmp/cache DISCORD_TOKEN=test-token DISCORD_LOG=1
FAKE_GUARDS=1 FAKE_ASSETS=$PWD/examples/discord/tests/assets FAKE_PORTS_FILE=$tmp/ports timeout 90 "$ZINC" run examples/discord/tests/fake-discord.ts > "$tmp/fake" 2>/dev/null &
fake=$!
for _ in $(seq 600); do [ -s "$tmp/ports" ] && break; sleep 0.1; done
[ -s "$tmp/ports" ] || { echo "discord_safety: the fake server did not start"; exit 1; }
read -r api gw < "$tmp/ports"
export DISCORD_API="http://127.0.0.1:$api/api/v9" DISCORD_GATEWAY="ws://127.0.0.1:$gw" DISCORD_CDN="http://127.0.0.1:$api/cdn"
cd examples/discord || exit 2
DISCORD_DEMO=restart timeout 30 "$ZINC" run . > "$tmp/first" 2>&1 || { echo "discord_safety: the first launch failed"; tail -5 "$tmp/first"; exit 1; }
DISCORD_DEMO=restart timeout 30 "$ZINC" run . > "$tmp/second" 2>&1 || { echo "discord_safety: the second launch failed"; tail -5 "$tmp/second"; exit 1; }
DISCORD_DEMO=safety timeout 60 "$ZINC" run . > "$tmp/safety" 2>&1 &
app=$!
for _ in $(seq 200); do grep -q '^safety: ready' "$tmp/safety" && break; sleep 0.1; done
DISCORD_DEMO=restart timeout 30 "$ZINC" run . > "$tmp/again" 2>&1
wait "$app" || { echo "discord_safety: the session failed"; tail -8 "$tmp/safety"; exit 1; }
app=
cd ../.. || exit 2
{ grep -E '^(restart|session): ' "$tmp/first" | sed 's/^/first /'; grep -E '^(restart|session): ' "$tmp/second" | sed 's/^/second /'
  grep -E '^discord: ' "$tmp/again" | sed 's/^/again /'; grep -E '^(safety|session): ' "$tmp/safety"; } > "$tmp/session"
grep -E '^(identify|resume) |^rest (POST|PUT|PATCH|DELETE) |^rest GET .*before=' "$tmp/fake" | sort > "$tmp/server"
if [ -n "$ZN_UPDATE_GOLDEN" ]; then mkdir -p "$golden"; cp "$tmp/session" "$golden/session.out"; cp "$tmp/server" "$golden/server.out"; echo "discord_safety: goldens recorded"; exit 0; fi
fail=0
cmp -s "$tmp/session" "$golden/session.out" || { echo "discord_safety: session differs"; diff "$golden/session.out" "$tmp/session" | head -12; fail=1; }
cmp -s "$tmp/server" "$golden/server.out" || { echo "discord_safety: what the server received differs"; diff "$golden/server.out" "$tmp/server" | head -12; fail=1; }
exit $fail
