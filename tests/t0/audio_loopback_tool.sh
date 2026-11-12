#!/bin/sh
# Pure capture/guard/cleanup checks, never starts audio or accesses a device.
set -eu
cd "$(dirname "$0")/../.."
timeout 10 python3 tools/check-audio-loopback.py --self-check
set +e
output=$(env -u ZINC_AUDIO_LOOPBACK_TEST timeout 5 python3 tools/check-audio-loopback.py 2>&1)
code=$?
set -e
[ "$code" = 77 ] || { printf '%s\n' "$output"; exit 1; }
printf '%s\n' "$output" | grep -q '^SKIP audio_loopback: set ZINC_AUDIO_LOOPBACK_TEST=1 '
