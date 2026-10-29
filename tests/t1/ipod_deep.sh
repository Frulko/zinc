#!/bin/sh
# Genius tier 2 of examples/ipod: AudioMuse-AI's deep analysis (services/audiomuse.ts, src/deep.ts, the merge of services/genius.ts,
# the shelves of services/forYou.ts) against the stand-in tests/data/ipod-deep/stub.py (the JSON shapes of AudioMuse 3.6.4's source;
# never the real AudioMuse), on a fake iPod made by tests/data/ipod-deep/main.ts:
#   1. the client (interpreter, then QuickJS): reach, a bad token (401), an analysis polled to its end ("Albums 3/3"), one cancelled
#      through /api/cancel, the sync paged into deep.v1.json (ids tr-<id>, one matched by its names, one not on the iPod), Genius
#      merged differs from tier 1 as planted (A sounds like B: more B), a song not analysed still picked, near lists asked once, a
#      path, the Sounds like and Mood mixes shelves; the stub down: offline, the cache read back, Genius as merged;
#   2. the app (stub up): For you shows the deep shelves and "Deep analysis of"; the stub down and the near lists dropped: "Deep
#      analysis offline". A free port; the stub is stopped at the end.
# Skips (77) without the system libraries of zinc:ipod. KEEP=dir keeps the output.
cd "$(dirname "$0")/../.." || exit 2
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
command -v python3 >/dev/null || exit 77
root=$(pwd)
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); stub=''
stop() { [ -n "$stub" ] && kill $stub 2>/dev/null && wait $stub 2>/dev/null; stub=''; }
trap 'stop; [ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.out "$tmp"/*.err "$tmp"/*.png "$KEEP/" 2>/dev/null; rm -rf "$tmp"' EXIT
python3 -c "import struct, sys; n = 32000; open(sys.argv[1], 'wb').write(b'RIFF' + struct.pack('<I', 36 + n) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, 8000, 16000, 2, 16) + b'data' + struct.pack('<I', n) + b'\0' * n)" "$tmp/song.wav"
start() { rm -f "$tmp/port"; python3 "$root/tests/data/ipod-deep/stub.py" "$tmp" "$tmp/port" & stub=$!; for i in $(seq 1 50); do [ -s "$tmp/port" ] && break; sleep 0.1; done; }
pod="$tmp/Volumes/ZINCPOD"
export ZINC_HEADLESS=1 ZINC_NATIVE=real ZINC_IPOD_ROOTS="$tmp/Volumes" ZINC_IPOD_NO_USB=1 ZINC_IPOD_BACKUPS="$tmp/backups" IPOD_SONG="$tmp/song.wav" STUB_DIR="$tmp" TZ=UTC
cat > "$tmp/want" <<'OUT'
reach analysed 24 last main_analysis SUCCESS
bad token true false
analyse RUNNING 33 Albums 1/3 | RUNNING 66 Albums 2/3 | SUCCESS 100 Albums 3/3 -> Albums 3/3
cancel 1 cancelled: AudioMuse stops after the album it analyses
sync 23 unknown 1 pages 4/24 8/24 12/24 16/24 20/24 24/24 by name true kept true
genius tier 1 AAAAAAAACCCC merged AAAAAAAABBBB more B true
not analysed still picked 2
seeds BC near asked 2 again 0 path AAAAABBBBBBC
genius with near AAAAAAAABBBB
extra shelves 3
shelf Sounds like Charlie One Song 1 | draft Sounds like Charlie One Song 1 CCCCCC / draft Sounds like Charlie Two Song 1 CCCCCC / draft Sounds like Charlie Three Song 1 CCCCCC / draft From Charlie One Song 1 to Bravo One Song 1 AAAAABBBBBBC
shelf Sounds like Bravo One Song 1 | draft Sounds like Bravo One Song 1 AAAAAAAABBBBBBBB / draft Sounds like Bravo Two Song 1 AAAAAAAABBBBBBBB / draft Sounds like Bravo Three Song 1 AAAAAAAABBBBBBBB / draft Sounds like Bravo Four Song 2 AAAAAAAABBBBBBBB
shelf Mood mixes | draft Aggressive AAAAAAAABBBBBBBB / draft Danceable CCCCCC
tier 1 again true shelves 0
OUT
cat > "$tmp/want-offline" <<'OUT'
reach offline true
near offline true
cached 23 genius AAAAAAAABBBB
OUT
fail=0
for engine in --interp "--engine quickjs"; do
  rm -rf "$tmp/Volumes" "$tmp/backups"; mkdir -p "$pod/iPod_Control/Device"; : > "$tmp/requests.jsonl"
  printf 'ModelNumStr: xB029\npszSerialNumber: 8K1234ABCDE\nFirewireGuid: 0x000A27001234ABCD\n' > "$pod/iPod_Control/Device/SysInfo"
  start
  MUSE_URL=http://127.0.0.1:$(cat "$tmp/port") timeout 120 "$Z" run tests/data/ipod-deep/main.ts $engine > "$tmp/online.out" 2>"$tmp/online.err"
  diff "$tmp/want" "$tmp/online.out" > "$tmp/diff" || { echo "ipod_deep ($engine): $(head -30 "$tmp/diff") $(grep -v '^  ' "$tmp/online.err" | tail -3)"; fail=1; }
  python3 - "$tmp/requests.jsonl" > "$tmp/calls.out" <<'PY' || { echo "ipod_deep ($engine): $(cat "$tmp/calls.out")"; fail=1; }
import json, sys
calls = [json.loads(l) for l in open(sys.argv[1])]
cancel = [c for c in calls if c['path'].startswith('/api/cancel/')]
assert [c['path'] for c in cancel] == ['/api/cancel/task-2'] and cancel[0]['method'] == 'POST', cancel
start = [c for c in calls if c['path'] == '/api/analysis/start']
assert len(start) == 2 and json.loads(start[0]['body']) == {'num_recent_albums': 0, 'top_n_moods': 5}, start
sync = [c['query'] for c in calls if c['path'] == '/api/sync' and 'fields' not in c['query']]
assert all(q['include_embeddings'] == 'false' for q in sync) and [q['page'] for q in sync] == [str(i + 1) for i in range(len(sync))] and len(sync) > 1, sync
assert all(c['query']['item_id'].startswith('tr-') for c in calls if c['path'] == '/api/similar_tracks')
assert all(c['auth'] == 'Bearer muse-token' for c in calls if c['path'] != '/api/last_task' or c['auth'] != 'Bearer wrong')
PY
  stop
  MUSE_URL=http://127.0.0.1:$(cat "$tmp/port") DEEP_MODE=offline timeout 120 "$Z" run tests/data/ipod-deep/main.ts $engine > "$tmp/offline.out" 2>"$tmp/offline.err"
  diff "$tmp/want-offline" "$tmp/offline.out" > "$tmp/diff" || { echo "ipod_deep offline ($engine): $(head -20 "$tmp/diff") $(grep -v '^  ' "$tmp/offline.err" | tail -3)"; fail=1; }
done
# ---- 2. the app: For you with the deep shelves, then offline
cd "$tmp" || exit 2
app() {   # app <name>: For you from the sidebar, the scene of frame 60
  printf '31 move 60 176\n32 down\n33 up\n' > "$1.input"
  IPOD_DEMO_NOW=1781524800 IPOD_DEMO_MOUNT=$pod ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1180x760 ZINC_FRAMES=62 ZINC_INPUT="$tmp/$1.input" \
    ZINC_SHOT="$tmp/$1.png" ZINC_SHOT_FRAMES=60 ZINC_SCENE_DUMP="$tmp/$1-scene" timeout 120 "$Z" run "$root/examples/ipod" --interp > "$1.out" 2>&1 \
    || { echo "ipod_deep: the $1 session failed: $(tail -5 "$1.out")"; fail=1; }
}
says() { python3 "$root/tools/scene-texts" "$tmp/$1-scene-60" | grep -q "$2" || { echo "ipod_deep: $1 does not show \"$2\": $(python3 "$root/tools/scene-texts" "$tmp/$1-scene-60" | head -40 | tr '\n' '|')"; fail=1; }; }
start
printf '{"museUrl": "http://127.0.0.1:%s", "museToken": "muse-token"}\n' "$(cat port)" > backups/config.json
rm -f backups/cache/000A27001234ABCD/foryou.json
app online
for t in 'Deep analysis of' 'Sounds like' 'Mood mixes' 'Aggressive'; do says online "$t"; done
stop
python3 -c "import json, sys; f = sys.argv[1]; d = json.load(open(f)); d['near'] = []; json.dump(d, open(f, 'w'))" backups/cache/000A27001234ABCD/deep.v1.json
rm -f backups/cache/000A27001234ABCD/foryou.json
app offline
says offline 'Deep analysis offline'
says offline 'Mood mixes'
[ $fail -eq 0 ] && echo "ipod_deep: ok"
exit $fail
