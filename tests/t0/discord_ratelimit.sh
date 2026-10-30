#!/bin/sh
# examples/discord: the rate-limit logic (examples/discord/tests/rate-limits.ts): the global 50 a second, the gateway's sends a minute,
# routes by major id, the plain errors for a captcha, a 401 and a 429. No network.
cd "$(dirname "$0")/../.." || exit 2
out=$("$ZINC" run --interp examples/discord/tests/rate-limits.ts 2>&1 | grep -v '^zinc')
[ "$out" = ok ] || { echo "discord_ratelimit: $out"; exit 1; }
