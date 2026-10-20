#!/bin/sh
# examples/music (ZN-758): the Mac's notifications on the tablet, on the desktop, headless. ZINC_MUSIC_RELAY feeds the app the relay's
# messages (hello, icon, notif: tests/data/music/feed.py, made up) as zinc:link would hand them over (the link itself: tests/t1/link.sh; the
# pairing on the Nexus 7: the task's screenshots). The scripts swipe to the notification slide first (a view that needs no network).
# Run a: the screen goes off (a delay of 4 s); a message from Claire lights it (the backlight only, on black) and plays as StandBy does (phase 1 centred, frame 480; phase 2,
# frame 620: goldens); three more arrive at once and wait; the second plays 10 s after the first (frame 1220: a mail); a touch opens it on
# the Mac ("open n2") and the next starts, a touch again ("open n3"), the last (Julie, no avatar: initials, frame 1451) plays, a touch
# ("open n4") and the overlay closes; the list (frame 1520, golden), a swipe to the left deletes a row (notifications.json: 3 left).
# Run b, the same directory, the screen on: the list read back with its icons (frame 40 = frame 1620 of run a); a notification arrives as a
# grey card over a strong dim (frame 100, golden); a touch on the card opens it on the Mac ("open n5"), a touch on a row too; "Tout effacer"
# empties the list. UPDATE=1 writes the goldens; KEEP=dir keeps the frames.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
data=$(pwd)/tests/data/music gold=$(pwd)/tests/golden/music
python3 "$data/feed.py" "$data" --at 7 > "$tmp/feed"
cat > "$tmp/card" <<'EOF'
0.1 {"t":"hello","app":"notify-relay","v":1,"host":"MacBook de test"}
1.0 {"t":"notif","id":"n5","kind":"other","app":{"id":"com.google.Chrome","name":"Google Chrome","icon":""},"title":"Calendrier","subtitle":"","body":"Dans 10 minutes : appel avec l'équipe","date":-10,"domain":"calendar.google.com","thread":""}
EOF
cp -R examples/music "$tmp/music"
rm -rf "$tmp/music/config.json" "$tmp/music/radios.json" "$tmp/music/spotify.json" "$tmp/music/notifications.json" "$tmp/music/notif-icons"
printf '{"sleep":4,"lat":48.85341,"lon":2.3488,"city":"Paris"}\n' > "$tmp/music/config.json"
run() {   # run <name> <feed> <input> <frames> <shots>
  env ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_FRAMES=$4 ZINC_STORAGE="$tmp/storage" ZINC_MUSIC_METEO=http://127.0.0.1:9 ZINC_MUSIC_RELAY="$2" \
    ZINC_INPUT="$3" ZINC_SHOT="$tmp/$1.png" ZINC_SHOT_FRAMES=$5 timeout 90 "$Z" run "$tmp/music" > "$tmp/$1.out" 2>&1 || { echo "music: run $1 failed: $(tail -5 "$tmp/$1.out")"; exit 1; }
}
run a "$tmp/feed" "$data/notify.input" 1630 380,480,620,1220,1451,1520,1620
n=$(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))))" "$tmp/music/notifications.json")
run b "$tmp/card" "$data/clear.input" 230 40,100,228
[ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/a-*.png "$tmp"/b-*.png "$KEEP/"
BODY=0,30,1024,738   # under the status bar, whose right end names a speaker of the network when one answers
if [ -n "$UPDATE" ]; then
  mkdir -p "$gold"
  cp "$tmp/a-480.png" "$gold/notify-standby-1.png"; cp "$tmp/a-620.png" "$gold/notify-standby-2.png"; cp "$tmp/a-1520.png" "$gold/notify-list.png"
  cp "$tmp/b-100.png" "$gold/notify-card.png"; echo "goldens written"; exit 0
fi
fail=0
same() { tools/pngdiff "$1" "$2" --crop $BODY > /dev/null; }
for g in standby-1:a-480 standby-2:a-620 list:a-1520 card:b-100; do
  same "$gold/notify-${g%%:*}.png" "$tmp/${g#*:}.png" || { echo "music: frame ${g#*:} differs from notify-${g%%:*}.png"; fail=1; }
done
python3 - "$tmp/a-380.png" <<'PY' || { echo "music: the screen was not off before the notification (frame 380)"; fail=1; }
import sys, zlib, struct
d = open(sys.argv[1], 'rb').read(); i = 8; idat = b''
while i < len(d):
    n, = struct.unpack('>I', d[i:i+4]); t = d[i+4:i+8]
    if t == b'IDAT': idat += d[i+8:i+8+n]
    i += 12 + n
raw = zlib.decompress(idat)
sys.exit(0 if max(raw) <= 4 else 1)   # filter bytes and black pixels only
PY
same "$tmp/a-480.png" "$tmp/a-620.png" && { echo "music: no phase 2 (frames 480 and 620 alike)"; fail=1; }
same "$tmp/a-1220.png" "$tmp/a-620.png" && { echo "music: the queued notification did not play (frame 1220)"; fail=1; }
same "$tmp/a-1451.png" "$tmp/a-1220.png" && { echo "music: the touches did not move the queue on (frame 1451)"; fail=1; }
[ "$(grep -c '^music: open ' "$tmp/a.out")" = 3 ] && grep -q '^music: open n2$' "$tmp/a.out" && grep -q '^music: open n3$' "$tmp/a.out" && grep -q '^music: open n4$' "$tmp/a.out" \
  || { echo "music: the touches on the overlay did not open n2, n3, n4 on the Mac: $(grep '^music: open' "$tmp/a.out")"; fail=1; }
[ "$n" = 3 ] || { echo "music: the swipe did not delete one notification of four ($n left)"; fail=1; }
same "$tmp/a-1620.png" "$tmp/b-40.png" || { echo "music: the list read back after a restart is not the list left (frames 1620 and 40)"; fail=1; }
grep -q '^music: open n5$' "$tmp/b.out" || { echo "music: a touch on the grey card did not open it on the Mac"; fail=1; }
[ "$(grep -c '^music: open ' "$tmp/b.out")" = 2 ] || { echo "music: a touch on a row did not open it on the Mac: $(grep '^music: open' "$tmp/b.out")"; fail=1; }
grep -q '^\[\]$' "$tmp/music/notifications.json" || { echo "music: Tout effacer did not empty the list: $(head -c 200 "$tmp/music/notifications.json")"; fail=1; }
for f in notif-icon notif-messages notif-avatar; do
  [ -f "$tmp/music/notif-icons/$(shasum -a 256 "$data/$f.png" | cut -c1-64).png" ] || { echo "music: $f was not cached by its hash"; fail=1; }
done
[ $fail = 0 ] && echo "music notifications: ok"
exit $fail
