#!/bin/sh
# examples/ipod's smart playlists, headless, on a fake iPod (a folder with SysInfo, as ipod_nav's) filled by tests/data/ipod-smart: 12
# songs by Alpha (Rock), Bravo (Jazz) and Charlie (Pop) with ratings, plays and tempos, a podcast, a playlist "Road trip" and a smart
# playlist "Grouped" on grouping. The session (tests/data/ipod-smart/session.input; the system menus answered in order by
# system.script beside it): Allow changes, Playlists, + › New smart playlist, the row's field to Genre and its value "Rock" from the
# library's menu, + and a second row Rating is greater than 3 stars, Match any (frame 180: 9 songs), Limit to 3 songs selected by
# highest rating, the name "Rock favourites" (frame 230: the editor, its golden), Save to iPod; + › New smart playlist, the template
# Never played, Play, Save; the playlist Grouped (its rules refused, the reason shown), Duplicate as normal playlist; Rock favourites ›
# Edit rules, Match all, the name ", all" longer, Save. Checked: the counts the preview says at frames 180 and 230 against
# evaluateSmart, the editor's frame, the template's preview played through the queue (session.json), and the iPod's database read
# back: each playlist's rules and songs, and each smart one's songs equal to evaluateSmart's.
# Skipped (77) without the plugin's libraries. KEEP=dir keeps the shots. UPDATE=1 rewrites the golden.
cd "$(dirname "$0")/../.." || exit 2
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
command -v python3 >/dev/null || exit 77
root=$(pwd)
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
gold=$root/tests/golden/ipod-smart/frames.txt
tmp=$(mktemp -d)
trap '[ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.png "$tmp"/*.out "$tmp"/*.txt "$KEEP/" 2>/dev/null; rm -rf "$tmp"' EXIT
pod="$tmp/Volumes/ZINCPOD"
mkdir -p "$pod/iPod_Control/Device"
printf 'ModelNumStr: xB029\npszSerialNumber: 8K1234ABCDE\nFirewireGuid: 0x000A27001234ABCD\n' > "$pod/iPod_Control/Device/SysInfo"
python3 - "$tmp" <<'PY'
import struct, sys
n = 8000 * 2 * 2   # two seconds of silence, 8 kHz mono 16-bit
open(sys.argv[1] + '/song.wav', 'wb').write(b'RIFF' + struct.pack('<I', 36 + n) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, 8000, 16000, 2, 16) + b'data' + struct.pack('<I', n) + b'\0' * n)
PY
export ZINC_IPOD_BACKUPS="$tmp/backups" ZINC_NATIVE=real ZINC_IPOD_ROOTS="$tmp/Volumes" ZINC_IPOD_NO_USB=1 ZINC_HEADLESS=1 SETUP_DIR="$tmp"
out=$(MODE=fill timeout 120 "$Z" run "$root/tests/data/ipod-smart" 2>"$tmp/setup.err")
[ "$out" = 'filled 13' ] || { echo "ipod_smart: the setup: $out $(tail -3 "$tmp/setup.err")"; exit 1; }
cd "$tmp" || exit 2
IPOD_DEMO_MOUNT=$pod ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1180x760 TZ=UTC ZINC_FRAMES=570 ZINC_INPUT="$root/tests/data/ipod-smart/session.input" \
  ZINC_SYSTEM_SCRIPT="$root/tests/data/ipod-smart/system.script" ZINC_FRAMEHASH=all ZINC_SHOT="$tmp/smart.png" ZINC_SHOT_FRAMES=180,230 \
  ZINC_SCENE_DUMP="$tmp/scene.bin" timeout 180 "$Z" run --interp "$root/examples/ipod" > session.out 2>&1 \
  || { echo "ipod_smart: the session failed: $(tail -5 session.out)"; exit 1; }
hash_at() { awk -v f="$1" '$2 == "framehash" && $3 + 0 <= f + 0 { h = $5 } END { print h }' session.out; }   # idle frames are not presented: the last one shown
fail=0
echo "230 $(hash_at 230)" > frames.txt
[ -n "$UPDATE" ] && mkdir -p "$(dirname "$gold")" && cp frames.txt "$gold"
cmp -s frames.txt "$gold" || { echo "ipod_smart: the editor's frame $(cat frames.txt), recorded $(cat "$gold")"; fail=1; }
said() { python3 "$root/tools/scene-texts" "$(ls "$tmp"/scene*"$1"* | head -1)" | grep '^[0-9]* songs* · [^·]* · ' | head -1 | cut -d' ' -f1; }
# the template's preview played through the queue: its name and its three songs (the music never played: the podcast is not music)
grep -q '"name":"Never played"' backups/session.json && grep -q '"context":\["[0-9a-f]*","[0-9a-f]*","[0-9a-f]*"\]' backups/session.json \
  || { echo "ipod_smart: the template's preview was not played: $(cut -c1-300 backups/session.json 2>/dev/null)"; fail=1; }
# what the database holds after the session
cd "$root" || exit 2
MODE=check timeout 120 "$Z" run tests/data/ipod-smart > "$tmp/check.txt" 2>"$tmp/check.err" || { echo "ipod_smart: the check: $(tail -3 "$tmp/check.err")"; exit 1; }
want=$(head -1 "$tmp/check.txt")
[ "$want" = "preview $(said 230) of $(said 180)" ] || { echo "ipod_smart: the preview says $(said 230) of $(said 180) songs, evaluateSmart: $want"; fail=1; }
cat > "$tmp/want.txt" <<'OUT'
preview 3 of 9
playlist Podcasts: Talk 1
playlist Road trip: Alpha 1, Bravo 1, Charlie 1
smart Grouped: Match all: grouping contains “live” · live |  | same true
smart Rock favourites, all: Match all: genre contains “Rock”; rating is greater than 3★ · limit 3 songs by highestRating · live | Talk 1 | same true
smart Never played: Match all: videoKind is 1; playCount is 0 · live | Alpha 1, Bravo 2, Charlie 3 | same true
playlist Grouped copy: (empty)
OUT
diff "$tmp/want.txt" "$tmp/check.txt" > "$tmp/diff.txt" || { echo "ipod_smart: the iPod's database: $(cat "$tmp/diff.txt")"; fail=1; }
[ $fail -eq 0 ] && echo "ipod_smart: ok"
exit $fail
