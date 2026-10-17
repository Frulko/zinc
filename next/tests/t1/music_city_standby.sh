#!/bin/sh
# examples/music (ZN-755): the weather's city chosen in the settings, and the clock slide's StandBy schedule, on the desktop, headless.
# A local server answers as Open-Meteo would (tests/data/music: the geocoding of "lyon", a forecast; ZINC_MUSIC_METEO points the app at it),
# so no request leaves the machine for the weather. The script (tests/data/music/city.input) opens Réglages, "Choisir", types l-y-o-n on the
# app's own keyboard, picks the first town, then swipes the home to the weather slide and back to the clock. Proved: one geocoding request
# for the four keys (the 300 ms debounce), the town list (frame 150), config.json holding Lyon's place, the forecast read again for it and
# the slide naming it (frame 310); on the clock, with ZINC_MUSIC_STANDBY=2,4,1,0 (off after 2 s, a glance of 1 s every 4 s), the screen lit
# at frame 440, black at 460, lit again at 700 (the glance), black at 760, lit at 940 (the next glance).
# KEEP=dir keeps the frames there.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); srv=; trap '[ -n "$srv" ] && { kill $srv; wait $srv; } 2>/dev/null; rm -rf "$tmp"' EXIT
data=$(pwd)/tests/data/music
cp -R ../examples/music "$tmp/music"
rm -f "$tmp/music/config.json" "$tmp/music/radios.json" "$tmp/music/spotify.json"
printf '{"sleep":120,"lat":48.85341,"lon":2.3488,"city":"Paris"}\n' > "$tmp/music/config.json"
port=$((20000 + ($$ + 31) % 20000))
python3 - "$port" "$data" "$tmp/requests" <<'PY' > /dev/null 2>&1 & srv=$!
import http.server, sys
port, data, log = int(sys.argv[1]), sys.argv[2], sys.argv[3]
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        with open(log, 'a') as f: f.write(self.path + '\n')
        name = 'geocoding.json' if self.path.startswith('/v1/search?') else 'forecast.json' if self.path.startswith('/v1/forecast?') else None
        body = open(f'{data}/{name}', 'rb').read() if name else b'{}'
        self.send_response(200 if name else 404); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a): pass
http.server.HTTPServer(('127.0.0.1', port), H).serve_forever()
PY
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s "http://127.0.0.1:$port/" >/dev/null && break; sleep 0.3; done
shots=150,190,310,440,460,700,760,940
env ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_FRAMES=945 ZINC_STORAGE="$tmp/storage" ZINC_MUSIC_METEO="http://127.0.0.1:$port" ZINC_MUSIC_STANDBY=2,4,1,0 ZINC_MUSIC_RELAY=/dev/null \
  ZINC_INPUT="$data/city.input" ZINC_SHOT="$tmp/f.png" ZINC_SHOT_FRAMES=$shots timeout 120 "$Z" run "$tmp/music" > "$tmp/out" 2>&1 || { echo "music: the run failed: $(tail -5 "$tmp/out")"; exit 1; }
[ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/f-*.png "$tmp/requests" "$tmp/music/config.json" "$KEEP/"
fail=0
searches=$(grep -c '^/v1/search?' "$tmp/requests")
grep -q '^/v1/search?name=lyon&count=8&language=fr' "$tmp/requests" && [ "$searches" = 1 ] || { echo "music: not one geocoding request for lyon: $(cat "$tmp/requests")"; fail=1; }
grep -q '^/v1/forecast?latitude=45.74846&longitude=4.84671' "$tmp/requests" || { echo "music: no forecast read for Lyon: $(cat "$tmp/requests")"; fail=1; }
grep -q '"lat":45.74846,"lon":4.84671,"city":"Lyon"' "$tmp/music/config.json" || { echo "music: config.json has no Lyon: $(cat "$tmp/music/config.json")"; fail=1; }
# what the frames show: black while asleep (460 and 760 the same black picture), the clock lit before it (440) and at each glance (700, 940:
# the same face, the seconds aside), the weather slide (310) far from black
md() { tools/pngdiff "$tmp/f-$1.png" "$tmp/f-$2.png" --mae 1000 2>/dev/null | sed -n 's/.*mae \([0-9.]*\).*/\1/p'; }
tools/pngdiff "$tmp/f-460.png" "$tmp/f-760.png" > /dev/null || { echo "music: frames 460 and 760 are not the same black screen"; fail=1; }
for f in 440 700 940 310; do
  m=$(md $f 460)
  awk -v m="$m" 'BEGIN { exit !(m > 5) }' || { echo "music: frame $f is not lit (mae against the black frame: $m)"; fail=1; }
done
for f in 700 940; do
  m=$(md $f 440)
  awk -v m="$m" 'BEGIN { exit !(m < 3) }' || { echo "music: the glance of frame $f is not the clock of frame 440 (mae $m)"; fail=1; }
done
[ $fail = 0 ] && echo "music city and standby: ok"
exit $fail
