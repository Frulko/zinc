#!/bin/sh
# Dead class metadata goes; signatures, inheritance, callbacks, Dyn, and runtime-created worker records remain valid.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
entry=tests/data/layout_reachability/main.ts
"$ZINC" --emit=zbc-bin "$entry" "$tmp/main.zbc"
"$ZINC" zbc --check "$tmp/main.zbc" > /dev/null
# The pair factory is called twice; its allocations stay in one shared body.
"$ZINC" --emit=zbc "$entry" > "$tmp/code"
[ "$(grep -c 'New .*[, ]Child$' "$tmp/code")" = 2 ] || { echo 'allocation-heavy helper was cloned'; exit 1; }
grep -q 'joinOwned' "$tmp/code" || { echo 'string allocation helper was cloned'; exit 1; }
! grep -q 'inlineNumber' "$tmp/code" || { echo 'numeric helper stopped inlining'; exit 1; }
python3 - "$tmp/main.zbc" <<'PY'
from pathlib import Path
import sys
b = Path(sys.argv[1]).read_bytes()
assert b'UNUSED_LAYOUT_MARKER' not in b, 'unreachable class metadata retained'
assert b'Child' in b and b'Packet' in b, 'live class or native record metadata lost'
PY
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  if ! ZINC_HEADLESS=1 timeout 60 "$ZINC" run "$entry" $engine >"$tmp/log" 2>&1; then cat "$tmp/log"; exit 1; fi
  grep -qx 'layout reachability ok' "$tmp/log"
done
# ABI/declaration inspection remains conservative even for unconstructed classes.
ZINC_HOT=1 "$ZINC" --emit=zbc-bin "$entry" "$tmp/hot.zbc"
grep -aq 'UNUSED_LAYOUT_MARKER' "$tmp/hot.zbc"
ZN_KEEP_CPP=1 "$ZINC" build --debug "$entry" -o "$tmp/debug" > "$tmp/debug.log" 2>&1 || { cat "$tmp/debug.log"; exit 1; }
grep -aq 'UNUSED_LAYOUT_MARKER' "$tmp/debug"
