#!/bin/sh
set -eu
cd "${ZINC_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)}"
timeout 10 node --no-warnings tests/native/discord_video_capability.mjs
