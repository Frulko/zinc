#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
sh -n plugins/carplay/backend/build plugins/carplay/backend/run
python3 plugins/carplay/backend/linux/tests/bridge.py
plugins/carplay/backend/linux/bt-bridge --help >/dev/null
