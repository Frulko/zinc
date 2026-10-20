#!/bin/sh
# examples/agents: conversations in a folder with the three agent CLIs, headless. A made-up home holds each CLI's configuration and a
# project; fake claude, codex and opencode (tests/data/agents/fake_agent.py) answer in their own stream formats and log their arguments.
# Checked: Claude's token deltas stream into one answer (its repeated full message is not shown), its tool calls are cards with their
# summary and the subagent's call hangs under its agent card, the detail panel lists them; the second message resumes the session; the
# project's CLAUDE.md opens in the viewer; the mode, model, effort and fast chosen in the menus become the flags; Codex's models come
# from its catalog (hidden ones left out) and Escape closes the menu; Codex gets its stdin closed and its config warning is not shown;
# opencode's failure shows its stderr; Escape stops a turn that hangs (SIGINT, then SIGTERM), the turn reads interrupted and the next
# message resumes the session; the real CLI's stream replayed shows its tools and subagent; every CLI runs read-only in the chosen
# folder; a secret file is listed, never opened; idle frames paint nothing. KEEP=dir keeps the frames and the logs.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
export ZINC_HOME="${ZINC_HOME:-$HOME/.zinc}"   # the toolchains and plugin caches stay the real ones when HOME moves
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
home="$tmp/home" proj="$tmp/home/proj"
mkdir -p "$home/.claude" "$home/.codex" "$home/.config/opencode" "$proj" "$tmp/bin"
echo '{"model":"opus"}' > "$home/.claude/settings.json"
echo '{"oauthAccount":"SECRET-TOKEN"}' > "$home/.claude.json"
echo 'model = "o3"' > "$home/.codex/config.toml"
echo '{"token":"SECRET-TOKEN"}' > "$home/.codex/auth.json"
echo '{}' > "$home/.config/opencode/opencode.json"
printf '# Test project\nRules for the agents.\n' > "$proj/CLAUDE.md"
echo '# Agents' > "$proj/AGENTS.md"
proj=$(cd "$proj" && pwd -P)   # the folder as the CLIs see it (/private/var, not /var)
for n in claude codex opencode; do ln -s "$(pwd)/tests/data/agents/fake_agent.py" "$tmp/bin/$n"; done

# The window is 1440x860 (zinc.json). Headless frames take about a tenth of a millisecond and a fake CLI (Python) some 100 ms to
# start: each turn waits 40000 frames.
cat > "$tmp/input" <<'IN'
20 move 700 806
21 down
22 up
30 text hello
31 key Enter
40010 text again
40011 key Enter
70000 move 560 86
70001 down
70002 up
70100 key Escape
70200 move 401 763
70201 down
70202 up
70300 move 380 693
70301 down
70302 up
70400 move 526 763
70401 down
70402 up
70500 move 500 665
70501 down
70502 up
70600 move 642 763
70601 down
70602 up
70700 move 620 665
70701 down
70702 up
70800 move 700 763
70801 down
70802 up
70900 move 700 806
70901 down
70902 up
70910 text tuned
70911 key Enter
110010 move 959 56
110011 down
110012 up
110030 move 700 806
110031 down
110032 up
110040 text "hi codex"
110041 key Enter
150000 move 526 763
150001 down
150002 up
150110 key Escape
150300 move 1054 56
150301 down
150302 up
150320 move 700 806
150321 down
150322 up
150330 text "hi open"
150331 key Enter
190010 text fail
190011 key Enter
230010 move 856 56
230011 down
230012 up
230030 move 700 806
230031 down
230032 up
230040 text hang
230041 key Enter
250000 key Escape
280000 text after
280001 key Enter
320000 text replay
320001 key Enter
360000 move 24 110
360001 down
360002 up
IN
env HOME="$home" PATH="$tmp/bin:$PATH" FAKE_AGENT_LOG="$tmp/agents.log" ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_PROFILE=1 \
  ZINC_INPUT="$tmp/input" ZINC_FRAMES=360300 \
  ZINC_SHOT="$tmp/f.png" ZINC_SHOT_FRAMES=39990,69990,70090,70290,70490,70690,70890,109990,149990,150100,150200,189990,229990,249990,279990,319990,359990,360290 \
  ZINC_SCENE_DUMP="$tmp/s.scn" timeout 120 "$Z" run ../examples/agents -- "$proj" > "$tmp/run.out" 2>&1 \
  || { echo "agents: the run failed: $(tail -5 "$tmp/run.out")"; exit 1; }
[ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.png "$tmp"/*.scn "$tmp/agents.log" "$tmp/run.out" "$KEEP/" 2>/dev/null
fail=0
texts() { tools/scene-texts "$tmp/s-$1.scn" 2>/dev/null; }
has() { texts "$1" | grep -qF -- "$2" || { echo "agents: frame $1 does not show: $2"; fail=1; }; }
hasnt() { ! texts "$1" | grep -qF -- "$2" || { echo "agents: frame $1 shows: $2"; fail=1; }; }
has 39990 'Hello from Claude: hello'
has 39990 'CLAUDE.md'
has 39990 'Look around'
has 39990 '*.md'
has 39990 '1 tool'
has 39990 'TOOLS · 3'
has 39990 'AGENTS · 1'
has 39990 'Done.'
hasnt 39990 'REPEATED'
has 39990 'default model · Read only'
has 69990 'Hello from Claude: again'
has 70090 'Rules for the agents.'
has 109990 'Hello from Claude: tuned'
has 109990 'opus · high · fast · Edit files'
has 149990 'Codex says: hi codex'
has 149990 'ls'
hasnt 149990 'WARNING'
has 150100 'GPT-Test'
hasnt 150100 'GPT-Hidden'
hasnt 150200 'GPT-Test'
has 189990 'opencode says: hi open'
has 229990 'boom: no provider'
has 249990 'Esc stops'
has 279990 'interrupted'
has 319990 'Hello from Claude: after'
has 359990 'Read first line of notes'
has 359990 'and the subagent reported'
has 360290 '~/.claude/settings.json'
has 360290 'secret'
hasnt 360290 'SECRET-TOKEN'
log="$tmp/agents.log"
grep '^claude .*"hello"' "$log" | grep -q '"--permission-mode", "plan".*fastoff=1$' || { echo "agents: claude did not run in plan mode, fast mode off"; fail=1; }
grep '^claude .*"tuned"' "$log" | grep -F '"--permission-mode", "acceptEdits"' | grep -F '"--model", "opus", "--effort", "high", "--settings", "{\"fastMode\":true}"' | grep -q 'fastoff=$' \
  || { echo "agents: the settings did not reach claude: $(grep '"tuned"' "$log")"; fail=1; }
[ "$(grep -c '^claude .*"hello"' "$log")" = 1 ] && ! grep '^claude .*"hello"' "$log" | grep -q -- '--resume' || { echo "agents: the first message resumed a session"; fail=1; }
grep '^claude .*"again"' "$log" | grep -q '"--resume", "s-claude"' || { echo "agents: the second message did not resume s-claude"; fail=1; }
grep -q '^codex .*"sandbox_mode=\\"read-only\\""' "$log" || { echo "agents: codex did not run read-only"; fail=1; }
grep -q '^opencode .*"--agent", "plan"' "$log" || { echo "agents: opencode did not run the plan agent"; fail=1; }
[ "$(sed -n '/^claude got SIG/p' "$log" | tr '\n' ' ')" = "claude got SIGINT claude got SIGTERM " ] || { echo "agents: Escape did not send SIGINT then SIGTERM: $(grep 'got SIG' "$log")"; fail=1; }
grep '^claude .*"after"' "$log" | grep -q '"--resume", "s-claude"' || { echo "agents: the message after the interrupted turn did not resume s-claude"; fail=1; }
[ "$(grep '"--json"\|"-p"\|"--format"' "$log" | grep -vF '"/usage"' | grep -vc "cwd=$proj fastoff")" = 0 ]   # /usage: the limits, in the temporary folder || { echo "agents: a turn ran outside the folder"; fail=1; }
grep -q 'zinc profile: paint p50=0.00 ' "$tmp/run.out" || { echo "agents: idle frames are painted: $(grep 'profile: paint' "$tmp/run.out")"; fail=1; }
[ $fail -eq 0 ] && echo "agents chat: ok"
exit $fail
