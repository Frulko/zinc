#!/bin/sh
# The For you page of examples/ipod (services/forYou.ts, src/forYou.ts, pages/foryou) on a fake iPod folder filled by tests/data/ipod-foryou
# (58 songs with covers, a playlist, three years of generated history whose shelves are known, at a fixed now: 2026-06-15 12:00 UTC).
#   1. the shelves, worked out by the fixture on the interpreter and QuickJS: On Repeat, Repeat Rewind, Time Capsule, Rediscover, Jump
#      back in, Because you listened to, the month's top songs and artists, the year in review, the daily mixes (one per taste, the same
#      all day, others the next day), no tier-2 shelf yet;
#   2. the app with no history: the page invites to import one;
#   3. the app with the history (session tests/data/ipod-foryou/session.input): For you from the sidebar (frame 45, golden; its mood mixer by genre and BPM only, no AudioMuse), Your 2026
#      (70, golden) and back (160: the page of frame 45), a shelf's › (180: moved), the page scrolled (270), Daily Mix 1 opened (300: its
#      draft on the Playlists page) and back (390: the page where it was scrolled); QuickJS draws the same frame 45;
#   4. the refresh rule: listens added, the same day (the clock IPOD_DEMO_NOW two hours later): the shelves follow (On Repeat has the new
#      song), the daily mixes are kept; the next day they are worked out again;
#   5. 3,000 listens of songs not on the iPod: the page says how many listens matched;
#   6. a Genius list asked earlier: the shelf Your Genius lists shows it.
# Skips (77) without the system libraries of zinc:ipod. KEEP=dir keeps the shots. UPDATE=1 rewrites the golden.
cd "$(dirname "$0")/../.." || exit 2
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
command -v python3 >/dev/null || exit 77
root=$(pwd)
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
gold=$root/tests/golden/ipod-demo/foryou.txt
tmp=$(mktemp -d)
trap '[ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.png "$tmp"/*.out "$tmp"/*.json "$KEEP/" 2>/dev/null; rm -rf "$tmp"' EXIT
mkdir -p "$tmp/covers"
python3 - "$tmp" <<'PY'
import struct, sys, zlib, colorsys
out = sys.argv[1]
n = 8000 * 2 * 2   # two seconds of silence, 8 kHz mono 16-bit
open(out + '/song.wav', 'wb').write(b'RIFF' + struct.pack('<I', 36 + n) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, 8000, 16000, 2, 16) + b'data' + struct.pack('<I', n) + b'\0' * n)
def png(path, pixel):   # 64x64 RGB
    rows = b''.join(b'\0' + b''.join(bytes(pixel(x, y)) for x in range(64)) for y in range(64))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 64, 64, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))
names = [g + '-' + n for g in ('Rock', 'Jazz', 'Electro') for n in ('One', 'Two', 'Three', 'Four')] + ['Old-Flame', 'Capsule-Band', 'Repeat-Act', 'Hidden-Gem', 'Deep-Cut', 'Lost-Track']
for i, name in enumerate(names):   # a diagonal gradient between two hues of the artist
    h = i / len(names)
    def pixel(x, y, h=h):
        r, g, b = colorsys.hsv_to_rgb((h + (x + y) / 512) % 1, 0.65, 0.95 - y / 200)
        return (int(r * 255), int(g * 255), int(b * 255))
    png('%s/covers/%s.png' % (out, name), pixel)
PY
export ZINC_IPOD_BACKUPS="$tmp/backups" ZINC_NATIVE=real ZINC_IPOD_ROOTS="$tmp/Volumes" ZINC_IPOD_NO_USB=1 ZINC_HEADLESS=1 TZ=UTC \
  IPOD_SONG="$tmp/song.wav" FORYOU_COVERS="$tmp/covers" GENIUS_DIR="$tmp"
pod="$tmp/Volumes/ZINCPOD"
fresh() {   # a new empty fake iPod and no history
  rm -rf "$tmp/Volumes" "$tmp/backups"; mkdir -p "$pod/iPod_Control/Device"
  printf 'ModelNumStr: xB029\npszSerialNumber: 8K1234ABCDE\nFirewireGuid: 0x000A27001234ABCD\n' > "$pod/iPod_Control/Device/SysInfo"
}
fixture() { FORYOU_MODE=$1 FORYOU_ADD=$2 timeout 120 "$Z" run "$root/tests/data/ipod-foryou/main.ts" $3 2>"$tmp/fixture.err"; }
fail=0
# ---- 1. the shelves
cat > "$tmp/want" <<'OUT'
tracks 58 refused 0
on repeat On Repeat | Songs you can’t stop playing | Repeat Act 3, Repeat Act 2, Repeat Act 1
repeat rewind Repeat Rewind | Songs you played on repeat, then left | Old Flame 1, Old Flame 2, Old Flame 3, Old Flame 4, Old Flame 5, Old Flame 6
time capsule Time Capsule | Songs you loved in 2023 | Capsule Band 1, Capsule Band 2, Capsule Band 3, Capsule Band 4, Capsule Band 5, Capsule Band 6
rediscover Rediscover | On your iPod, close to what you love, rarely played | Capsule Band 1, Deep Cut 1, Deep Cut 2, Hidden Gem 1, Hidden Gem 2, Lost Track 1, Lost Track 2
jump back in 8 | playlist Road Trip / album Jazz Two Album / album Repeat Act Album
because 3 | Because you listened to Repeat Act | More like Repeat Act Song 3 25
top month Top month |  | Repeat Act 1, Repeat Act 2, Repeat Act 3
top artists month Repeat Act (12 plays), Ghost Artist (5 plays), Jazz Two (3 plays), Electro Four (1 play)
year 2026 listens true months true 39 24 artists 5 songs 5 genres 3 minutes true
daily mixes 5 same all day true others tomorrow true
daily Daily Mix 1 | Rock | mostly Rock true one star false
daily Daily Mix 2 | Electronic | mostly Electro true one star false
daily Daily Mix 3 | Jazz | mostly Jazz true one star false
daily Daily Mix 4 | Pop | mostly Old true one star false
daily Daily Mix 5 | Indie | mostly Capsule true one star false
extra shelves 0
OUT
for engine in --interp "--engine quickjs"; do
  fresh
  fixture '' '' "$engine" > "$tmp/shelves.out"
  diff "$tmp/want" "$tmp/shelves.out" > "$tmp/diff" || { echo "ipod_foryou ($engine): $(head -20 "$tmp/diff") $(tail -3 "$tmp/fixture.err")"; fail=1; }
done
# ---- the app
cd "$tmp" || exit 2
app() {   # app <name> <frames> <input> [now] [engine]: a headless session of the demo, shots and scene dumps of the frames
  printf '%s' "$3" > "$1.input"
  IPOD_DEMO_NOW=${4:-1781524800} IPOD_DEMO_MOUNT=$pod ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1180x760 ZINC_FRAMES=$(($(echo "$2" | tr ',' '\n' | tail -1) + 2)) \
    ZINC_INPUT="$tmp/$1.input" ZINC_FRAMEHASH=all ZINC_SHOT="$tmp/$1.png" ZINC_SHOT_FRAMES=$2 ZINC_SCENE_DUMP="$tmp/$1-scene" \
    timeout 120 "$Z" run "$root/examples/ipod" ${5:---interp} > "$1.out" 2>&1 || { echo "ipod_foryou: the $1 session failed: $(tail -5 "$1.out")"; fail=1; }
}
hash_at() { awk -v f="$2" '$2 == "framehash" && $3 + 0 <= f + 0 { h = $5 } END { print h }' "$1.out"; }   # idle frames are not presented: the last one shown
says() { python3 "$root/tools/scene-texts" "$tmp/$1-scene-$2" | grep -q "$3" || { echo "ipod_foryou: $1 frame $2 does not show \"$3\": $(python3 "$root/tools/scene-texts" "$tmp/$1-scene-$2" | head -30 | tr '\n' '|')"; fail=1; }; }
open='31 move 60 176
32 down
33 up
'
day() { python3 -c "import json,sys; d=json.load(open('$tmp/backups/cache/000A27001234ABCD/foryou.json')); s={x['id']: x for x in d['shelves']}; print($1)"; }
# ---- 2. no history yet
fresh
fixture pod > /dev/null
app empty 40 "$open"
says empty 40 'No listening history yet'
says empty 40 'Import in Settings'
# ---- 3. the history: the page, Your year, a shelf turned, the page scrolled, an album and back
fresh
fixture fill > /dev/null
app page 45,70,160,180,270,300,390 "$(cat "$root/tests/data/ipod-foryou/session.input")"
for f in 45 70; do echo "$f $(hash_at page $f)"; done > foryou.txt
for t in 'For you' 'From 2253 listens, 2248 of them songs of this iPod' 'Jump back in' 'Road Trip' 'Your daily mixes' 'Daily Mix 1' 'Made for you' 'Mood mixer' 'by genre and BPM only'; do says page 45 "$t"; done
for t in 'Your 2026' 'Listens per month' 'Top artists' 'Top genres'; do says page 70 "$t"; done
crop() {   # the page but the top bar and the scroll indicator, which fades after a scroll
  python3 "$root/tools/pngdiff" "page-$1.png" "page-$2.png" --crop 232,64,940,696 > crop.out || { echo "ipod_foryou: $3: $(cat crop.out)"; fail=1; }; }
crop 45 160 'back from Your year, the page differs'
[ "$(hash_at page 180)" != "$(hash_at page 160)" ] || { echo "ipod_foryou: the shelf's › did not move it"; fail=1; }
says page 300 'a draft, not on the iPod until it is saved'
crop 270 390 'back from Daily Mix 1, the page is not where it was'
[ -n "$UPDATE" ] && cp foryou.txt "$gold"
cmp -s foryou.txt "$gold" || { echo "ipod_foryou: frames $(tr '\n' ' ' < foryou.txt), recorded $(tr '\n' ' ' < "$gold")"; fail=1; }
fresh   # from the same state as the page above: a kept page would show at once, while a new one is worked out a frame per step
fixture fill > /dev/null
app quickjs 45 "$open" '' '--engine quickjs'
[ "$(hash_at quickjs 45)" = "$(hash_at page 45)" ] || { echo "ipod_foryou: QuickJS draws another page: $(tail -3 quickjs.out)"; fail=1; }
# ---- 4. the refresh rule
before=$(day "d['day'], d['key'], json.dumps(s['daily'])")
fixture add gem > /dev/null
app same 40 "$open" 1781532000
after=$(day "d['day'], d['key'], json.dumps(s['daily'])")
[ "$(day "len([c for c in s['made']['cards'] if c['id'] == 'on-repeat'][0]['tracks'])")" = 4 ] || { echo "ipod_foryou: On Repeat did not follow the new listens"; fail=1; }
[ "$(echo "$before" | cut -d' ' -f2)" != "$(echo "$after" | cut -d' ' -f2)" ] || { echo "ipod_foryou: the history's version did not change"; fail=1; }
[ "$(day "json.dumps(s['daily'])")" = "$(python3 -c "import sys; print(sys.argv[1].split(' ', 2)[2])" "$before")" ] || { echo "ipod_foryou: the daily mixes changed within the day"; fail=1; }
app next 40 "$open" 1781611200
[ "$(day "d['day']")" = 2026-06-16 ] || { echo "ipod_foryou: the next day, the daily mixes were not worked out again: $(day "d['day']")"; fail=1; }
# ---- 5. few listens of this iPod
fixture add ghost > /dev/null
app few 40 "$open"
says few 40 'Only 2251 of your 5256 listens are of songs on this iPod'
# ---- 6. the Genius lists asked (drafts.ts keeps them in genius.json): a shelf of their own, after Jump back in
day "json.dumps([{'kind': 'draft', 'id': 'draft:genius:' + s['daily']['cards'][0]['tracks'][0] + ':25', 'title': 'Genius · Seed Song', 'subtitle': '25 songs', 'tracks': s['daily']['cards'][0]['tracks'], 'at': 1781520000}])" > "$tmp/backups/cache/000A27001234ABCD/genius.json"
app genius 40 "$open"
says genius 40 'Your Genius lists'
says genius 40 'Genius · Seed Song'
[ $fail -eq 0 ] && echo "ipod_foryou: ok"
exit $fail
