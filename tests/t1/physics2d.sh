#!/bin/sh
# zinc:physics2d, 2D rigid bodies on Box2D v3 (ZN-583.01): the plugin builds from its vendored sources (once: the library goes to the vendor archive
# of the plugin cache), and
# - tests/data/physics2d/drop.ts (every shape dropped in a box of a floor and a chain, two balls head on, a flipper on a revolute motor, a plunger
#   on a prismatic spring, a sensor, contact events with their impulse, rays, bodies in and out of the simulation, layers, a kinematic lift) prints
#   tests/data/physics2d/drop.out on the interpreter, compiled and on QuickJS, and says itself that a replay from the start reaches the same
#   positions after 600 steps;
# - tests/data/physics2d/shots.ts fires 10,000 balls of 27 mm at 3 to 20 m/s at a 2 mm wall, a segment, a flipper swung by its motor and another
#   ball: every shot hits and none goes through;
# - a program that does not import the plugin carries none of it.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"$ZINC" plugin-build physics2d >"$tmp/plugin.log" 2>&1 || { echo "physics2d: the plugin does not build: $(tail -c 400 "$tmp/plugin.log")"; exit 1; }
d=tests/data/physics2d
"$ZINC" run $d/drop.ts 2>&1 | cmp -s - $d/drop.out || { echo "physics2d: drop.ts differs from drop.out on the interpreter"; fail=1; }
"$ZINC" run $d/drop.ts --engine quickjs 2>&1 | cmp -s - $d/drop.out || { echo "physics2d: drop.ts differs from drop.out on QuickJS"; fail=1; }
"$ZINC" build $d/drop.ts -o "$tmp/drop" >"$tmp/build.log" 2>&1 && "$tmp/drop" 2>&1 | cmp -s - $d/drop.out || { echo "physics2d: drop.ts differs from drop.out compiled: $(tail -c 300 "$tmp/build.log")"; fail=1; }
grep -qx 'replay from the start: identical' $d/drop.out || { echo "physics2d: drop.out does not hold the identical replay"; fail=1; }
"$ZINC" run $d/shots.ts >"$tmp/shots.out" 2>&1
for want in wall segment flipper balls; do
  grep -qx "$want: 2500 shots, 2500 hits, 0 through" "$tmp/shots.out" || { echo "physics2d: shots.ts, $want: $(tr '\n' ';' < "$tmp/shots.out" | head -c 300)"; fail=1; }
done
# only programs that import it pay for it: a program without the import has no trace of the module, and is far smaller
printf "console.log('hello');\n" > "$tmp/hello.ts"
"$ZINC" build "$tmp/hello.ts" -o "$tmp/hello" >/dev/null 2>&1 || { echo "physics2d: hello.ts does not build"; exit 1; }
grep -q "Physics2D" "$tmp/drop" || { echo "physics2d: the compiled drop.ts does not hold the module"; fail=1; }
if grep -q "Physics2D\|b2CreateWorld" "$tmp/hello"; then echo "physics2d: a program that does not import the plugin holds some of it"; fail=1; fi
hello=$(wc -c < "$tmp/hello"); drop=$(wc -c < "$tmp/drop")
[ "$hello" -lt $((drop - 200000)) ] || { echo "physics2d: hello is $hello bytes, drop $drop: the plugin's code is not where expected"; fail=1; }
exit $fail
