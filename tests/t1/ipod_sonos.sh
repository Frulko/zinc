#!/bin/sh
# examples/ipod plays on Sonos, headless, against a made-up speaker (tests/data/sonos/stub_speaker.py: one group, Salon, on a free local
# port, which the app reaches as IPOD_DEMO_SONOS=127.0.0.1:<port>). The fake iPod is a folder (two songs, the first with a
# cover, as tests/t1/ipod_remote.sh makes them). The session opens the output menu, picks Salon, opens Songs and double-clicks the first
# song. Checked in the speaker's log: the queue cleared, the song queued with the URL of the app's own server (a token in the path) and a
# musicTrack DIDL carrying its title, artist and album, the queue played from its first entry; then, as a real speaker would, a GET of
# that URL with a byte range answers 206 with the file's first bytes, the cover is a PNG, and a path out of the iPod or without the
# token is a 404. The app subscribes the group's events on its own server and answers each NOTIFY.
# Then the queue (four songs: Alpha & Co, Beta, Delta, Gamma): Delta played next and Gamma added to the queue from the right-click menu
# (the answers given by ZINC_SYSTEM_SCRIPT) reach the speaker at their places, shuffle lays out what follows again, repeat goes to all then
# one (the group's play mode), the queue panel opens, an entry dragged and one removed there reach the speaker too; an entry the "Sonos
# app" removes comes back into session.json. The window closed while Salon plays leaves the app in the menu bar (window.hide, the
# tray item). The app is quit (SIGTERM): the speaker gets Pause, then the UNSUBSCRIBEs, and the process is gone within 4 s. Started again: it attaches to the group, which still holds its
# queue (no command sent, the same server port and token). Then another app replaces the group's queue and the app is started a third
# time: the session stays paused and the speaker gets no command. No real speaker is contacted. Skipped (77) without the plugin's
# libraries. KEEP=dir keeps the shots and the logs.
cd "$(dirname "$0")/../.." || exit 2
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
command -v python3 >/dev/null || exit 77
root=$(pwd)
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); srv=''; pid=''
trap '[ -n "$pid" ] && kill $pid 2>/dev/null; [ -n "$srv" ] && { kill $srv; wait $srv; } 2>/dev/null; [ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.png "$tmp"/*.out "$tmp"/*.log "$tmp"/backups/session.json "$KEEP/" 2>/dev/null; rm -rf "$tmp"' EXIT
pod="$tmp/Volumes/ZINCPOD"
mkdir -p "$pod/iPod_Control/Device"
printf 'ModelNumStr: xB029\npszSerialNumber: 8K1234ABCDE\nFirewireGuid: 0x000A27001234ABCD\n' > "$pod/iPod_Control/Device/SysInfo"
python3 - "$tmp" <<'PY'
import struct, sys, zlib
d = sys.argv[1]
n = 8000 * 2 * 2   # two seconds of silence, 8 kHz mono 16-bit
open(d + '/song.wav', 'wb').write(b'RIFF' + struct.pack('<I', 36 + n) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, 8000, 16000, 2, 16) + b'data' + struct.pack('<I', n) + b'\0' * n)
def chunk(t, b): return struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b))
raw = b''.join(b'\0' + b'\xfa\x2d\x48' * 64 for _ in range(64))   # a 64x64 red square
open(d + '/cover.png', 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 64, 64, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
PY
cat > "$tmp/setup.ts" <<'TS'
import * as ipod from 'zinc:ipod';
import { env } from 'zinc:sys';
async function main(): Promise<void> {
  const dir = env('SETUP_DIR');
  await ipod.open(dir + '/Volumes/ZINCPOD', true, '', 'Zinc Pod');
  const r = await ipod.addWith([
    { file: dir + '/song.wav', title: 'Alpha & Co', artist: 'Band', album: 'First', trackNr: 1, genre: 'Rock', year: 2001, artworkFile: dir + '/cover.png' },
    { file: dir + '/song.wav', title: 'Beta', artist: 'Band', album: 'First', trackNr: 2, genre: 'Rock', year: 2001 },
    { file: dir + '/song.wav', title: 'Delta', artist: 'Band', album: 'First', trackNr: 3, genre: 'Rock', year: 2001 },
    { file: dir + '/song.wav', title: 'Gamma', artist: 'Band', album: 'First', trackNr: 4, genre: 'Rock', year: 2001 }]);
  const errors = r.map((x) => x.error).join('');
  console.log(errors === '' ? 'ok' : errors);
  await ipod.close();
}
main();
TS
export ZINC_IPOD_BACKUPS="$tmp/backups" ZINC_NATIVE=real ZINC_IPOD_ROOTS="$tmp/Volumes" ZINC_IPOD_NO_USB=1 ZINC_HEADLESS=1 SETUP_DIR="$tmp"
out=$("$Z" run "$tmp/setup.ts" 2>"$tmp/setup.err")
[ "$out" = ok ] || { echo "ipod_sonos: the setup: $out $(tail -3 "$tmp/setup.err")"; exit 1; }
port=$((20000 + ($$ + 91) % 20000))
app=$tmp/app
cp -R examples/ipod "$app" && cp -R examples/ipod-web "$tmp/ipod-web" && rm -rf "$app/build"   # the app imports the daemon's Subsonic module (Share with AudioMuse)
python3 tests/data/sonos/stub_speaker.py $port "$tmp/sonos.log" --fetch > "$tmp/sonos.out" 2>&1 & srv=$!
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null -X POST "http://127.0.0.1:$port/" && break; sleep 0.3; done
# the output button (frame 41), Salon in its menu (frame 141: the search answered), Songs (161), a double-click on the first song (201);
# right clicks on Delta (261: Play next) and Gamma (291: Add to queue), shuffle (321), repeat twice (351, 381), the queue button (411),
# in the panel (its rows 46 px apart: Next in queue Delta 257, Gamma 303; Next from 389, 435, 481) the last entry dragged one place
# up (471) and Gamma's x (531), then the window closed (640: the app goes on in the menu bar); the app runs until those reach the
# speaker (ZINC_DETERMINISTIC: the frames follow the input, the network the wall clock)
cat > "$tmp/session.input" <<'IN'
41 move 1110 32
42 down
43 up
141 move 1000 107
142 down
143 up
161 move 60 333
162 down
163 up
201 move 500 212
202 down
203 up
204 down
205 up
261 move 500 280
262 right-down
263 right-up
291 move 500 314
292 right-down
293 right-up
321 move 378 32
322 down
323 up
351 move 530 32
352 down
353 up
381 move 530 32
382 down
383 up
411 move 967 32
412 down
413 up
471 move 950 481
472 down
474 move 950 476
476 move 950 461
478 move 950 435
480 up
531 move 1155 303
532 down
533 up
640 close
IN
printf '0 dialog-answer play-next\n0 dialog-answer add-to-queue\n' > "$tmp/system.script"
cd "$tmp" || exit 2
export IPOD_DEMO_SONOS=127.0.0.1:$port IPOD_DEMO_MOUNT="$pod" ZINC_DETERMINISTIC=1 TZ=UTC ZINC_SCALE=1 ZINC_SIZE=1180x760 ZINC_FRAMES=100000000
ZINC_SYSTEM_SCRIPT="$tmp/system.script" ZINC_INPUT="$tmp/session.input" ZINC_SHOT="$tmp/page.png" ZINC_SHOT_FRAMES=140,400,460,600 timeout 90 "$Z" run --interp "$app" > app.out 2>&1 &
pid=$!
# the speaker's last fetch and the panel's removal, then a change made by "the Sonos app", then the app is stopped (its server lives as long as it runs)
waitlog() { for i in $(seq 1 300); do grep -qE "$1" "$tmp/sonos.log" 2>/dev/null && return 0; kill -0 $pid 2>/dev/null || return 1; sleep 0.1; done; return 1; }
soap() {   # soap <action> <args>: an AVTransport action of another app
  curl -s -o /dev/null -X POST -H "SOAPACTION: \"urn:schemas-upnp-org:service:AVTransport:1#$1\"" -H 'Content-Type: text/xml' \
    --data "<s:Envelope><s:Body><u:$1><InstanceID>0</InstanceID>$2</u:$1></s:Body></s:Envelope>" "http://127.0.0.1:$port/MediaRenderer/AVTransport/Control"
}
fail=0
waitlog '^no token' && waitlog '^ReorderTracksInQueue ' && waitlog '^RemoveTrackRangeFromQueue [0-9]+ 1$' || { echo "ipod_sonos: the session did not reach the speaker: $(tail -5 "$tmp/sonos.log" | cut -c1-200 | tr '\n' ';') $(tail -3 app.out)"; fail=1; }
sleep 1
before=$(python3 -c "import json; print(len(json.load(open('$tmp/backups/session.json'))['ids']))" 2>/dev/null)
soap RemoveTrackFromQueue '<ObjectID>Q:0/2</ObjectID><UpdateID>0</UpdateID>'
for i in $(seq 1 50); do after=$(python3 -c "import json; print(len(json.load(open('$tmp/backups/session.json'))['ids']))" 2>/dev/null); [ "$after" != "$before" ] && break; sleep 0.1; done
[ -n "$before" ] && [ "$after" = $((before - 1)) ] || { echo "ipod_sonos: the queue changed by another app did not come back: $before entries, then $after"; fail=1; }
# what it removed is Delta played next (Gamma went in the panel): no entry is left marked as added by hand, the album's Delta included
manual=$(python3 -c "import json; print(sum(json.load(open('$tmp/backups/session.json'))['manual']))" 2>/dev/null)
[ "$manual" = 0 ] || { echo "ipod_sonos: $manual entries still marked as added by hand after the other app's change"; fail=1; }
# the window closed while Salon plays (frame 640): the app stays, hidden, in the menu bar, and goes on serving the songs
for i in $(seq 1 50); do grep -q '^\[system\] tray.create' app.out && break; sleep 0.1; done
grep -q '^\[system\] window.hide' app.out && grep -q '^\[system\] tray.create {"id":"ipod","icon":"trayTemplate.png"' app.out && kill -0 $pid 2>/dev/null ||
  { echo "ipod_sonos: closing the window while Sonos plays did not keep the app in the menu bar: $(grep '^\[system\] \(tray\|window\)' app.out | tail -3)"; fail=1; }
# the quit (SIGTERM, as `kill` or a logout sends it): the speaker paused while the songs are still served, then the events
# unsubscribed, and the process gone within its limit (3 s)
sleep 0.5
qmark=$(wc -l < "$tmp/sonos.log")
kill $pid; for i in $(seq 1 40); do kill -0 $pid 2>/dev/null || break; sleep 0.1; done
if kill -0 $pid 2>/dev/null; then echo "ipod_sonos: the app was still running 4 s after SIGTERM"; fail=1; kill -9 $pid; fi
wait $pid 2>/dev/null; pid=''
quit=$(tail -n +$((qmark + 1)) "$tmp/sonos.log" | grep -oE '^(Pause|Stop|UNSUBSCRIBE)' | tr '\n' ' ')
case "$quit" in "Pause UNSUBSCRIBE"*) ;; *) echo "ipod_sonos: the quit sent '$quit', not Pause then UNSUBSCRIBE"; fail=1;; esac
log=$tmp/sonos.log
want() { grep -qE "$1" "$log" || { echo "ipod_sonos: the speaker's log has no $2: $(tr '\n' ';' < "$log" | cut -c1-600)"; fail=1; }; }
want '^RemoveAllTracksFromQueue' 'cleared queue'
# the first entries queued in one call (four songs: one chunk), then Delta next (2), Gamma after it (3), the tail laid out again
want "^AddMultipleURIsToQueue 4 http://127\.0\.0\.1:[0-9]+/[0-9a-f]{32}/file/[^ ]+ .*<DIDL-Lite.*<res protocolInfo=\"http-get:\*:audio/wav:\*\"" 'songs queued by their URLs'
want '<dc:title>Alpha &amp; Co</dc:title><upnp:class>object\.item\.audioItem\.musicTrack</upnp:class><dc:creator>Band</dc:creator><upnp:album>First</upnp:album><upnp:albumArtURI>http://' 'musicTrack DIDL'
want '^SetAVTransportURI x-rincon-queue:RINCON_A#0' 'queue played'
want '^Seek TRACK_NR 1' 'first entry'
want '^Play' 'Play'
want '^fetch 206 bytes 0-3/32044 52494646$' 'ranged GET of the song (206, RIFF)'
want '^cover 200 image/png [0-9]+' 'cover'
want '^traversal 404$' '404 for a path out of the iPod'
want '^no token 404$' '404 without the token'
want '^SUBSCRIBE /MediaRenderer/AVTransport/Event <http://127\.0\.0\.1:[0-9]+/sonos-events> Second-1800$' 'subscription to the events'
want '^NOTIFY /MediaRenderer/AVTransport/Event [1-9][0-9]* 200$' 'event of a change answered by the app'
want '^SUBSCRIBE /MediaServer/ContentDirectory/Event <http://127\.0\.0\.1:[0-9]+/sonos-events> Second-1800$' 'subscription to the queue events'
want '^AddMultipleURIsToQueue 1 http://[^ ]+ <DIDL-Lite.*<dc:title>Delta</dc:title>.*</DIDL-Lite> 2 0$' 'Delta played next'
want '^AddMultipleURIsToQueue 1 http://[^ ]+ <DIDL-Lite.*<dc:title>Gamma</dc:title>.*</DIDL-Lite> 3 0$' 'Gamma added to the queue'
want '^RemoveTrackRangeFromQueue 4 3$' 'the tail taken out for shuffle'
want '^AddMultipleURIsToQueue 3 .* 4 0$' 'the tail shuffled'
want '^SetPlayMode REPEAT_ALL$' 'repeat all'
want '^SetPlayMode REPEAT_ONE$' 'repeat one'
want '^ReorderTracksInQueue [0-9]+ 1 [0-9]+$' 'the entry dragged'
want '^RemoveTrackRangeFromQueue 3 1$' 'the entry removed in the panel'
# started again: the group still plays the app's queue, which it follows without sending anything
mark=$(wc -l < "$log")
ZINC_SHOT="$tmp/resumed.png" ZINC_SHOT_FRAMES=200 timeout 60 "$Z" run --interp "$app" > resumed.out 2>&1 &
pid=$!
for i in $(seq 1 100); do tail -n +$((mark + 1)) "$log" | grep -q '^SUBSCRIBE /MediaRenderer/AVTransport' && break; sleep 0.1; done
sleep 2; kill $pid 2>/dev/null; wait $pid 2>/dev/null; pid=''
tail -n +$((mark + 1)) "$log" | grep -q '^SUBSCRIBE /MediaRenderer/AVTransport' || { echo "ipod_sonos: the session started again did not follow the group: $(tail -3 resumed.out)"; fail=1; }
sent=$(tail -n +$((mark + 1)) "$log" | grep -vE '^(SUBSCRIBE|UNSUBSCRIBE|RENEW|NOTIFY|fetch|cover|traversal|no token)' | head -3 | cut -c1-120 | tr '\n' ';')
[ -z "$sent" ] || { echo "ipod_sonos: attaching sent commands to the group: $sent"; fail=1; }
# another app replaces the queue: the session started again stays paused, the speaker gets nothing
soap RemoveAllTracksFromQueue ''
soap AddURIToQueue '<EnqueuedURI>x-sonos-spotify:spotify%3atrack%3a1</EnqueuedURI><EnqueuedURIMetaData></EnqueuedURIMetaData><DesiredFirstTrackNumberEnqueued>0</DesiredFirstTrackNumberEnqueued><EnqueueAsNext>0</EnqueueAsNext>'
mark=$(wc -l < "$log")
timeout 60 "$Z" run --interp "$app" > replaced.out 2>&1 &
pid=$!
sleep 4; kill $pid 2>/dev/null; wait $pid 2>/dev/null; pid=''
sent=$(tail -n +$((mark + 1)) "$log" | grep -vE '^(SUBSCRIBE|UNSUBSCRIBE|RENEW|NOTIFY|fetch|cover|traversal|no token)' | head -3 | cut -c1-120 | tr '\n' ';')
[ -z "$sent" ] || { echo "ipod_sonos: the app touched a group whose queue was replaced: $sent"; fail=1; }
[ $fail = 0 ] && echo "ipod_sonos: ok"
exit $fail
