#!/bin/sh
# The Discord client (examples/discord) against a fake Discord on 127.0.0.1 (examples/discord/tests/fake-discord.ts), no network: token
# login, IDENTIFY with the client identity, READY's servers, channels and DMs, a channel's history over REST, a live message from the
# gateway, a dropped connection that RESUMEs (not a new IDENTIFY) and a message after it, the DM list; then writing: read states and acks
# (MESSAGE_ACK from another device), typing both ways, a send echoed with its nonce (shown once), a reply that waits for its emptied
# rate-limit bucket, an edit refused once with a 429 and retried after retry_after, a delete, Discord Markdown; then pictures, files and
# members: the member list (op 37, a SYNC, an INSERT and an UPDATE), the page of history before the first, a file sent with the cloud upload
# (attachments, PUT to the upload URL, the message), the avatars, server icon, custom emoji and photos from the fake CDN, one emoji from the
# disk cache (seeded here: never asked of the CDN), an expired attachment URL renewed with refresh-urls, and the files the cache kept; then
# notifications (none for the channel shown in the focused window, one for a DM behind another window, a click that opens it, the Dock's
# badge: the calls of the zinc:system simulator); then the last frame's hash. A second run (DISCORD_DEMO=showcase, a window tall enough
# for the whole channel) shows #showcase, one message of each kind of content Discord sends (embeds, files by kind, stickers, reactions,
# a poll, system messages, replies, a forward, a command's answer, buttons, the remaining Markdown), reacts, votes, opens a thread and a
# forum; its last frame is the golden picture (ZINC_SHOT=file.png saves it to look at, and the first run's as file-session.png).
# What the app logs and what the fake server received (both sorted: the acks race the scripted session) are compared with
# tests/golden/discord. ZN_UPDATE_GOLDEN=1 records again.
cd "$(dirname "$0")/../.." || exit 2
golden=$PWD/tests/golden/discord
case $ZINC in /*) ;; *) ZINC=$PWD/$ZINC ;; esac   # the app runs from its own directory
tmp=$(mktemp -d)
cleanup() { [ -n "$fake" ] && { kill "$fake" 2>/dev/null; wait "$fake" 2>/dev/null; }; rm -rf "$tmp"; }
trap cleanup EXIT
export ZINC_BACKGROUND=1 ZINC_SYSTEM_RUNTIME_DIR=$tmp   # the app's single-instance lock, apart from any other run
export ZINC_DETERMINISTIC=0   # a networked session: the rate-limit waits and the nonces read the real clock, not the virtual one of tests/run
assets=$PWD/examples/discord/tests/assets
mkdir -p "$tmp/cache" && cp "$assets/emoji.png" "$tmp/cache/emojis_78.png" && cp "$assets/photo.png" "$tmp/notes.png"
FAKE_ASSETS=$assets FAKE_PORTS_FILE=$tmp/ports timeout 120 "$ZINC" run examples/discord/tests/fake-discord.ts > "$tmp/fake" 2>/dev/null &
fake=$!
for _ in $(seq 100); do [ -s "$tmp/ports" ] && break; sleep 0.1; done
[ -s "$tmp/ports" ] || { echo "discord: the fake server did not start"; exit 1; }
read -r api gw < "$tmp/ports"
(cd examples/discord && env ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=1200x760 ZINC_FRAMES=1000000 ZINC_FRAMEHASH=last ${ZINC_SHOT:+ZINC_SHOT=${ZINC_SHOT%.png}-session.png} \
  DISCORD_API="http://127.0.0.1:$api/api/v9" DISCORD_GATEWAY="ws://127.0.0.1:$gw" DISCORD_CDN="http://127.0.0.1:$api/cdn" \
  DISCORD_CACHE="$tmp/cache" ZINC_STORAGE="$tmp/storage.kv" ZINC_SYSTEM_LOG="$tmp/system" DISCORD_UPLOAD_FILE="$tmp/notes.png" DISCORD_TOKEN=test-token DISCORD_DEMO=1 DISCORD_LOG=1 \
  timeout 60 "$ZINC" run . > "$tmp/app" 2>&1) || { echo "discord: the session failed"; tail -8 "$tmp/app"; exit 1; }
# TZ: the Discord timestamps <t:...> are drawn in the reader's time zone
(cd examples/discord && env TZ=UTC ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=1200x4800 ZINC_FRAMES=1000000 ZINC_FRAMEHASH=last ${ZINC_SHOT:+ZINC_SHOT=$ZINC_SHOT} \
  DISCORD_API="http://127.0.0.1:$api/api/v9" DISCORD_GATEWAY="ws://127.0.0.1:$gw" DISCORD_CDN="http://127.0.0.1:$api/cdn" \
  DISCORD_CACHE="$tmp/cache2" ZINC_STORAGE="$tmp/storage2.kv" ZINC_SYSTEM_LOG="$tmp/system2" DISCORD_TOKEN=test-token DISCORD_DEMO=showcase DISCORD_LOG=1 \
  timeout 60 "$ZINC" run . > "$tmp/show" 2>&1) || { echo "discord: the showcase failed"; tail -8 "$tmp/show"; exit 1; }
{ grep -v '^zinc' "$tmp/app" | grep -v '^timing: '; grep -E '^\[system\] (dock.setBadge|notification.notify) ' "$tmp/system"; ls "$tmp/cache" | sed 's/^/cached /'; } | sort > "$tmp/session"   # sorted: the scripted session races the history request
grep -v '^zinc' "$tmp/fake" | sort > "$tmp/server"
sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p' "$tmp/app" | tail -1 > "$tmp/hash"
grep -E '^(show |sidebar |thread |forum |posts |react |reactions |vote |poll |edited 1001|pins |pin |jump)' "$tmp/show" > "$tmp/showcase"   # in the order of the session
sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p' "$tmp/show" | tail -1 > "$tmp/showhash"
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/session" "$golden/session.out"; cp "$tmp/server" "$golden/server.out"; cp "$tmp/hash" "$golden/hash.txt"
  cp "$tmp/showcase" "$golden/showcase.out"; cp "$tmp/showhash" "$golden/showcase-hash.txt"; echo "discord: goldens recorded"; exit 0; fi
fail=0
cmp -s "$tmp/session" "$golden/session.out" || { echo "discord: session differs"; diff "$golden/session.out" "$tmp/session" | head -12; fail=1; }
cmp -s "$tmp/server" "$golden/server.out" || { echo "discord: what the server received differs"; diff "$golden/server.out" "$tmp/server" | head -12; fail=1; }
cmp -s "$tmp/hash" "$golden/hash.txt" || { echo "discord: last frame $(cat "$tmp/hash"), recorded $(cat "$golden/hash.txt")"; fail=1; }
cmp -s "$tmp/showcase" "$golden/showcase.out" || { echo "discord: the showcase differs"; diff "$golden/showcase.out" "$tmp/showcase" | head -12; fail=1; }
cmp -s "$tmp/showhash" "$golden/showcase-hash.txt" || { echo "discord: showcase frame $(cat "$tmp/showhash"), recorded $(cat "$golden/showcase-hash.txt")"; fail=1; }
exit $fail
