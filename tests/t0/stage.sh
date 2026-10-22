#!/bin/sh
# zinc:stage (ZN-774.13, lib/std/stage.ts, docs/reference/stage.md): the display tree of examples/music-tree as a standard module.
# tests/golden/stage/main.ts lays out a small tree (a column, a row with a flex child), checks the order of onAddedToStage and
# onRemovedFromStage, the AS3 names (numChildren, getChildAt, contains, stage, mouseX), the hit test, a tap, a press that moves
# (no tap), a drag in local coordinates, a scroll box that cuts its zones and scrolls, that Stage.frame draws nothing while
# nothing changed, and that Stage.drawIn (a scene inside a zinc:ui Canvas, ZN-774.19) puts the stage at its box and cuts the zones
# to it. The interpreter's output is the golden; QuickJS runs the same program and must print the same.
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}; case $Z in /*) ;; *) Z=$PWD/$Z ;; esac
dir=tests/golden/stage
fail=0
for engine in interp quickjs; do
  case $engine in interp) flag= ;; *) flag="--engine $engine" ;; esac
  got=$(ZINC_HEADLESS=1 ZINC_FRAMES=4 "$Z" run "$dir/main.ts" $flag 2>&1 | grep -v '^  \|^zinc run')
  [ "$got" = "$(cat "$dir/expected.txt")" ] || {
    echo "stage ($engine): the output differs from $dir/expected.txt:"; printf '%s\n' "$got" | diff "$dir/expected.txt" - | head -20; fail=1; }
done
[ $fail -eq 0 ] && echo "stage: ok"
exit $fail
