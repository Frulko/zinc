#!/bin/sh
# examples/agents: the activity line, tokens and cost, plan limits, headless. While Claude's tool runs, the turn shows one line
# (`Running… · 1 tool`) whose spinner turns: its pixels change from frame to frame, and so does a tool card's once the line is
# clicked open; with reduced motion the same spinner stands still and the line still says what runs. Escape marks it interrupted.
# The next turn's line reads `Used 2 tools` with `1 failed` in red once over; a click folds the cards again. The status bar shows the conversation's tokens,
# context and cost as the stream reported them, and the plan limits `claude -p /usage` gave at start (no model call); both come
# back after a restart with the folding choice. Settings' interval of the limits checks: 5 minutes, then 1 to 60. KEEP=dir keeps the frames and the logs.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
export ZINC_HOME="${ZINC_HOME:-$HOME/.zinc}"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
home="$tmp/home" proj="$tmp/home/proj"
mkdir -p "$home/.claude" "$proj" "$tmp/bin"
echo '{}' > "$home/.claude/settings.json"
proj=$(cd "$proj" && pwd -P)
ln -s "$(pwd)/tests/data/agents/fake_agent.py" "$tmp/bin/claude"

# run <name> <frames> <shots> [env...]: one start of the app on $tmp/<name>.in
run() {
  n=$1 frames=$2 shots=$3; shift 3
  env HOME="$home" PATH="$tmp/bin:$PATH" FAKE_AGENT_LOG="$tmp/agents.log" FAKE_SLOW_S=0 ZINC_HEADLESS=1 ZINC_SCALE=1 "$@" \
    ZINC_INPUT="$tmp/$n.in" ZINC_FRAMES=$frames ZINC_SHOT="$tmp/$n.png" ZINC_SHOT_FRAMES=$shots \
    ZINC_SCENE_DUMP="$tmp/$n.scn" timeout 100 "$Z" run examples/agents -- "$proj" > "$tmp/$n.out" 2>&1 \
    || { echo "agents usage: the $n run failed: $(tail -5 "$tmp/$n.out")"; exit 1; }
}
cat > "$tmp/turn.in" <<'IN'
200 move 700 806
201 down
202 up
210 text "hang"
211 key Enter
500 move 430 207
501 down
502 up
9000 key Escape
29990 move 700 806
29991 down
29992 up
30000 text "slow"
30001 key Enter
50000 move 430 207
50001 down
50002 up
IN
run turn 50600 8000,8013,49990,50500
# Settings: the limits are checked every 5 minutes by default, two « + » make it 7, then « − » stops at 1 (kept in settings.json)
{ printf '5 move 24 814\n6 down\n7 up\n'
  for f in 20 30; do printf '%s move 300 157\n%s down\n%s up\n' $f $((f + 1)) $((f + 2)); done
  f=110; while [ $f -lt 200 ]; do printf '%s move 216 157\n%s down\n%s up\n' $f $((f + 1)) $((f + 2)); f=$((f + 10)); done
} > "$tmp/again.in"
run again 400 10,100,300
printf '5 reducemotion 1\n' > "$tmp/still.in"
sed -n '1,8p' "$tmp/turn.in" >> "$tmp/still.in"
printf '8050 key Escape\n8060 key Escape\n' >> "$tmp/still.in"   # SIGINT, then SIGKILL: no fake left behind
run still 8100 8000,8013 AGENTS_DATA="$tmp/data-still"
[ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.png "$tmp"/*.scn "$tmp"/*.out "$tmp/agents.log" "$KEEP/" 2>/dev/null
fail=0
texts() { tools/scene-texts "$tmp/$1.scn" 2>/dev/null; }
has() { texts "$1" | grep -qF -- "$2" || { echo "agents usage: $1 does not show: $2"; fail=1; }; }
count() { [ "$(texts "$1" | grep -cxF -- "$2")" = "$3" ] || { echo "agents usage: $1 shows $2 $(texts "$1" | grep -cxF -- "$2") times, not $3"; fail=1; }; }
# pixels of a box that differ between two frames
changed() {
  python3 - "$@" <<'PY'
import struct, sys, zlib
def rows(path):
    d = open(path, 'rb').read(); i = 8; idat = b''
    while i < len(d):
        n, t = struct.unpack('>I4s', d[i:i + 8]); body = d[i + 8:i + 8 + n]; i += 12 + n
        if t == b'IHDR': w, h, ct = struct.unpack('>II', body[:8]) + (body[9],)
        elif t == b'IDAT': idat += body
    bpp = {2: 3, 6: 4}[ct]; raw = zlib.decompress(idat); stride = w * bpp; out = []; prev = bytearray(stride); k = 0
    for y in range(h):
        f = raw[k]; line = bytearray(raw[k + 1:k + 1 + stride]); k += 1 + stride
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0; b = prev[x]; c = prev[x - bpp] if x >= bpp else 0
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + b) & 255
            elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        out.append(bytes(line)); prev = line
    return bpp, out
x0, y0, x1, y1 = map(int, sys.argv[3:7])
(bpp, a), (_, b) = rows(sys.argv[1]), rows(sys.argv[2])
print(sum(1 for y in range(y0, y1) for x in range(x0 * bpp, x1 * bpp) if a[y][x] != b[y][x]))
PY
}
LINE='348 198 370 216' CARD='1068 235 1092 257'   # the spinners' boxes
# the turn runs: one line, the spinners turn (the line's, and the card's once the line is open)
has turn-8000 'Running… · '
has turn-8013 '1 tool'
[ "$(changed "$tmp/turn-8000.png" "$tmp/turn-8013.png" $LINE)" -gt 20 ] || { echo "agents usage: the activity line's spinner does not turn"; fail=1; }
[ "$(changed "$tmp/turn-8000.png" "$tmp/turn-8013.png" $CARD)" -gt 20 ] || { echo "agents usage: the tool card's spinner does not turn"; fail=1; }
# over: the summaries, the interruption and the failed tool marked; open, then folded
has turn-49990 'Used 1 tool'
has turn-49990 'interrupted'
has turn-49990 'Used 2 tools'
has turn-49990 '1 failed'
count turn-49990 'npm test' 2   # the card and the detail panel
count turn-50500 'npm test' 1   # the detail panel only
count turn-50500 '↑13k ↓1.8k · ctx 6% · $0.042' 2   # the turn's header and the status bar
has turn-50500 '5h 8% · wk 22%'
# a restart: the totals, the summary and the folding come back from disk
count again-300 '↑13k ↓1.8k · ctx 6% · $0.042' 2
has again-300 'Used 2 tools'
count again-300 'npm test' 0
has again-10 '5 min'
has again-100 '7 min'
has again-300 '1 min'
[ "$(cat "$home/.zinc-agents/settings.json")" = '{"limitsRefresh":1,"goUsage":true}' ] || { echo "agents usage: the interval does not stop at 1 minute"; fail=1; }
# reduced motion: the same line, a spinner that does not move
has still-8000 'Running… · '
has still-8000 'running'   # the card says it in words
[ "$(changed "$tmp/still-8000.png" "$tmp/still-8013.png" $LINE)" = 0 ] || { echo "agents usage: the spinner moves with reduced motion"; fail=1; }
[ "$(changed "$tmp/still-8000.png" "$tmp/still-8013.png" $CARD)" = 0 ] || { echo "agents usage: the card's spinner moves with reduced motion"; fail=1; }
grep -q '^claude \["-p", "/usage", "--output-format", "json", "--no-session-persistence"\]' "$tmp/agents.log" \
  || { echo "agents usage: the limits were not asked with /usage"; fail=1; }
[ $fail -eq 0 ] && echo "agents usage: ok"
exit $fail
