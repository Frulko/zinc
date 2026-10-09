#!/bin/sh
# Pipelined gl.zincPresent (ZN-411): asynchronous presents show the canvas one frame late, and a canvas presented then left alone still shows
# (the host's frame-end hook takes the read); synchronous presents (deterministic runs) show it in the same frame. tests/golden/webgl-present.
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/webgl-present
hashes() { ZINC_GL_PRESENT=$1 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=64x64 ZINC_FRAMES=8 ZINC_FRAMEHASH=all "$ZINC" run $d 2>&1 | sed -n 's/^zinc: framehash \([0-9]*\) [0-9x]* /\1 /p'; }
s=$(hashes sync); a=$(hashes async)
h() { printf '%s\n' "$1" | awk -v f="$2" '$1 == f { print $2 }'; }
fail=0
[ -n "$(h "$s" 1)" ] && [ "$(h "$s" 1)" != "$(h "$s" 2)" ] && [ "$(h "$s" 2)" != "$(h "$s" 3)" ] || { echo "webgl_present: the synchronous frames do not change colour: $s"; fail=1; }
for pair in "1 1" "2 1" "3 2" "4 4" "5 5" "6 5" "7 7" "8 8"; do   # async frame, the sync frame it must equal
  set -- $pair
  [ "$(h "$a" $1)" = "$(h "$s" $2)" ] || { echo "webgl_present: async frame $1 is not sync frame $2"; fail=1; }
done
exit $fail
