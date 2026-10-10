#!/bin/sh
# zinc:physics3d, 3D rigid bodies on Jolt (ZN-583.02): the plugin builds from its vendored sources (once: the library goes to the vendor archive of
# the plugin cache), and
# - tests/data/physics3d/drop.ts (every shape dropped on a floor, a mesh and a height field, a hinge and a slider with motors, a sensor, a ray, a
#   swept shape, bodies in and out of the world) prints tests/data/physics3d/drop.out on the interpreter, compiled and on QuickJS, and says itself
#   that a replay from the start and a replay from a saved state reach the same positions after 600 steps;
# - tests/data/physics3d/shots.ts fires 10,000 balls of 27 mm at 3 to 20 m/s at a 2 mm wall, a mesh ramp, a sweeping flipper and another ball:
#   every shot hits and none goes through;
# - a program that does not import the plugin carries none of it.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"$ZINC" plugin-build physics3d >"$tmp/plugin.log" 2>&1 || { echo "physics3d: the plugin does not build: $(tail -c 400 "$tmp/plugin.log")"; exit 1; }
d=tests/data/physics3d
"$ZINC" run $d/drop.ts 2>&1 | cmp -s - $d/drop.out || { echo "physics3d: drop.ts differs from drop.out on the interpreter"; fail=1; }
"$ZINC" run $d/drop.ts --engine quickjs 2>&1 | cmp -s - $d/drop.out || { echo "physics3d: drop.ts differs from drop.out on QuickJS"; fail=1; }
"$ZINC" build $d/drop.ts -o "$tmp/drop" >"$tmp/build.log" 2>&1 && "$tmp/drop" 2>&1 | cmp -s - $d/drop.out || { echo "physics3d: drop.ts differs from drop.out compiled: $(tail -c 300 "$tmp/build.log")"; fail=1; }
[ "$(grep -c 'replay from .*: identical' $d/drop.out)" = 2 ] || { echo "physics3d: drop.out does not hold the two identical replays"; fail=1; }
"$ZINC" run $d/shots.ts >"$tmp/shots.out" 2>&1
for want in "wall: 2500 shots, 2500 hits, 0 through" "ramp: 2500 shots, 2500 hits, 0 through" "balls: 2500 shots, 2500 hits, 0 through"; do
  grep -qx "$want" "$tmp/shots.out" || { echo "physics3d: shots.ts does not print '$want': $(tr '\n' ';' < "$tmp/shots.out" | head -c 300)"; fail=1; }
done
# the flipper sweeps, so a few shots pass where the blade is not: at least 2,400 of the 2,500 meet it, and none goes through
awk -F'[ ,]+' '/^flipper: 2500 shots/ { ok = ($4 >= 2400 && $6 == 0) } END { exit !ok }' "$tmp/shots.out" || { echo "physics3d: the flipper shots: $(grep flipper "$tmp/shots.out")"; fail=1; }
# only programs that import it pay for it: a program without the import has no trace of the module, and is far smaller
printf "console.log('hello');\n" > "$tmp/hello.ts"
"$ZINC" build "$tmp/hello.ts" -o "$tmp/hello" >/dev/null 2>&1 || { echo "physics3d: hello.ts does not build"; exit 1; }
grep -q "Physics3D" "$tmp/drop" || { echo "physics3d: the compiled drop.ts does not hold the module"; fail=1; }
if grep -q "Physics3D\|ZN3JPH" "$tmp/hello"; then echo "physics3d: a program that does not import the plugin holds some of it"; fail=1; fi
hello=$(wc -c < "$tmp/hello"); drop=$(wc -c < "$tmp/drop")
[ "$hello" -lt $((drop - 500000)) ] || { echo "physics3d: hello is $hello bytes, drop $drop: the plugin's code is not where expected"; fail=1; }
exit $fail
