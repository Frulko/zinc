#!/bin/sh
# zinc:system/media (the Media Session API: metadata, playback state, position, action handlers) against the recording simulator: the
# calls of tests/golden/system/media, the state read back, the scripted media keys reaching their handlers, the errors of a bad action
# or state. The interpreter prints <case>/expected (tests/t1/system_sim.sh adds the AOT build); QuickJS prints the same lines, its
# console lines and the simulator's interleaved in another order.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
d=tests/golden/system/media
fail=0
script="$PWD/$d/script"
ZINC_DETERMINISTIC=1 ZINC_SYSTEM_SCRIPT="$script" "$ZINC" run "$d" > "$tmp/interp" 2>&1
diff "$d/expected" "$tmp/interp" > "$tmp/diff" || { echo "system_media (interpreter):"; head -10 "$tmp/diff"; fail=1; }
ZINC_DETERMINISTIC=1 ZINC_SYSTEM_SCRIPT="$script" "$ZINC" run "$d" --engine quickjs > "$tmp/qjs" 2>&1
sort "$d/expected" > "$tmp/a"; sort "$tmp/qjs" > "$tmp/b"
diff "$tmp/a" "$tmp/b" > "$tmp/diff" || { echo "system_media (quickjs):"; head -10 "$tmp/diff"; fail=1; }
[ $fail = 0 ] && echo "system_media: ok"
exit $fail
