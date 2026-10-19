#!/bin/sh
# examples/music-tree against a made-up house (tests/data/music-tree/fake_house.py: Sonos speakers and the Spotify Web API on one local
# port), headless. The test's copy of the demo gets a copy of zinc:sonos pointed at that port (a project's plugins/ shadows the engine's),
# a stub Spotify client calling it, a fake login file (else zinc:spotify reads ~/.zinc/spotify.json) and a counter of drawn frames.
# Run rooms: (a) the Rooms page left alone draws no more frames than it polls the speakers (a poll asks for a frame only when what is
# shown changed); (b) the list scrolled so a room's slider lies under the header, a tap on "Actualiser" sends
# no SetVolume. Run home: (c) "Reprendre ici" (the account plays on a Mac) moves the song to the speakers through their Spotify service:
# the album queued, its queue searched for the song, the song's radio when it is not there, the moment in the song, the Mac paused.
# KEEP=dir keeps the frames and the logs.
DEMO=../examples/music-tree   # the demo under test, from next/
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
data=$(pwd)/tests/data/music-tree
tmp=$(mktemp -d); srv=
trap '[ -n "$srv" ] && { kill $srv; wait $srv; } 2>/dev/null; [ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.png "$tmp"/*.out "$tmp"/*.log "$KEEP/" 2>/dev/null; rm -rf "$tmp"' EXIT
port=$((20000 + ($$ + 57) % 20000))
app=$tmp/app
cp -R "$DEMO" "$app" && rm -rf "$app/build" "$app/node_modules" "$app/config.json" "$app/spotify.json" "$app/radios.json" "$app/notifications.json" "$app/notif-icons" "$app/tsconfig.json"
mkdir -p "$app/plugins" && cp -R ../plugins/sonos "$app/plugins/sonos"
printf '{"sleep":0,"seed":"127.0.0.1","group":"RINCON_A"}\n' > "$app/config.json"
printf '{"client_id":"fake","refresh_token":"fake"}\n' > "$app/spotify.json"
cat > "$app/src/fake-spotify.ts" <<EOF
import { Spotify, SpotifyError } from 'zinc:spotify';
export class FakeSpotify extends Spotify {
  override async call(method: string, path: string, body: string = ''): Promise<any> {
    const init: any = { method, timeoutMs: 4000, headers: [['Content-Type', 'application/json']] };
    if (body !== '' || method === 'PUT' || method === 'POST') init.body = body;
    const r = await fetch('http://127.0.0.1:$port/v1' + path, init);
    const text = await r.text();
    if (r.status >= 300) throw new SpotifyError(\`\${method} \${path}: \${r.status}\`, r.status as i32);
    if (text === '') return null;
    return JSON.parse(text);
  }
}
EOF
python3 - "$app" $port <<'PY' || { echo "music-tree: the demo's sources moved, the test's patches no longer apply"; exit 1; }
import sys, os
app, port = sys.argv[1], sys.argv[2]
def patch(rel, pairs, head=''):
    p = os.path.join(app, rel); s = open(p).read()
    for a, b in pairs:
        assert a in s, (rel, a); s = s.replace(a, b, 1)
    open(p, 'w').write(head + s)
sonos = os.path.join(app, 'plugins/sonos/index.ts'); text = open(sonos).read(); assert ':1400' in text
open(sonos, 'w').write(text.replace(':1400', ':' + port))   # the speakers' port
patch('src/state.ts', [("new Spotify('spotify.json')", "new FakeSpotify('spotify.json')")], "import { FakeSpotify } from './fake-spotify';\n")
# the probes: each drawn frame and each poll of the speakers, with the frame number
patch('src/main.ts', [("onFrame((deltaSeconds: number) => {\n", "onFrame((deltaSeconds: number) => {\n  probeTick();\n"),
                  ("  uiState.dirty = false;\n  uiState.animating = false;\n", "  uiState.dirty = false;\n  uiState.animating = false;\n  console.log('drawn ' + probeNow());\n")],
      "import { probeTick, probeNow } from './state';\n")
patch('src/state.ts', [("  appState.isPollingGroup = true;\n", "  appState.isPollingGroup = true;\n  console.log('poll group ' + probeFrame);\n"),
                   ("  appState.isPollingTopology = true;\n", "  appState.isPollingTopology = true;\n  console.log('poll topology ' + probeFrame);\n"),
                   ("  appState.isPollingVolumes = true;\n", "  appState.isPollingVolumes = true;\n  console.log('poll volumes ' + probeFrame);\n")],
      "let probeFrame: i32 = 0;\nexport function probeTick(): void { probeFrame++; }\nexport function probeNow(): i32 { return probeFrame; }\n")
PY
python3 "$data/fake_house.py" $port "$tmp/house.log" > "$tmp/house.err" 2>&1 & srv=$!
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null "http://127.0.0.1:$port/v1/me" && break; sleep 0.3; done
kill -0 $srv 2>/dev/null || { echo "music-tree: the made-up house did not start on port $port: $(tail -1 "$tmp/house.err")"; exit 1; }
run() {   # run <name> <input> <frames> <shots>
  : > "$tmp/house.log"
  env ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_FRAMES=$3 ZINC_STORAGE="$tmp/storage-$1" ZINC_MUSIC_METEO=http://127.0.0.1:9 ZINC_MUSIC_RELAY=/dev/null \
    ZINC_INPUT="$2" ZINC_SHOT="$tmp/$1.png" ZINC_SHOT_FRAMES=$4 timeout 60 "$Z" run "$app" > "$tmp/$1.out" 2>&1 || { echo "music-tree: run $1 failed: $(grep -v '^drawn\|^poll' "$tmp/$1.out" | tail -5)"; exit 1; }
  cp "$tmp/house.log" "$tmp/$1.log"
}
run rooms "$data/rooms.input" 1100 945
run home "$data/home.input" 1500 600
fail=0
# (a) frames 300 to 899, the page open and nothing touched: the frames drawn against the polls started
drawn=$(awk '$1 == "drawn" && $2 >= 300 && $2 < 900' "$tmp/rooms.out" | wc -l | tr -d ' ')
polls=$(awk '$1 == "poll" && $3 >= 300 && $3 < 900' "$tmp/rooms.out" | wc -l | tr -d ' ')
[ "$polls" -ge 3 ] || { echo "music-tree: the Rooms page polled the speakers $polls times in 600 frames"; fail=1; }
[ "$drawn" -le "$polls" ] || { echo "music-tree: the idle Rooms page drew $drawn frames for $polls polls (frames 300-899)"; fail=1; }
# (b) the list dragged up 315 px (Bureau's slider under the header: frame 945), "Actualiser" tapped at frame 1001: a refresh, no volume
awk '$1 == "poll" && $2 == "topology" && $3 >= 1001 && $3 <= 1005 { f = 1 } END { exit !f }' "$tmp/rooms.out" || { echo "music-tree: the tap on Actualiser did not refresh the rooms"; fail=1; }
grep -q 'Volume' "$tmp/rooms.log" && { echo "music-tree: the tap on Actualiser over the scrolled list sent $(grep 'Volume' "$tmp/rooms.log" | head -1)"; fail=1; }
# (c) "Reprendre ici" tapped at frame 641 (the card shows from the first look at the account: frame 600)
grep -E 'AddURIToQueue|Browse Q:0|Seek|^spotify ' "$tmp/home.log" | sed 's/^sonos Seek 0:01:[0-9][0-9]$/sonos Seek 0:01:ss/' > "$tmp/handoff"
cat > "$tmp/handoff.want" <<'EOF'
sonos AddURIToQueue x-rincon-cpcontainer:1004206cspotify%3aalbum%3aal1?sid=12&flags=8300&sn=1
sonos Browse Q:0
sonos AddURIToQueue x-rincon-cpcontainer:0006206cspotify%3atrackRadio%3at1
sonos Seek 0:01:ss
spotify PUT /v1/me/player/pause?device_id=mac1
EOF
cmp -s "$tmp/handoff" "$tmp/handoff.want" || { echo "music-tree: Reprendre ici sent: $(tr '\n' ';' < "$tmp/handoff")"; fail=1; }
[ $fail = 0 ] && echo "music-tree sonos: ok"
exit $fail
