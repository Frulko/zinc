#!/bin/sh
# Asset hot reload in zinc dev (ZN-450): game-2d runs under zinc dev and scores, then its player sprite is redrawn bigger and in another colour:
# within 1 s the running program draws the new sprite (the atlas rebuilt, its page and frame table swapped in) with the score kept and no
# restart; a change of colour in scenes.ts is swapped in with the play scene and its score kept (ZN-742). Headless frames run as fast as they can: shots every 20000 frames, a round longer than the test.
cd "$(dirname "$0")/../.." || exit 2
Z="$ZINC"; case "$Z" in /*) ;; *) Z="$PWD/$Z" ;; esac
root=$PWD
t=$(mktemp -d); trap 'kill $dev 2>/dev/null; rm -rf "$t"' EXIT
fail=0
now_ms() { python3 -c 'import time; print(int(time.time()*1000))'; }
waitfor() { # file pattern seconds
  n=0; while [ $n -lt $(( $3 * 20 )) ]; do grep -q "$2" "$1" 2>/dev/null && return 0; sleep 0.05; n=$((n+1)); done; return 1; }
latest() { ls "$t/shots" | sed -n 's/^f-\([0-9]*\)\.png$/\1/p' | sort -n | tail -1; }
newer() { # frame seconds: waits for a shot after that frame, prints its frame
  n=0; while [ $n -lt $(( $2 * 20 )) ]; do l=$(latest); [ "${l:-0}" -gt "$1" ] && { sleep 0.1; echo "$l"; return 0; }; sleep 0.05; n=$((n+1)); done; return 1; }
# pix count FILE RRGGBB: pixels of that colour (within 3 per channel); pix hud FILE: a digest of the bar's left part (the score, not the clock)
pix() { python3 - "$root" "$@" <<'P'
import sys, hashlib, importlib.machinery, importlib.util
l = importlib.machinery.SourceFileLoader("pd", sys.argv[1] + "/tools/pngdiff"); s = importlib.util.spec_from_loader("pd", l); m = importlib.util.module_from_spec(s); l.exec_module(m)
w, h, b, d = m.dec(sys.argv[3])
if sys.argv[2] == "count":
    c = [int(sys.argv[4][i:i + 2], 16) for i in (0, 2, 4)]
    print(sum(1 for i in range(0, w * h * b, b) if all(abs(d[i + k] - c[k]) <= 3 for k in range(3))))
else:
    print(hashlib.sha1(b"".join(bytes(d[(y * w) * b:(y * w + 300) * b]) for y in range(40))).hexdigest())
P
}
cd "$t" && "$Z" new game-2d app >/dev/null && cd app || exit 2
sed -i.bak 's/ROUND = 30;/ROUND = 100000;/' src/world.ts && rm src/world.ts.bak
python3 - > "$t/input.txt" <<'P'
# the pointer held on the first coin of the seeded world (640x400): a click starts the game, the player goes there and scores
s = 7
def r():
    global s
    s = s * 16807 % 2147483647
    return s / 2147483647
x = 16 + r() * (640 - 20 - 32); y = 56 + r() * (400 - 20 - 72)
print(f"1 move {x + 10:.0f} {y + 10:.0f}\n2 down")
P
mkdir -p "$t/shots"
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=2000000000 ZINC_SHOT="$t/shots/f.png" ZINC_SHOT_FRAMES=10 ZINC_SHOT_EVERY=20000 ZINC_SCENE_DUMP="$t/shots/s.bin" ZINC_INPUT="$t/input.txt"
"$Z" dev > "$t/dev.log" 2>&1 &
dev=$!
waitfor "$t/dev.log" "v1 started" 10 || { echo "dev did not start: $(cat "$t/dev.log")"; exit 1; }
before=$(newer 20000 20) || { echo "no shot of the game after frame 20000: $(cat "$t/dev.log")"; exit 1; }
b="$t/shots/f-$before.png"
[ "$(pix hud "$t/shots/f-10.png")" != "$(pix hud "$b")" ] || { echo "the score did not move by frame $before"; fail=1; }
old=$(pix count "$b" 4fc3f7)
[ "$old" -gt 100 ] || { echo "the player is not on frame $before ($old pixels of its colour)"; fail=1; }
# 1. a code change is swapped in place (Fast Refresh, ZN-742): scenes.ts exports only classes and an interface, so main.ts does not run
#    again; the next frames are still the play scene with its score, in the new background colour, in the same process. (Before the
#    sprite: after an asset swap a code save restarts, the baked images differ from the first compile's.)
pid1=$(pgrep -P $dev)
sed -i.bak 's/BG = 0x14213d/BG = 0x3d1421/' src/scenes.ts && rm src/scenes.ts.bak
waitfor "$t/dev.log" "v1 refreshed src/scenes.ts" 5 || { echo "the code change was not refreshed: $(cat "$t/dev.log")"; fail=1; }
code=$(newer "$(latest)" 20) || { echo "no shot after the code change"; exit 1; }
c="$t/shots/f-$code.png"
[ "$(pix count "$c" 3d1421)" -gt 10000 ] || { echo "frame $code is not the play scene in the new colour ($(pix count "$c" 3d1421) pixels of it)"; fail=1; }
[ "$(pix hud "$c")" = "$(pix hud "$b")" ] || { echo "the score changed with the code change (frame $code)"; fail=1; }
# the clock of the round, from the scene dump: it runs from the click (frame 2) at 60 frames a second; a new game would start it again
secs=$(python3 "$root/tools/scene-texts" "$t/shots/s-$code.bin" | sed -n 's/^\([0-9]*\) s$/\1/p')
want=$(( 100000 - (code - 2) / 60 ))
[ -n "$secs" ] && [ $(( secs - want )) -le 2 ] && [ $(( want - secs )) -le 2 ] || { echo "the round started again: ${secs:-no} s left at frame $code, want $want"; fail=1; }
[ "$(pgrep -P $dev)" = "$pid1" ] && ! grep -q "v2 started" "$t/dev.log" || { echo "the code change restarted the program: $(cat "$t/dev.log")"; fail=1; }
# 2. the sprite changes: a full square in another colour (its frame grows, the atlas is packed again)
printf '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#e040fb"/></svg>\n' > "$t/player.svg"
t0=$(now_ms)
mv "$t/player.svg" assets/player.svg
waitfor "$t/dev.log" "swapped in" 2 || { echo "no reload: $(cat "$t/dev.log")"; exit 1; }
ms=$(( $(now_ms) - t0 ))
[ "$ms" -le 1000 ] || { echo "the program took the new sprite $ms ms after the save (limit 1000): $(cat "$t/dev.log")"; fail=1; }
grep -q "sprites.atlas" "$t/dev.log" || { echo "the frame table was not sent: $(cat "$t/dev.log")"; fail=1; }
after=$(newer "$(latest)" 20) || { echo "no shot after the reload"; exit 1; }
a="$t/shots/f-$after.png"
new=$(pix count "$a" e040fb); stale=$(pix count "$a" 4fc3f7)
[ "$new" -gt "$old" ] && [ "$stale" -eq 0 ] || { echo "frame $after: $new pixels of the new sprite (want > $old), $stale of the old one (want 0)"; fail=1; }
[ "$(pix hud "$a")" = "$(pix hud "$b")" ] || { echo "the score changed between frames $before and $after"; fail=1; }
grep -q "v2 started" "$t/dev.log" && { echo "the asset change restarted the program: $(cat "$t/dev.log")"; fail=1; }
kill $dev; wait $dev 2>/dev/null
[ $fail -eq 0 ] && echo "asset_reload: ok (swapped in $ms ms after the save; $(sed -n 's/.*rebuilt and sent (\(.*\) after the save).*/sent \1/p' "$t/dev.log"))"
exit $fail
