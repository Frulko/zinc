#!/bin/sh
# Zinc Atelier as an IDE (ZN-728): the app (app/atelier) runs headless on scripted sessions.
#   editing    the editing commands (indent, several cursors, comments, pairs, lines, undo) as plain functions: app/atelier/selftest.ts
#   session    File > Open Example > Hello through the desktop menu (zinc:system), Run: the steps of the build and the program's line are in
#              the console, the status line says how it ended; the window, console folded again, is the golden
#   check      a sketch with a type error in its second file, saved with the keyboard: the status line names the problem of `zinc check`
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

mkdir -p "$tmp/broken"
printf "import { size } from './util';\nconsole.log(size);\n" > "$tmp/broken/main.ts"
printf "export const size: i32 = 'forty';\n" > "$tmp/broken/util.ts"
printf '4 key s meta\n' > "$tmp/keys"
ZINC_ATELIER_HOME="$tmp/book" ZINC_ATELIER_SYNC=1 ZINC_ATELIER_ECHO=1 ZINC_SYSTEM_LOG=/dev/null ZINC_INPUT="$tmp/keys" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=8 \
  "$ZINC" run app/atelier -- "$tmp/broken" >"$tmp/out" 2>"$tmp/err" || { echo "atelier check failed: $(head -c 300 "$tmp/err")"; fail=1; }
grep -q "^\[status\] 1 problem: util.ts:1 Type is not assignable: 'string' to 'i32'" "$tmp/out" || { echo "atelier check: the diagnostic of zinc check is not on the status line: $(grep status "$tmp/out" | tail -2)"; fail=1; }
exit $fail
