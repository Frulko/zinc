#!/bin/sh
# Borders take layout space in zinc:ui's default layout (ZN-882): tests/golden/ui-border-box/main.tsx (a ring around an avatar, a fixed-size
# bordered box, per-side borders, box-content) puts each child inside its border (check.py probes the pixels), and the frame is the
# recorded hash on the interpreter, QuickJS and the AOT build.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
d=tests/golden/ui-border-box
want=$(cat $d/frame.hash)
env="ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=360x100 ZINC_FRAMES=3 ZINC_FRAMEHASH=last"
hash() { grep framehash | awk '{print $5}'; }
fail=0
hi=$(env $env ZINC_SHOT="$t/i.png" "$ZINC" run $d/main.tsx 2>&1 | hash)
python3 $d/check.py "$t/i.png" || fail=1
[ "$hi" = "$want" ] || { echo "ui_border_box: interpreter frame $hi, recorded $want"; fail=1; }
hq=$(env $env "$ZINC" run $d/main.tsx --engine quickjs 2>&1 | hash)
[ "$hq" = "$want" ] || { echo "ui_border_box: QuickJS frame $hq, recorded $want"; fail=1; }
"$ZINC" build $d/main.tsx -o "$t/app" >"$t/build.log" 2>&1 || { echo "ui_border_box: AOT build failed: $(head -c 300 "$t/build.log")"; exit 1; }
ha=$(env $env "$t/app" 2>&1 | hash)
[ "$ha" = "$want" ] || { echo "ui_border_box: AOT frame $ha, recorded $want"; fail=1; }
exit $fail
