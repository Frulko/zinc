#!/bin/sh
# examples/agents: references, markdown and copy, headless. Files dropped on the window (ZINC_SYSTEM_SCRIPT) become chips and
# references in the message field: an image `[Image #1]`, a file in the folder `@src/word.ts`, a folder `@src/`, a file outside it
# its absolute path; a chip's × removes it and its reference (`@src/word.ts` stays when `@src/` goes). Claude gets the image as `@red.png` in its prompt. The answer, streamed in
# small pieces, is drawn as markdown once done: a heading, inline marks inside one text, list items, a quote, a fenced block under its
# language, a table. The answer's copy button puts its markdown source on the clipboard ("Copied"), a code block's its code; a part of a
# paragraph selected with the mouse copies with Cmd+C (each pasted into the field to read it back). Typing `@wo` lists the folder's
# matching files; ArrowDown and Enter put the second one in. KEEP=dir keeps the frames and the logs.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
export ZINC_HOME="${ZINC_HOME:-$HOME/.zinc}"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
home="$tmp/home" proj="$tmp/home/proj"
mkdir -p "$home/.claude" "$proj/src" "$tmp/bin"
echo '{}' > "$home/.claude/settings.json"
echo 'export const word = 1;' > "$proj/src/word.ts"
echo 'x' > "$proj/src/words.md"
echo 'notes' > "$tmp/notes.txt"
python3 -c "import struct, sys, zlib
c = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))
raw = b''.join(b'\x00' + b'\xff\x00\x00' * 8 for _ in range(8))
open(sys.argv[1], 'wb').write(b'\x89PNG\r\n\x1a\n' + c(b'IHDR', struct.pack('>IIBBBBB', 8, 8, 8, 2, 0, 0, 0)) + c(b'IDAT', zlib.compress(raw)) + c(b'IEND', b''))" "$proj/red.png"
proj=$(cd "$proj" && pwd -P) notes=$(cd "$tmp" && pwd -P)/notes.txt
ln -s "$(pwd)/tests/data/agents/fake_agent.py" "$tmp/bin/claude"

# drops come first (a tick of the system script is a pass of the loop, at least one a frame); the rest is in frames
cat > "$tmp/system" <<SYS
5 drop $proj/red.png
6 drop $proj/src/word.ts
7 drop $proj/src
8 drop $notes
SYS
cat > "$tmp/input" <<'IN'
140 move 672 763
141 down
142 up
160 move 704 763
161 down
162 up
200 move 700 806
201 down
202 up
210 key End
220 text "markdown please"
221 key Enter
40210 move 1085 189
40250 down
40251 up
40300 move 700 806
40301 down
40302 up
40310 key v meta
40340 key a meta
40341 key Backspace
40350 text "see @wo"
40380 key ArrowDown
40400 key Enter
40500 key a meta
40501 key Backspace
40510 move 360 257
40511 down
40512 move 500 257
40513 move 640 257
40514 up
40520 key c meta
40530 move 700 806
40531 down
40532 up
40540 key v meta
40600 key a meta
40601 key Backspace
40610 move 1081 432
40611 down
40612 up
40620 move 700 806
40621 down
40622 up
40630 key v meta
IN
env HOME="$home" PATH="$tmp/bin:$PATH" FAKE_AGENT_LOG="$tmp/agents.log" ZINC_HEADLESS=1 ZINC_SCALE=1 \
  ZINC_INPUT="$tmp/input" ZINC_SYSTEM_SCRIPT="$tmp/system" ZINC_FRAMES=40700 \
  ZINC_SHOT="$tmp/f.png" ZINC_SHOT_FRAMES=130,150,170,40200,40240,40270,40330,40370,40420,40525,40560,40650 \
  ZINC_SCENE_DUMP="$tmp/s.scn" timeout 100 "$Z" run ../examples/agents -- "$proj" > "$tmp/run.out" 2>&1 \
  || { echo "agents markdown: the run failed: $(tail -5 "$tmp/run.out")"; exit 1; }
[ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.png "$tmp"/*.scn "$tmp/agents.log" "$tmp/run.out" "$KEEP/" 2>/dev/null
fail=0
texts() { tools/scene-texts "$tmp/s-$1.scn" 2>/dev/null; }
has() { texts "$1" | grep -qxF -- "$2" || { echo "agents markdown: frame $1 has no text: $2"; fail=1; }; }
hasnt() { ! texts "$1" | grep -qF -- "$2" || { echo "agents markdown: frame $1 shows: $2"; fail=1; }; }
has 130 "[Image #1] @src/word.ts @src/ @$notes "
has 130 'Image #1 · red.png'
has 130 'src/word.ts'
has 130 'src'
has 130 'notes.txt'
has 150 "[Image #1] @src/word.ts @$notes "
hasnt 150 '@src/ '
has 170 '[Image #1] @src/word.ts '   # the file outside goes too: the bubble keeps one line, whatever the temporary folder's name
# the markdown, as texts without their marks
has 40200 'Build notes'
has 40200 'make all'   # a text with runs draws each run apart
has 40200 'care'
has 40200 'build/log.txt'
has 40200 'guide'
has 40200 'second with '
has 40200 'nested item'
has 40200 '1.'
has 40200 'a quoted line'
has 40200 'sh'
has 40200 'echo done'
has 40200 'Size'
has 40200 'b.ts'
hasnt 40200 '**'
hasnt 40200 '```'
has 40240 'Copy answer'
has 40270 'Copied'
has 40330 '## Build notes  Run **make all** with *care*, then read `build/log.txt` and the [guide](https://example.com/guide).  - first step - second with `code`   - nested item 1. numbered  > a quoted line  ```sh make all echo done ```  | Name | Size | |------|-----:| | a.ts | 12 | | b.ts | 7 |  That is all.'
has 40370 'src/word.ts'
has 40370 'src/words.md'
has 40420 'see @src/words.md '
has 40560 'un make all with care, then read build/l'
has 40650 'make all echo done'
grep '^claude ' "$tmp/agents.log" | grep -qF '["-p", "@red.png @src/word.ts markdown please",' \
  || { echo "agents markdown: claude did not get the references: $(grep '^claude .*-p' "$tmp/agents.log")"; fail=1; }
[ $fail -eq 0 ] && echo "agents markdown: ok"
exit $fail
