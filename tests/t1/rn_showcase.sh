#!/bin/sh
# The React Native showcase (examples/rn-showcase): a kitchen-sink app in the React model with zinc:react-native, in the react-native preset, no class
# string and no kit. Every tab and the stack screens render to their recorded frame hashes (tests/golden/rn-showcase/hashes.txt: screen, scheme, hash,
# frames), one compiled run gives the interpreter's hash, idle screens allocate nothing per frame, and scripted sessions on the mock network
# (ZINC_INPUT, SHOWCASE_LOG=1 lines in session.out): the sign-up form refuses a missing field then submits, the WebSocket mock feed connects, ticks
# and echoes, a note added on the Data screen is still there after a restart (same ZINC_STORAGE), the camera page shows the simulated preview and
# takes a photo. ZN_UPDATE_GOLDEN=1 records the hashes and session.out again.
cd "$(dirname "$0")/../.." || exit 2
app=$PWD/examples/rn-showcase; golden=$PWD/tests/golden/rn-showcase
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
if grep -rnE 'class=|className=|zinc:ui/kit|std/kit' "$app/src" >/dev/null; then echo "rn-showcase uses a class string or the kit: $(grep -rnE 'class=|className=|zinc:ui/kit' "$app/src" | head -3)"; fail=1; fi
grep -q '"preset": "react-native"' "$app/zinc.json" || { echo "rn-showcase is not in the react-native preset"; fail=1; }
# run <screen> <frames> [input] [store]: the app headless and deterministic on the mock network, fresh storage unless a store name is given
run() {
  [ -n "$4" ] || rm -f "$tmp/s.kv"
  (cd "$app" && env ZINC_STORAGE="$tmp/${4:-s}.kv" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=420x860 ZINC_FRAMES=$2 ZINC_FRAMEHASH=last \
    SHOWCASE_LOG=1 SHOWCASE_SCREEN=$1 SHOWCASE_SCHEME=${SCHEME:-light} ${3:+ZINC_INPUT=$golden/$3} "$ZINC" run $FLAGS . 2>&1)
}
hash() { echo "$1" | sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p'; }

# every tab and stack screen (Platform and About show the host: not recorded)
: > "$tmp/hashes"
while read -r screen scheme want frames; do
  got=$(hash "$(SCHEME=$scheme run "$screen" "${frames:-20}")")
  echo "$screen $scheme $got ${frames:-20}" >> "$tmp/hashes"
  [ "$got" = "$want" ] || { [ -n "$ZN_UPDATE_GOLDEN" ] || echo "rn-showcase $screen $scheme: $got, recorded $want"; fail=1; }
done < "$golden/hashes.txt"
# the compiled program draws what the interpreter draws (a few frames, one hash)
read -r screen scheme want frames < "$golden/hashes.txt"
got=$(hash "$(FLAGS=--native run "$screen" 20)")
[ "$got" = "$want" ] || { echo "rn-showcase compiled $screen: $got, interpreter recorded $want"; fail=1; }

# idle: a screen at rest allocates nothing per frame (SHOWCASE_IDLE counts 300 frames; the probe's own closure is 3). Screens with a FlatList are left
# out: a virtual list at rest still allocates 2 objects a frame on the interpreter (an engine gap, not the app)
for screen in home components forms more more/motion; do
  out=$(cd "$app" && rm -f "$tmp/i.kv" && ZINC_STORAGE="$tmp/i.kv" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=420x860 ZINC_FRAMES=400 SHOWCASE_SCREEN=$screen SHOWCASE_IDLE=300 "$ZINC" run . 2>&1 | grep '^idle')
  n=$(echo "$out" | sed -n 's/^idle 300 frames: \([0-9]*\) allocations/\1/p')
  [ -n "$n" ] && [ "$n" -le 10 ] || { echo "rn-showcase $screen at rest: ${out:-no idle line}"; fail=1; }
done

# scripted sessions
: > "$tmp/session"
log() { echo "$2" | grep -vE '^  |^zinc' | sed "s/^/$1: /" >> "$tmp/session"; }
log forms "$(run forms 260 forms.input)"
log feed "$(run network 330 feed.input)"
rm -f "$tmp/notes.kv"
log notes "$(run more/data 60 notes.input notes)"
log restart "$(run more/data 20 '' notes)"
log camera "$(run more/camera 90 camera.input)"
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/hashes" "$golden/hashes.txt"; cp "$tmp/session" "$golden/session.out"; echo "rn-showcase: goldens recorded"; exit 0; fi
cmp -s "$tmp/session" "$golden/session.out" || { echo "rn-showcase sessions differ:"; diff "$golden/session.out" "$tmp/session" | head -12; fail=1; }
[ $fail -eq 0 ] && echo "rn showcase: ok"
exit $fail
