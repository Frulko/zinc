#!/bin/sh
# One small native provider regression; public engine/trust proofs are recorded in ZN-1130.
set -eu
cd "${ZINC_ROOT:-$(dirname "$0")/../..}"
tmp=${FS_LOCK_TEST_DIR:-$(mktemp -d)}
if [ -z "${FS_LOCK_TEST_DIR:-}" ]; then trap 'rm -rf "$tmp"' EXIT HUP INT TERM; fi
mkdir -p "$tmp/data"
${CXX:-c++} -std=c++17 -Wall -Wextra -Werror -pthread -I src -I include tests/native/fs_lock.cpp -o "$tmp/fs_lock"
timeout 10 "$tmp/fs_lock" "$tmp/data"
${CXX:-c++} -std=c++17 -Wall -Wextra -Werror -I include tests/native/fs_lock_wasi.cpp -o "$tmp/fs_lock_wasi"
timeout 10 "$tmp/fs_lock_wasi"
timeout 10 node tests/native/fs_lock_web.mjs
${CXX:-c++} -std=c++20 -Wall -Wextra -Werror -I src -I include -I runtime/include tests/native/fs_lock_console.cpp "$(dirname "$ZINC")/libzn_zpk.a" "$(dirname "$ZINC")/libzn_zstd.a" "$(dirname "$ZINC")/libzn_lz4.a" "$(dirname "$ZINC")/libzn_sha256.a" -o "$tmp/fs_lock_console"
timeout 10 "$tmp/fs_lock_console"

mkdir -p "$tmp/project/allowed" "$tmp/project/outside" "$tmp/project/assets"
cp tests/data/fs_lock/main.ts "$tmp/project/main.ts"
ln -s stable.lock "$tmp/project/allowed/link.lock"
ln -s ../outside "$tmp/project/allowed/escape"
python3 - "$tmp/project" <<'JSON'
from pathlib import Path
import json, sys
root=Path(sys.argv[1]).resolve()
(root/'zinc.json').write_text(json.dumps({'name':'fs-lock','entry':'main.ts','permissions':['fs:read','fs:write:'+str(root/'allowed')]}))
JSON
FS_LOCK_DIR="$(cd "$tmp/project/allowed" && pwd)" ZINC_PERMISSIONS=enforce ZINC_HEADLESS=1 ZINC_BACKGROUND=1 timeout 10 "$ZINC" run "$tmp/project" --interp
