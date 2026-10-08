#!/bin/sh
# Trace recording and replay (ZN-296): a recorded run replays with only its inputs injected and the same output hash 20 times over; a program that changed (a colour of the die) makes the replay name
# the first diverging event and its time; the trace of 60 s of the s3-matrix dice stays far below 1 MB.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
dice=$(cd ../examples/boards/s3-matrix/dice && pwd)
cat > "$tmp/long.yaml" <<Y
name: dice 60 s
project: $dice
board: $dice/board.json
steps:
  - set-control: { part-id: imu, control: shake, value: 1 }
  - wait-serial: { text: "roll 1:", timeout: 3s }
  - advance: 58s
Y
"$ZINC" sim "$tmp/long.yaml" --record "$tmp/long.zsim" >/dev/null || { echo "record failed"; exit 1; }
size=$(wc -c < "$tmp/long.zsim")
[ "$size" -lt 1048576 ] || { echo "60 s of dice are $size bytes"; exit 1; }
first=""
for i in $(seq 1 20); do
  out=$("$ZINC" sim "$tmp/long.yaml" --replay "$tmp/long.zsim" 2>&1) || { echo "replay $i: $out"; exit 1; }
  h=${out##*hash }
  [ -z "$first" ] && first=$h
  [ "$h" = "$first" ] || { echo "replay $i has another hash: $h, not $first"; exit 1; }
done
# a modified program: the die's first colour changes
mkdir -p "$tmp/dice2/src"; cp "$dice/zinc.json" "$tmp/dice2/"; cp "$dice/src/"*.ts "$tmp/dice2/src/"
sed -i.bak 's/0x30e050/0x30e051/' "$tmp/dice2/src/faces.ts"; rm "$tmp/dice2/src/faces.ts.bak"
sed "s|^project: .*|project: $tmp/dice2|" "$tmp/long.yaml" > "$tmp/long2.yaml"
out=$("$ZINC" sim "$tmp/long2.yaml" --replay "$tmp/long.zsim" 2>&1) && { echo "a modified program must not replay: $out"; exit 1; }
echo "$out" | grep -q "diverges at t=" || { echo "no divergence reported: $out"; exit 1; }
echo "sim_replay: ok ($size bytes, $first)"
