#!/bin/sh
# The Discord client (examples/discord) against a fake Discord on 127.0.0.1 (examples/discord/tests/fake-discord.ts), no network: token
# login, IDENTIFY with the client identity, READY's servers, channels and DMs, a channel's history over REST, a live message from the
# gateway, a dropped connection that RESUMEs (not a new IDENTIFY) and a message after it, the DM list; then writing: read states and acks
# (MESSAGE_ACK from another device), typing both ways, a send echoed with its nonce (shown once), a reply that waits for its emptied
# rate-limit bucket, an edit refused once with a 429 and retried after retry_after, a delete, Discord Markdown; then the last frame's hash.
# What the app logs and what the fake server received (both sorted: the acks race the scripted session) are compared with
# tests/golden/discord. ZN_UPDATE_GOLDEN=1 records again.
cd "$(dirname "$0")/../.." || exit 2
golden=$PWD/tests/golden/discord
case $ZINC in /*) ;; *) ZINC=$PWD/$ZINC ;; esac   # the app runs from its own directory
tmp=$(mktemp -d)
cleanup() { [ -n "$fake" ] && { kill "$fake" 2>/dev/null; wait "$fake" 2>/dev/null; }; rm -rf "$tmp"; }
trap cleanup EXIT
export ZINC_BACKGROUND=1
export ZINC_DETERMINISTIC=0   # a networked session: the rate-limit waits and the nonces read the real clock, not the virtual one of tests/run
FAKE_PORTS_FILE=$tmp/ports timeout 120 "$ZINC" run examples/discord/tests/fake-discord.ts > "$tmp/fake" 2>/dev/null &
fake=$!
for _ in $(seq 100); do [ -s "$tmp/ports" ] && break; sleep 0.1; done
[ -s "$tmp/ports" ] || { echo "discord: the fake server did not start"; exit 1; }
read -r api gw < "$tmp/ports"
(cd examples/discord && env ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=1200x760 ZINC_FRAMES=1000000 ZINC_FRAMEHASH=last \
  DISCORD_API="http://127.0.0.1:$api/api/v9" DISCORD_GATEWAY="ws://127.0.0.1:$gw" DISCORD_TOKEN=test-token DISCORD_DEMO=1 DISCORD_LOG=1 \
  timeout 60 "$ZINC" run . > "$tmp/app" 2>&1) || { echo "discord: the session failed"; tail -8 "$tmp/app"; exit 1; }
grep -v '^zinc' "$tmp/app" | sort > "$tmp/session"   # sorted: the scripted session races the history request
grep -v '^zinc' "$tmp/fake" | sort > "$tmp/server"
sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p' "$tmp/app" | tail -1 > "$tmp/hash"
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/session" "$golden/session.out"; cp "$tmp/server" "$golden/server.out"; cp "$tmp/hash" "$golden/hash.txt"; echo "discord: goldens recorded"; exit 0; fi
fail=0
cmp -s "$tmp/session" "$golden/session.out" || { echo "discord: session differs"; diff "$golden/session.out" "$tmp/session" | head -12; fail=1; }
cmp -s "$tmp/server" "$golden/server.out" || { echo "discord: what the server received differs"; diff "$golden/server.out" "$tmp/server" | head -12; fail=1; }
cmp -s "$tmp/hash" "$golden/hash.txt" || { echo "discord: last frame $(cat "$tmp/hash"), recorded $(cat "$golden/hash.txt")"; fail=1; }
exit $fail
