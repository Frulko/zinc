#!/bin/sh
# examples/agents: a long conversation does not grow the app's memory. A fake claude (tests/data/agents/fake_agent.py, prompt
# "flood") answers one turn of 20000 tool calls carrying 200 MB of output, two of them in lines longer than the app's line cap.
# Checked, from the app's AGENTS_STATS lines (every half second) and the process's resident memory sampled from outside: what
# the app holds (items in its window, open items, characters, UI nodes, live objects) stays under fixed ceilings the whole time,
# the window keeps refreshing while the flood runs (the event loop is not starved), the resident memory never passes RSS_CAP_KB
# (the output alone is 200 MB); then the wheel scrolls back into the conversation (older items read from disk) and down to its
# end again. KEEP=dir keeps the frames, the stats and the samples.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
export ZINC_HOME="${ZINC_HOME:-$HOME/.zinc}"
tmp=$(mktemp -d); trap 'kill "$pid" 2>/dev/null; rm -rf "$tmp"' EXIT
home="$tmp/home" proj="$tmp/home/proj"
mkdir -p "$home/.claude" "$proj" "$tmp/bin"
proj=$(cd "$proj" && pwd -P)
ln -s "$(pwd)/tests/data/agents/fake_agent.py" "$tmp/bin/claude"

WINDOW_CAP=240        # items: the window (120) and what joins it at the next frame (at most 120)
OPEN_CAP=16           # items still running (the turn, its open paragraph, the calls without a result)
CHARS_CAP=1048576     # characters held by the items in memory: 512 KB for the window, as much for the next frame's
NODES_CAP=8000        # UI nodes of the whole window
OBJECTS_CAP=120000    # live objects of the program (about 60000 at rest)
RSS_CAP_KB=229376     # 224 MB resident at most (50 to 110 MB measured on an M-series Mac; the output alone is 200 MB; 245 MB on a CI runner
                      # before src/host/loop.cpp stopped reading the child's pipes while 4 MB of its output waited)

# the flood is read in under 10000 frames (they are slow while it lasts); the wheel then goes up 40 steps and down 30
{ printf '20 move 700 806\n21 down\n22 up\n30 text flood\n31 key Enter\n20000 move 700 400\n'
  i=0; while [ $i -lt 40 ]; do echo "$((20010 + i * 100)) wheel 0 20"; i=$((i + 1)); done
  i=0; while [ $i -lt 30 ]; do echo "$((27010 + i * 100)) wheel 0 -40"; i=$((i + 1)); done
} > "$tmp/input"
# the real clock: the stats and the samples are in seconds of the run
env -u ZINC_DETERMINISTIC HOME="$home" PATH="$tmp/bin:$PATH" FAKE_AGENT_LOG="$tmp/agents.log" FAKE_FLOOD_EVENTS=20000 FAKE_FLOOD_MB=200 \
  AGENTS_STATS="$tmp/stats.txt" ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_INPUT="$tmp/input" ZINC_FRAMES=36000 \
  ZINC_SHOT="$tmp/f.png" ZINC_SHOT_FRAMES=19990,26990,35990 ZINC_SCENE_DUMP="$tmp/s.scn" \
  "$Z" run examples/agents -- "$proj" > "$tmp/run.out" 2>&1 &
pid=$!
waited=0
while kill -0 "$pid" 2>/dev/null; do
  ps -o rss= -p "$pid" >> "$tmp/rss.txt" 2>/dev/null
  sleep 0.2; waited=$((waited + 1))
  [ $waited -lt 1500 ] || { echo "agents memory: the run took more than 300 s"; exit 1; }
done
wait "$pid" || { echo "agents memory: the run failed: $(tail -5 "$tmp/run.out")"; exit 1; }
[ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.png "$tmp"/*.scn "$tmp/stats.txt" "$tmp/rss.txt" "$tmp/run.out" "$KEEP/" 2>/dev/null
fail=0
max() { sed -n "s/.* $1=\([0-9]*\).*/\1/p" "$tmp/stats.txt" | sort -n | tail -1; }
for cap in window:$WINDOW_CAP open:$OPEN_CAP chars:$CHARS_CAP nodes:$NODES_CAP objects:$OBJECTS_CAP; do
  k=${cap%%:*} c=${cap#*:} m=$(max "${cap%%:*}")
  [ -n "$m" ] && [ "$m" -le "$c" ] || { echo "agents memory: $k reached ${m:-nothing}, over $c"; fail=1; }
done
items=$(tail -1 "$tmp/stats.txt" | sed -n 's/.* items=\([0-9]*\).*/\1/p')
[ "${items:-0}" -gt 20000 ] || { echo "agents memory: the conversation holds ${items:-no} items, not the whole flood"; fail=1; }
during=$(grep -c ' running=1$' "$tmp/stats.txt")
[ "$during" -ge 10 ] || { echo "agents memory: $during stats lines while the flood ran (the loop starved?)"; fail=1; }
peak=$(sort -n "$tmp/rss.txt" | tail -1 | tr -d ' ')
[ -n "$peak" ] && [ "$peak" -le $RSS_CAP_KB ] || { echo "agents memory: resident memory reached ${peak:-?} KB, over $RSS_CAP_KB"; fail=1; }
steps() { tools/scene-texts "$tmp/s-$1.scn" 2>/dev/null | sed -n 's/.*Step \([0-9]*\) done.*/\1/p' | sort -n; }
[ "$(steps 19990 | tail -1)" = 19950 ] || { echo "agents memory: the end of the flood is not shown: $(steps 19990 | tr '\n' ' ')"; fail=1; }
back=$(steps 26990 | head -1)
[ -n "$back" ] && [ "$back" -lt 19500 ] || { echo "agents memory: scrolling back did not read older items: ${back:-none shown}"; fail=1; }
[ "$(steps 35990 | tail -1)" = 19950 ] || { echo "agents memory: scrolling down did not come back to the end: $(steps 44990 | tr '\n' ' ')"; fail=1; }
[ $fail -eq 0 ] && echo "agents memory: ok (peak $((peak / 1024)) MB resident, window $(max window), $(max chars) chars, $during stats during the flood)"
exit $fail
