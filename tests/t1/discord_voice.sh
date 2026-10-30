#!/bin/sh
# Discord voice calls (zinc:discord-voice, examples/discord): first the RTP framing and both transport encryption modes against vectors
# recorded with Node's crypto and the audio devices a call can choose (tests/golden/host/discord_voice_rtp.ts, on AOT and the interpreter;
# the devices on QuickJS too); then the client against the fake Discord on 127.0.0.1
# (examples/discord/tests/fake-discord.ts) with the fake microphone, no device: Lounge joined with op 4, the voice gateway v8 (Identify,
# Ready, IP discovery over UDP, Select Protocol, Session Description), our tone encrypted, sent, opened by the fake and sent back as Grace
# (her speaking ring), our fake camera encoded (H.264), sent and sent back as Grace's (op 12), decoded at her tile's size (op 15), not
# decoded while minimized, then off; the input sensitivity above our tone (nothing sent) and back with a lower input volume, mute, push-to-talk not held
# then held, deafen, the Voice & audio settings kept, leaving, and a DM call that rings. What the app prints and what the fake received
# (sorted: the two race) are compared with tests/golden/discord-voice; DISCORD_VOICE_SHOTS=dir keeps the frames of the call view and of the
# settings to look at (not compared yet). ZN_UPDATE_GOLDEN=1 records again.
cd "$(dirname "$0")/../.." || exit 2
golden=$PWD/tests/golden/discord-voice
case $ZINC in /*) ;; *) ZINC=$PWD/$ZINC ;; esac   # the app runs from its own directory
tmp=$(mktemp -d)
cleanup() { [ -n "$fake" ] && { kill "$fake" 2>/dev/null; wait "$fake" 2>/dev/null; }; rm -rf "$tmp"; }
trap cleanup EXIT
export ZINC_BACKGROUND=1 ZINC_FAKE_MICROPHONE=1 ZINC_FAKE_CAMERA=1
export ZINC_DETERMINISTIC=0   # real UDP and a 20 ms media clock
fail=0
timeout 120 "$ZINC" run tests/golden/host/discord_voice_rtp.ts > "$tmp/rtp" 2>&1
timeout 120 "$ZINC" run tests/golden/host/discord_voice_rtp.ts --interp > "$tmp/rtp2" 2>&1
cmp -s "$tmp/rtp" "$tmp/rtp2" || { echo "discord_voice: the interpreter differs from AOT"; diff "$tmp/rtp" "$tmp/rtp2" | head -6; fail=1; }
# QuickJS: the device lists only (its u8[] and u32 arguments of the RTP vectors do not cross to the native side yet)
timeout 120 "$ZINC" run tests/golden/host/discord_voice_rtp.ts --engine quickjs 2>&1 | grep -E '^(inputs|outputs) ' > "$tmp/rtp3"
grep -E '^(inputs|outputs) ' "$tmp/rtp" | cmp -s - "$tmp/rtp3" || { echo "discord_voice: QuickJS lists other devices"; cat "$tmp/rtp3"; fail=1; }
mkdir -p "$tmp/shots"
FAKE_ASSETS=$PWD/examples/discord/tests/assets FAKE_PORTS_FILE=$tmp/ports timeout 120 "$ZINC" run examples/discord/tests/fake-discord.ts > "$tmp/fake" 2>/dev/null &
fake=$!
for _ in $(seq 300); do [ -s "$tmp/ports" ] && break; sleep 0.1; done
[ -s "$tmp/ports" ] || { echo "discord_voice: the fake server did not start"; exit 1; }
read -r api gw < "$tmp/ports"
(cd examples/discord && env ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=1200x760 ZINC_FRAMES=1000000 \
  DISCORD_API="http://127.0.0.1:$api/api/v9" DISCORD_GATEWAY="ws://127.0.0.1:$gw" DISCORD_CDN="http://127.0.0.1:$api/cdn" \
  DISCORD_CACHE="$tmp/cache" ZINC_STORAGE="$tmp/storage.kv" ZINC_SYSTEM_LOG="$tmp/system" DISCORD_TOKEN=test-token DISCORD_DEMO=voice DISCORD_SHOTS="$tmp/shots" \
  timeout 60 "$ZINC" run . > "$tmp/app" 2>&1) || { echo "discord_voice: the session failed"; tail -8 "$tmp/app"; exit 1; }
grep '^voice' "$tmp/app" | sort > "$tmp/session"
[ -z "$DISCORD_VOICE_SHOTS" ] || cp "$tmp/shots/"*.png "$DISCORD_VOICE_SHOTS/"
sleep 0.3   # the last voice socket's close reaches the fake
grep -E '^(voice|identify|rest POST /api/v9/channels/[0-9]+/call)' "$tmp/fake" | sort > "$tmp/server"
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/rtp" "$golden/rtp.out"; cp "$tmp/session" "$golden/session.out"; cp "$tmp/server" "$golden/server.out"; echo "discord_voice: goldens recorded"; exit 0; fi
cmp -s "$tmp/rtp" "$golden/rtp.out" || { echo "discord_voice: the RTP vectors differ"; diff "$golden/rtp.out" "$tmp/rtp" | head -8; fail=1; }
cmp -s "$tmp/session" "$golden/session.out" || { echo "discord_voice: session differs"; diff "$golden/session.out" "$tmp/session" | head -12; fail=1; }
cmp -s "$tmp/server" "$golden/server.out" || { echo "discord_voice: what the server received differs"; diff "$golden/server.out" "$tmp/server" | head -12; fail=1; }
exit $fail
