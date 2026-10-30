#!/bin/sh
# Genius of the iPod app (examples/ipod/src/services/genius.ts) on a fake iPod (a folder with SysInfo, as ipod_plugin) filled by
# tests/data/ipod-genius with 26 songs and a generated history whose neighbours are known: the picks from a seed and their order, the
# artists spread, a 1-star song never picked, the same list twice, Refresh, why each song was picked, Last.fm's similar artists fetched once from the stand-in of
# tests/data/ipod-scrobble/stub.py (never the real service) and cached, the guided radio (services/radio.ts: extended until the library
# runs out, no repeat, the artists spread, a 👎 artist never again, a 👍 pulls the next picks), a path from one song to another
# without AudioMuse (services/genius.ts pathBetween: A's songs, then C's), the taste clusters (the three planted groups, named by their
# artists and genre), the fallback without a history (the genres), and the list saved to the iPod as a normal playlist and read back.
# The interpreter, then QuickJS on a fresh iPod (the same lines; the app runs AOT: ipod_demo builds it).
# Skips (77) without the system libraries of zinc:ipod. KEEP=dir keeps the output.
cd "$(dirname "$0")/../.." || exit 2
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
command -v python3 >/dev/null || exit 77
tmp=$(mktemp -d); stub=''
trap '[ -n "$stub" ] && kill $stub 2>/dev/null && wait $stub 2>/dev/null; rm -rf "$tmp"' EXIT
python3 tests/data/ipod-scrobble/stub.py "$tmp" "$tmp/port" & stub=$!
for i in $(seq 1 50); do [ -s "$tmp/port" ] && break; sleep 0.1; done
python3 - "$tmp/song.wav" <<'PY'
import struct, sys
n = 8000 * 2 * 2   # two seconds of silence, 8 kHz mono 16-bit
open(sys.argv[1], 'wb').write(b'RIFF' + struct.pack('<I', 36 + n) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, 8000, 16000, 2, 16) + b'data' + struct.pack('<I', n) + b'\0' * n)
PY
export IPOD_LASTFM_URL=http://127.0.0.1:$(cat "$tmp/port")/2.0/ IPOD_HISTORY_PACE_MS=1 ZINC_HEADLESS=1 ZINC_NATIVE=real ZINC_IPOD_ROOTS="$tmp/Volumes" \
  ZINC_IPOD_NO_USB=1 ZINC_IPOD_BACKUPS="$tmp/backups" IPOD_SONG="$tmp/song.wav"
cat > "$tmp/want" <<'OUT'
tracks 26 refused 0
weights 4 true
fetched without a key 0
genius 25 AAAAAAACCCCCCCCBBBBBBBBLL seed first true spread true
one star picked false same again true
refresh true true Alpha songs 7 spread true
stopped after 2 0/13 1/13 2/13 
fetched 11 again 0
genius with similar artists AAAAAAALBBBLBBBBCCCCCCCCB spread true
why A the song it starts from | often played with Alpha One Song 1
why L similar artist (Last.fm)
why B you play it often
why C you play it often
old file moved true true newer kept true gone true once true true
radio AAAAAAALBBBBBBBBCCCCCCCC extensions 10,10,6 disliked L then 16 repeats 0 spread true disliked artist after 0
radio next AAAAA ALBBB liked a C song AAAAA ACCCC
path AAAAAACC true true not music 0
ten 10 AAAAAAACCC
mixes 3
mix Alpha One, Alpha Two · Rock | 8 7 A spread true
mix Bravo One, Bravo Three · Jazz | 8 8 B spread true
mix Charlie One, Charlie Three · Electronic | 8 8 C spread true
mixes without history 3 8 why the song it starts from | same genre · 1990s | same artist |  | 1990s
saved Genius · Alpha One Song 1 false true
OUT
fail=0
run() {   # $1: the engine's flag; a new fake iPod and history each time
  rm -rf "$tmp/Volumes" "$tmp/backups" "$tmp/h"; mkdir -p "$tmp/Volumes/ZINCPOD/iPod_Control/Device" "$tmp/h"
  printf 'ModelNumStr: xB029\npszSerialNumber: 8K1234ABCDE\nFirewireGuid: 0x000A27001234ABCD\n' > "$tmp/Volumes/ZINCPOD/iPod_Control/Device/SysInfo"
  : > "$tmp/requests.jsonl"
  GENIUS_DIR="$tmp/h" timeout 120 "$ZINC" run tests/data/ipod-genius/main.ts $1 > "$tmp/out" 2>"$tmp/err"
  [ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp/out" "$KEEP/out$1" && cp "$tmp/err" "$KEEP/err$1"
  diff "$tmp/want" "$tmp/out" > "$tmp/diff" || { echo "ipod_genius ($1): $(head -20 "$tmp/diff") $(grep -v '^  ' "$tmp/err" | tail -3)"; fail=1; }
  # each artist asked once, with the key; nothing asked without it
  n=$(grep -c '"artist.getsimilar"' "$tmp/requests.jsonl")
  [ "$n" -eq 13 ] || { echo "ipod_genius ($1): $n artist.getsimilar calls, 13 expected"; fail=1; }
}
run --interp
run "--engine quickjs"
# the radio in the app, on the last fake iPod and the made-up speaker of tests/data/sonos/stub_speaker.py (never a real one): Salon
# chosen (frames 41, 600: the frames do not wait for the network), Songs (640), "Start radio" on the first song (680, answered by
# ZINC_SYSTEM_SCRIPT): the seed and ten songs on the group; ⏭ seven times (800..2300, 250 frames apart), after the sixth fewer than five
# are left: ten more appended to the group's queue; the queue panel (2600) and 👎 in the bar (2900): the songs after the one playing
# are picked again on the group, then Next; frame 3200 shows the radio in the panel.
port=$((20000 + ($$ + 57) % 20000))
python3 tests/data/sonos/stub_speaker.py $port "$tmp/sonos.log" > "$tmp/sonos.out" 2>&1 & speaker=$!
trap '[ -n "$stub" ] && kill $stub 2>/dev/null && wait $stub 2>/dev/null; [ -n "$app" ] && kill $app 2>/dev/null; kill $speaker 2>/dev/null; wait $speaker 2>/dev/null; rm -rf "$tmp"' EXIT
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null -X POST "http://127.0.0.1:$port/" && break; sleep 0.3; done
{ printf '41 move 1110 32\n42 down\n43 up\n600 move 1000 107\n601 down\n602 up\n640 move 60 393\n641 down\n642 up\n680 move 500 212\n681 right-down\n682 right-up\n'
  for f in 800 1050 1300 1550 1800 2050 2300; do printf '%s move 492 32\n%s down\n%s up\n' $f $((f + 1)) $((f + 2)); done
  printf '2600 move 1045 32\n2601 down\n2602 up\n2900 move 957 32\n2901 down\n2902 up\n'; } > "$tmp/radio.input"
printf '0 dialog-answer radio\n' > "$tmp/radio.script"
IPOD_DEMO_SONOS=127.0.0.1:$port IPOD_DEMO_MOUNT="$tmp/Volumes/ZINCPOD" ZINC_DETERMINISTIC=1 TZ=UTC ZINC_SCALE=1 ZINC_SIZE=1180x760 ZINC_FRAMES=100000000 \
  ZINC_SYSTEM_SCRIPT="$tmp/radio.script" ZINC_INPUT="$tmp/radio.input" ZINC_SHOT="$tmp/radio.png" ZINC_SHOT_FRAMES=3200 ZINC_SCENE_DUMP="$tmp/radio-scene" \
  timeout 120 "$ZINC" run examples/ipod --interp > "$tmp/radio.out" 2>&1 & app=$!
# the speaker's log: what the radio queued, the seven Nexts, the top-up, then the 👎 (its range taken out, the new picks, Next)
for i in $(seq 1 300); do [ "$(grep -c '^Next' "$tmp/sonos.log" 2>/dev/null)" -ge 8 ] && [ -s "$tmp/radio-scene-3200" ] && break; kill -0 $app 2>/dev/null || break; sleep 0.1; done
sleep 0.5; kill $app 2>/dev/null; wait $app 2>/dev/null; app=''
[ -n "$KEEP" ] && cp "$tmp"/radio*.png "$tmp/sonos.log" "$tmp/radio.out" "$KEEP/" 2>/dev/null
got=$(grep -E '^(AddMultipleURIsToQueue|RemoveTrackRangeFromQueue|Next)' "$tmp/sonos.log" | awk '{ if ($1 == "AddMultipleURIsToQueue") print "add", $2, $(NF-1); else if ($1 == "Next") print "next"; else print "remove", $2, $3 }' | tr '\n' ',')
# the top-up comes after the sixth Next, or after the seventh when the group was read after both
echo "$got" | grep -qE '^add 11 0,(next,){6}(add 10 12,next,|next,add 10 12,)remove 9 13,add 10 9,next,$' || { echo "ipod_genius: the radio on the group: $got"; fail=1; }
python3 tools/scene-texts "$tmp/radio-scene-3200" | grep -q 'Next from: Radio · Alpha Four Song 1' ||
  { echo "ipod_genius: the radio's frame 3200 shows no radio in the queue: $(python3 tools/scene-texts "$tmp/radio-scene-3200" | head -30 | tr '\n' '|')"; fail=1; }
# "Path from here…" in the app (no AudioMuse): Songs (41), the first song's menu (81, answered), the search field asks the song it
# goes to (frame 120), "charlie one song 1" and Enter (141, 161): the draft opens on the Playlists page (frame 200)
printf '41 move 60 393\n42 down\n43 up\n81 move 500 212\n82 right-down\n83 right-up\n141 text "charlie one song 1"\n161 key Enter\n' > "$tmp/path.input"
printf '0 dialog-answer path\n' > "$tmp/path.script"
IPOD_DEMO_MOUNT="$tmp/Volumes/ZINCPOD" ZINC_DETERMINISTIC=1 TZ=UTC ZINC_SCALE=1 ZINC_SIZE=1180x760 ZINC_FRAMES=202 ZINC_SYSTEM_SCRIPT="$tmp/path.script" \
  ZINC_INPUT="$tmp/path.input" ZINC_SHOT="$tmp/path.png" ZINC_SHOT_FRAMES=120,200 ZINC_SCENE_DUMP="$tmp/path-scene" \
  timeout 120 "$ZINC" run examples/ipod --interp > "$tmp/path.out" 2>&1 || { echo "ipod_genius: the path session failed: $(tail -5 "$tmp/path.out")"; fail=1; }
[ -n "$KEEP" ] && cp "$tmp"/path*.png "$KEEP/" 2>/dev/null
for f in '120 Path from “Alpha Four Song 1” to…' '200 From Alpha Four Song 1 to'; do
  python3 tools/scene-texts "$tmp/path-scene-${f%% *}" | grep -q "${f#* }" || { echo "ipod_genius: frame ${f%% *} of the path does not show \"${f#* }\": $(python3 tools/scene-texts "$tmp/path-scene-${f%% *}" | head -40 | tr '\n' '|')"; fail=1; }
done
[ $fail -eq 0 ] && echo "ipod_genius: ok"
exit $fail
