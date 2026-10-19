#!/bin/sh
# examples/agents: chats in a folder with the three agent CLIs, headless. A made-up home holds each CLI's configuration and a project;
# fake claude, codex and opencode (tests/data/agents/fake_agent.py) answer in their own stream formats and log their arguments.
# Checked: Claude's token deltas stream into one answer (its repeated full message is not shown) and the second message resumes the
# session; Codex gets its stdin closed and its config warning is not shown; opencode's failure shows its stderr; every CLI runs
# read-only in the chosen folder; a secret file is listed, never opened; the project's CLAUDE.md opens in the viewer; idle frames paint
# nothing. KEEP=dir keeps the frames and the logs.
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

# Headless frames take a few hundredths of a millisecond and a fake CLI (Python) some 100 ms to start: each step waits 40000 frames.
cat > "$tmp/input" <<'IN'
20 move 697 730
21 down
22 up
30 text hello
31 key Enter
40010 text again
40011 key Enter
80010 move 1020 24
80011 down
80012 up
80030 move 697 730
80031 down
80032 up
80040 text "hi codex"
80041 key Enter
120010 move 1115 24
120011 down
120012 up
120030 move 697 730
120031 down
120032 up
120040 text "hi open"
120041 key Enter
160010 text fail
160011 key Enter
200010 move 915 24
200011 down
200012 up
200030 move 380 88
200031 down
200032 up
IN
env HOME="$home" PATH="$tmp/bin:$PATH" FAKE_AGENT_LOG="$tmp/agents.log" ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_PROFILE=1 \
  ZINC_INPUT="$tmp/input" ZINC_FRAMES=200300 ZINC_SHOT="$tmp/f.png" ZINC_SHOT_FRAMES=39990,79990,119990,159990,199990,200290 \
  ZINC_SCENE_DUMP="$tmp/s.scn" timeout 90 "$Z" run ../examples/agents -- "$proj" > "$tmp/run.out" 2>&1 \
  || { echo "agents: the run failed: $(tail -5 "$tmp/run.out")"; exit 1; }
[ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.png "$tmp"/*.scn "$tmp/agents.log" "$tmp/run.out" "$KEEP/" 2>/dev/null
fail=0
texts() { tools/scene-texts "$tmp/s-$1.scn" 2>/dev/null; }
has() { texts "$1" | grep -qF -- "$2" || { echo "agents: frame $1 does not show: $2"; fail=1; }; }
hasnt() { ! texts "$1" | grep -qF -- "$2" || { echo "agents: frame $1 shows: $2"; fail=1; }; }
has 39990 'Hello from Claude: hello'
has 39990 '› Read'
has 39990 'Done.'
hasnt 39990 'REPEATED'
has 39990 '~/.claude/settings.json'
has 39990 'secret'
has 79990 'Hello from Claude: again'
has 119990 'Codex says: hi codex'
has 119990 '› ls'
hasnt 119990 'WARNING'
has 159990 'opencode says: hi open'
has 199990 'boom: no provider'
has 200290 'Rules for the agents.'
hasnt 200290 'SECRET-TOKEN'
log="$tmp/agents.log"
grep -q "^claude .*\"--permission-mode\", \"plan\"" "$log" || { echo "agents: claude did not run in plan mode"; fail=1; }
[ "$(grep -c '^claude .*"hello"' "$log")" = 1 ] && ! grep '^claude .*"hello"' "$log" | grep -q -- '--resume' || { echo "agents: the first message resumed a session"; fail=1; }
grep '^claude .*"again"' "$log" | grep -q '"--resume", "s-claude"' || { echo "agents: the second message did not resume s-claude"; fail=1; }
grep -q '^codex .*"-s", "read-only"' "$log" || { echo "agents: codex did not run read-only"; fail=1; }
grep -q '^opencode .*"--agent", "plan"' "$log" || { echo "agents: opencode did not run the plan agent"; fail=1; }
[ "$(grep -v -- '--version' "$log" | grep -vc "cwd=$proj\$")" = 0 ] || { echo "agents: a CLI ran outside the folder: $(grep -v "cwd=$proj\$" "$log" | head -1)"; fail=1; }
grep -q 'zinc profile: paint p50=0.00 ' "$tmp/run.out" || { echo "agents: idle frames are painted: $(grep 'profile: paint' "$tmp/run.out")"; fail=1; }
[ $fail -eq 0 ] && echo "agents chat: ok"
exit $fail
