#!/bin/sh
# Zinc Atelier as an IDE (ZN-728): the app (app/atelier) runs headless on scripted sessions.
#   editing    the editing commands (indent, several cursors, comments, pairs, lines, undo) as plain functions: app/atelier/selftest.ts
#   session    File > Open Example > Hello through the desktop menu (zinc:system), Run: the steps of the build and the program's line are in
#              the console, the status line says how it ended; the window, console folded again, is the golden
#   console    the console is a text that can be taken elsewhere (ZN-734): a line longer than the card wraps onto the rows it needs (four
#              here; its second row was drawn over the next line), a click on the place it names opens the file there, three clicks select
#              a line and Cmd+C copies it, Copy the Console takes every line. The golden: the end of the console with the selected line
#   check      a sketch with a type error in its second file, saved with the keyboard: the status line names the problem of `zinc check`
#   assist     the language server beside the editor (ZN-732): `b.st` typed in a sketch opens the completion popup on the members of
#              its class (the golden: two rows, the signature and the doc of the selected one), a diagnostic arrives before any save,
#              Enter puts `step` in the text, `(` brings the signature with its first parameter marked; the server ends with Atelier
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
g=tests/golden/atelier
"$ZINC" run app/atelier/selftest.ts >"$tmp/self" 2>&1 || { echo "atelier editing: $(grep -c '^FAIL' "$tmp/self") check(s) fail: $(grep -m1 '^FAIL' "$tmp/self")"; fail=1; }

printf '1 menu-click example:hello\n' > "$tmp/menu"
printf '4 run\n8 console\n' > "$tmp/session"
ZINC_ATELIER_HOME="$tmp/book" ZINC_ATELIER_SYNC=1 ZINC_ATELIER_ECHO=1 ZINC_SYSTEM_SCRIPT="$tmp/menu" ZINC_SYSTEM_LOG="$tmp/system" ZINC_ATELIER_SCRIPT="$tmp/session" \
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 ZINC_SCALE=1 ZINC_SHOT="$tmp/ide.png" ZINC_SHOT_FRAMES=30 "$ZINC" run app/atelier >"$tmp/out" 2>"$tmp/err" \
  || { echo "atelier session failed: $(head -c 300 "$tmp/err")"; fail=1; }
grep -q '"label":"Sketch".*"id":"run".*"accelerator":"Cmd+R"' "$tmp/system" || { echo "atelier session: the desktop menu has no Sketch > Run with its shortcut"; fail=1; }
[ -f "$tmp/book/hello/main.ts" ] || { echo "atelier session: the example was not opened as a copy in the sketchbook"; fail=1; }
grep -q '^\[console\]   run  ' "$tmp/out" || { echo "atelier session: the steps of the build are not in the console: $(grep console "$tmp/out" | head -5)"; fail=1; }
grep -q '^\[console\] Hello from Zinc$' "$tmp/out" || { echo "atelier session: the program's output is not in the console: $(tail -3 "$tmp/out")"; fail=1; }
grep -q '^\[status\] Finished$' "$tmp/out" || { echo "atelier session: the status line does not say the program finished"; fail=1; }
tools/pngdiff "$tmp/ide-30.png" "$g/ide-30.png" >/dev/null || { echo "atelier session: frame 30 differs from $g/ide-30.png"; fail=1; }
[ -n "$ATELIER_KEEP" ] && cp "$tmp/ide-30.png" "$ATELIER_KEEP"   # the frame of this run, to look at it or to renew the golden

mkdir -p "$tmp/wrap"
printf "for (let i = 1; i <= 7; i++) console.log('row ' + i);\nconsole.log('A line longer than the console card: it names the device, what it is, what is built for it and why, and it goes on well past the right edge of the card so that it has to wrap onto a second row, and then onto a third one for good measure, without ever being drawn over the line that follows it, as the line of a failed build did: zinc: cmake --build failed, with the whole command behind it, its directory, its target and what the shell answered, sh: cmake: command not found, all of it on one line of the console (main.ts:3:1).');\nconsole.log('the line after it');\n" > "$tmp/wrap/main.ts"
printf '4 run\n55 clipboard\n56 copy-console\n57 clipboard\n' > "$tmp/session"
# a click on the place the long line names (frame 40), three clicks on the line after it (44 to 49), Cmd+C
printf '%s\n' "40 move 130 733" "40 down" "41 up" "44 move 80 752" "44 down" "45 up" "46 down" "47 up" "48 down" "49 up" "50 key c meta" > "$tmp/keys"
ZINC_ATELIER_HOME="$tmp/book" ZINC_ATELIER_SYNC=1 ZINC_ATELIER_ECHO=1 ZINC_SYSTEM_LOG=/dev/null ZINC_ATELIER_SCRIPT="$tmp/session" ZINC_INPUT="$tmp/keys" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=60 ZINC_SCALE=1 \
  ZINC_SHOT="$tmp/console.png" ZINC_SHOT_FRAMES=60 "$ZINC" run app/atelier -- "$tmp/wrap" >"$tmp/out" 2>"$tmp/err" || { echo "atelier console failed: $(head -c 300 "$tmp/err")"; fail=1; }
[ "$(grep -c '^\[clipboard\]' "$tmp/out")" = 2 ] && sed -n '/^\[clipboard\]/p' "$tmp/out" | head -1 | grep -q '^\[clipboard\] the line after it$' \
  || { echo "atelier console: three clicks on a line and Cmd+C did not copy it: $(grep '^\[clipboard\]' "$tmp/out" | head -1 | cut -c1-200)"; fail=1; }
grep -q '^\[clipboard\] \$ zinc run main.ts | .* | row 1 | .* | the line after it | exit 0$' "$tmp/out" || { echo "atelier console: Copy the Console did not take every line: $(grep '^\[clipboard\]' "$tmp/out" | tail -1 | cut -c1-200)"; fail=1; }
# the console's text (the long line on four rows, the selected line) and the caret's place after the click on main.ts:3:1
tools/pngdiff "$tmp/console-60.png" "$g/console-60.png" --crop 12,566,1250,222 >/dev/null && tools/pngdiff "$tmp/console-60.png" "$g/console-60.png" --crop 1140,530,100,28 >/dev/null \
  || { echo "atelier console: the wrapped line, the selection or the place opened differ from $g/console-60.png"; fail=1; }
[ -n "$ATELIER_KEEP" ] && cp "$tmp/console-60.png" "$(dirname "$ATELIER_KEEP")/console-60.png"

mkdir -p "$tmp/broken"
printf "import { size } from './util';\nconsole.log(size);\n" > "$tmp/broken/main.ts"
printf "export const size: i32 = 'forty';\n" > "$tmp/broken/util.ts"
printf '4 key s meta\n' > "$tmp/keys"
ZINC_ATELIER_HOME="$tmp/book" ZINC_ATELIER_SYNC=1 ZINC_ATELIER_ECHO=1 ZINC_SYSTEM_LOG=/dev/null ZINC_INPUT="$tmp/keys" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=8 \
  "$ZINC" run app/atelier -- "$tmp/broken" >"$tmp/out" 2>"$tmp/err" || { echo "atelier check failed: $(head -c 300 "$tmp/err")"; fail=1; }
grep -q "^\[status\] 1 problem: util.ts:1 Type is not assignable: 'string' to 'i32'" "$tmp/out" || { echo "atelier check: the diagnostic of zinc check is not on the status line: $(grep status "$tmp/out" | tail -2)"; fail=1; }

mkdir -p "$tmp/assist"
printf "import { Ball } from './ball';\nconst b = new Ball();\n\nconsole.log(b.x);\n" > "$tmp/assist/main.ts"
printf "/** A ball that bounces between the walls. */\nexport class Ball {\n  /** Position, in pixels from the left. */\n  x: number = 0;\n  vx: number = 120;\n  /** Moves the ball by one frame and bounces on the walls. */\n  step(dt: number, width: number): void {\n    this.x += this.vx * dt;\n    if (this.x < 0 || this.x > width) this.vx = -this.vx;\n  }\n  stop(): void { this.vx = 0; }\n}\n" > "$tmp/assist/ball.ts"
printf '6 key ArrowDown\n7 key ArrowDown\n9 text "b"\n10 text "."\n12 text "s"\n13 text "t"\n16 key Enter\n18 text "("\n22 key s meta\n' > "$tmp/keys"
ZINC_ATELIER_HOME="$tmp/book" ZINC_ATELIER_SYNC=1 ZINC_ATELIER_ECHO=1 ZINC_SYSTEM_LOG=/dev/null ZINC_INPUT="$tmp/keys" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=26 ZINC_SCALE=1 \
  ZINC_SHOT="$tmp/assist.png" ZINC_SHOT_FRAMES=15 "$ZINC" run app/atelier -- "$tmp/assist" >"$tmp/out" 2>"$tmp/err" || { echo "atelier assist failed: $(head -c 300 "$tmp/err")"; fail=1; }
grep -q '^\[lsp\] completion 4 item(s), 4 shown: x$' "$tmp/out" || { echo "atelier assist: no popup with the members of Ball after the dot: $(grep '^\[lsp\]' "$tmp/out" | head -4)"; fail=1; }
grep -q "^\[status\] 1 problem: main.ts:3 Property does not exist: 'st' on 'Ball'" "$tmp/out" || { echo "atelier assist: no diagnostic from the server while typing: $(grep status "$tmp/out" | tail -2)"; fail=1; }
grep -q '^\[lsp\] signature step(dt: number, width: number): void \[dt: number\]$' "$tmp/out" || { echo "atelier assist: no signature with its first parameter marked: $(grep '^\[lsp\]' "$tmp/out" | tail -2)"; fail=1; }
grep -q '^b\.step()$' "$tmp/assist/main.ts" || { echo "atelier assist: the accepted item is not in the text: $(sed -n 3p "$tmp/assist/main.ts")"; fail=1; }
tools/pngdiff "$tmp/assist-15.png" "$g/assist-15.png" >/dev/null || { echo "atelier assist: frame 15 differs from $g/assist-15.png"; fail=1; }
[ -n "$ATELIER_KEEP" ] && cp "$tmp/assist-15.png" "$(dirname "$ATELIER_KEEP")/assist-15.png"
pid=$(sed -n 's/^\[lsp\] started //p' "$tmp/out" | head -1)
n=0; while [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && [ $n -lt 10 ]; do sleep 0.2; n=$((n + 1)); done   # it ends when its stdin closes
[ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && { echo "atelier assist: the language server $pid outlives Atelier"; fail=1; }
# the name prompt keeps what is typed: a new file named with five letters (each typed character used to be selected and replaced by the next)
mkdir -p "$tmp/name" && printf "console.log('hi');\n" > "$tmp/name/main.ts"
printf '6 add-file\n' > "$tmp/name.script"
printf '10 text "s"\n11 text "c"\n12 text "e"\n13 text "n"\n14 text "e"\n17 key Enter\n' > "$tmp/name.keys"
ZINC_ATELIER_HOME="$tmp/book" ZINC_ATELIER_SYNC=1 ZINC_SYSTEM_LOG=/dev/null ZINC_ATELIER_SCRIPT="$tmp/name.script" ZINC_INPUT="$tmp/name.keys" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=24 ZINC_SCALE=1 \
  "$ZINC" run app/atelier -- "$tmp/name" >/dev/null 2>"$tmp/err" || { echo "atelier name prompt failed: $(head -c 300 "$tmp/err")"; fail=1; }
[ -f "$tmp/name/scene.ts" ] || { echo "atelier name prompt: typing \"scene\" did not make scene.ts: $(ls "$tmp/name" | tr '\n' ' ')"; fail=1; }
exit $fail
