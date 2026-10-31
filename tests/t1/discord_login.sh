#!/bin/sh
# examples/discord's logins without a token (examples/discord/tests/login.ts): the remote-auth key exchange against vectors recorded with
# OpenSSL, then the QR code login, a wrong password, a password with a TOTP code and a captcha against the fake Discord on 127.0.0.1
# (examples/discord/tests/fake-discord.ts). No network, no window.
cd "$(dirname "$0")/../.." || exit 2
case $ZINC in /*) ;; *) ZINC=$PWD/$ZINC ;; esac
tmp=$(mktemp -d)
cleanup() { [ -n "$fake" ] && { kill "$fake" 2>/dev/null; wait "$fake" 2>/dev/null; }; rm -rf "$tmp"; }
trap cleanup EXIT
export ZINC_DETERMINISTIC=0   # real sockets and timers
FAKE_ASSETS=$PWD/examples/discord/tests/assets FAKE_PORTS_FILE=$tmp/ports timeout 60 "$ZINC" run --interp examples/discord/tests/fake-discord.ts > "$tmp/fake" 2>&1 &
fake=$!
for _ in $(seq 600); do [ -s "$tmp/ports" ] && break; sleep 0.1; done
[ -s "$tmp/ports" ] || { echo "discord_login: the fake server did not start"; exit 1; }
read -r api gw < "$tmp/ports"
out=$(env DISCORD_API="http://127.0.0.1:$api/api/v9" DISCORD_REMOTE_AUTH="ws://127.0.0.1:$gw/ra?v=2" timeout 30 "$ZINC" run examples/discord/tests/login.ts 2>&1 | grep -v '^zinc')
[ "$out" = ok ] || { echo "discord_login: $out"; grep -E '^(remote auth|rest POST)' "$tmp/fake" | head -12; exit 1; }
grep -q '^remote auth proof ok=true' "$tmp/fake" || { echo "discord_login: the fake gateway did not get the proof"; exit 1; }
