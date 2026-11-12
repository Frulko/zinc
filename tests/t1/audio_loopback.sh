#!/bin/sh
# Owner-selected isolated snd-aloop image only; no module, routing or service setup.
set -eu
cd "$(dirname "$0")/../.."
exec python3 tools/check-audio-loopback.py
