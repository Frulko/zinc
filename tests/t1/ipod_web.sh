#!/bin/sh
# examples/ipod-web, the iPod daemon, on a fake iPod (a folder with iPod_Control/Device/SysInfo, no USB) that a small program first
# gives a database with two tagged WAV songs (one with a cover). Read only: the page and /pod.json, /api with and without the token,
# tracks, a file with a byte range, Subsonic ping (password and token auth, a bad password), getArtists and getAlbum in JSON and XML,
# search3, stream with a range, getCoverArt, a write refused (403). Then with --allow-changes: an add by POST and a remove.
# Port 8687 (a fixed port: run alone). Skipped (77) without the plugin's libraries.
cd "$(dirname "$0")/../.." || exit 2
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
command -v python3 >/dev/null || exit 77
tmp=$(mktemp -d); pid=''
trap '[ -n "$pid" ] && kill $pid 2>/dev/null; rm -rf "$tmp"' EXIT
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
    { file: dir + '/song.wav', title: 'Alpha', artist: 'Band', album: 'First', trackNr: 1, genre: 'Rock', year: 2001, artworkFile: dir + '/cover.png' },
    { file: dir + '/song.wav', title: 'Beta', artist: 'Band', album: 'First', trackNr: 2, genre: 'Rock', year: 2001 }]);
  console.log(r[0].error + r[1].error === '' ? 'ok' : r[0].error + r[1].error);
  await ipod.close();
}
main();
TS
export ZINC_IPOD_BACKUPS="$tmp/backups" ZINC_NATIVE=real ZINC_IPOD_ROOTS="$tmp/Volumes" ZINC_IPOD_NO_USB=1 ZINC_HEADLESS=1 SETUP_DIR="$tmp"
out=$("$ZINC" run "$tmp/setup.ts" 2>&1)
[ "$out" = ok ] || { echo "the setup: $out"; exit 1; }

B=http://localhost:8687
start() {   # the daemon on the fake iPod only (--mount), up when it serves the library
  "$ZINC" run examples/ipod-web -- --port 8687 --token secret --user ann --password sesame --mount "$pod" "$@" >"$tmp/log" 2>&1 &
  pid=$!
  for i in $(seq 1 120); do curl -s "$B/" | grep -q 'Serving' && return 0; sleep 0.5; done
  echo "the daemon did not open the iPod: $(tail -5 "$tmp/log")"; exit 1
}
stop() { kill $pid 2>/dev/null; wait $pid 2>/dev/null; pid=''; }
fail=0
want() {   # want <what> <pattern> <text>
  case $3 in $2) ;; *) echo "$1: $(echo "$3" | tail -c 400)"; fail=1 ;; esac
}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
A='Authorization: Bearer secret'

start
want 'the page' '*Serving Zinc Pod*: 2 songs, 1 albums, 1 artists*<h2>ZINCPOD</h2>*Classic (Silver)*' "$(curl -s $B/)"
want 'the JSON' '*"Model": "Classic (Silver)"*"Serial number": "8K1234ABCDE"*' "$(curl -s $B/pod.json)"
want 'another path' 404 "$(code $B/nope)"
want '/api without token' 401 "$(code $B/api/tracks)"
want '/api with a bad token' 401 "$(code "$B/api/tracks?token=nope")"
tracks=$(curl -s -H "$A" $B/api/tracks)
want '/api/tracks' '{"tracks":\[{"id":"*","title":"Alpha"*"artwork":true*"title":"Beta"*' "$tracks"
id=$(echo "$tracks" | sed 's/^{"tracks":\[{"id":"\([^"]*\)".*/\1/')
want '/api/devices' '*"open":"*ZINCPOD"*"devices":\[{"mountpoint":*' "$(curl -s "$B/api/devices?token=secret")"
want '/api/file range' '206 4 RIFF' "$(curl -s -H "$A" -H 'Range: bytes=0-3' -o "$tmp/part" -w '%{http_code} %{size_download}' $B/api/file/$id) $(cat "$tmp/part")"
R="$B/rest"
want 'ping, password' '*status="ok"*version="1.16.1"*' "$(curl -s "$R/ping.view?u=ann&p=sesame&v=1.16.1&c=t")"
want 'ping, enc: password' '*status="ok"*' "$(curl -s "$R/ping?u=ann&p=enc:736573616d65")"
tok=$(printf 'sesame%s' abc123 | md5 -q 2>/dev/null || printf 'sesame%s' abc123 | md5sum | cut -d' ' -f1)
want 'ping, token' '{"subsonic-response":{"status":"ok"*"openSubsonic":true}}' "$(curl -s "$R/ping?u=ann&t=$tok&s=abc123&f=json")"
want 'ping, bad password' '*status="failed"*<error code="40"*' "$(curl -s "$R/ping?u=ann&p=nope")"
want 'ping, bad token' '*"code":40*' "$(curl -s "$R/ping?u=ann&t=0123&s=abc123&f=json")"
U='u=ann&p=sesame'
want 'getArtists JSON' '*"artists":{"ignoredArticles":"","index":\[{"name":"B","artist":\[{"id":"ar-1","name":"Band","albumCount":1,"coverArt":"al-1"}\]}\]}*' "$(curl -s "$R/getArtists?$U&f=json")"
want 'getArtists XML' '*<artists ignoredArticles=""><index name="B"><artist id="ar-1" name="Band" albumCount="1" coverArt="al-1"/></index></artists>*' "$(curl -s "$R/getArtists?$U")"
want 'getAlbum JSON' '*"album":{"id":"al-1","name":"First"*"songCount":2*"song":\[{"id":"tr-*"title":"Alpha"*"title":"Beta"*' "$(curl -s "$R/getAlbum?$U&id=al-1&f=json")"
want 'getAlbum XML' '*<album id="al-1" name="First"*><song id="tr-*title="Alpha"*suffix="wav"*<song*title="Beta"*</album>*' "$(curl -s "$R/getAlbum?$U&id=al-1")"
want 'getAlbum, unknown' '*<error code="70"*' "$(curl -s "$R/getAlbum?$U&id=al-9")"
want 'search3' '*"searchResult3":{"artist":\[\],"album":\[\],"song":\[{*"title":"Beta"*}\]}*' "$(curl -s "$R/search3?$U&query=bet&f=json")"
want 'search3 POST form' '*<searchResult3>*<album id="al-1"*' "$(curl -s -d "$U&query=first" "$R/search3.view")"
want 'stream range' '206 4 RIFF audio/wav' "$(curl -s -H 'Range: bytes=0-3' -o "$tmp/part" -w '%{http_code} %{size_download}' "$R/stream?$U&id=tr-$id") $(cat "$tmp/part") $(curl -s -o /dev/null -w '%{content_type}' -r 0-1 "$R/stream?$U&id=tr-$id")"
cover=$(curl -s -o "$tmp/cover" -w '%{http_code} %{content_type}' "$R/getCoverArt?$U&id=al-1")
want 'getCoverArt' '200 image/png PNG' "$cover $(head -c 4 "$tmp/cover" | tail -c 3)"
want 'getCoverArt, none' 404 "$(code "$R/getCoverArt?$U&id=al-9")"
want '/api/specs, playlists, cover' '*"specs":\[{"group":*{"playlists":\[{"id":*"master":true*200 image/png' "$(curl -s -H "$A" $B/api/specs)$(curl -s -H "$A" $B/api/playlists)$(curl -s -H "$A" -o /dev/null -w '%{http_code} %{content_type}' $B/api/cover/$id)"
want 'the other lists' '*<indexes *<artist id="ar-1"*<albumList2><album id="al-1"*<genres><genre songCount="2" albumCount="1">Rock</genre></genres>*<randomSongs><song *<song *</randomSongs>*<playlists/>*' "$(curl -s "$R/getIndexes?$U")$(curl -s "$R/getAlbumList2?$U&type=newest")$(curl -s "$R/getGenres?$U")$(curl -s "$R/getRandomSongs?$U&size=5")$(curl -s "$R/getPlaylists?$U")"
want 'not implemented' '*<error code="0" message="getPodcasts is not implemented by this server."/>*' "$(curl -s "$R/getPodcasts?$U")"
want 'remove, read only' '403 {"error": "This daemon is read only*' "$(curl -s -H "$A" -d '{"ids": ["x"]}' -w '%{http_code} ' -o "$tmp/body" $B/api/remove)$(cat "$tmp/body")"
stop

start --allow-changes
added=$(curl -s -H "$A" --data-binary @"$tmp/song.wav" "$B/api/add?name=new.wav&playlist=Mix")
want 'add' '{"results":\[{"file":"new.wav","id":"*","error":""}\]}' "$added"
want 'added' '*3 songs*' "$(curl -s $B/)"
new=$(echo "$added" | sed 's/.*"id":"\([^"]*\)".*/\1/')
want 'remove' '{"removed": 1}' "$(curl -s -H "$A" -d "{\"ids\": [\"$new\"]}" $B/api/remove)"
want 'removed' '*2 songs*' "$(curl -s $B/)"
stop
exit $fail
