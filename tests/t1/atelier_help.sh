#!/bin/sh
# Zinc Atelier tells a newcomer where they are (ZN-774.07), on three short headless sessions:
#   start      the start view says what Zinc is and points to the lessons, offers templates, and groups the examples by style, 3D among
#              them (the texts of its frame, from a scene dump); the pointer resting on the palette button shows its hint
#   help       Help has Learn first, then the guide, the kinds of programs, the syntax, the examples and the error codes (the menu bar
#              the recording simulator logs); Learn opens the lessons in the browser (its opener.open)
#   template   a project from the game template of `zinc new`, without a terminal: made in the sketchbook, then open
#   lesson     the start view lists the lessons of `zinc learn` with their progress; a click on one opens it beside the sketch
#   explain    a sketch with a type error, Run: a click on its error code prints `zinc explain` of that code in the console, its fixes
#              under it; the Reference button opens the code's page of the site
#   no zinc    with no zinc where Atelier looks, the status line says how to fix it
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/home"
for d in toolchains cache index sysroots; do [ -e "${ZINC_HOME:-$HOME/.zinc}/$d" ] && ln -s "${ZINC_HOME:-$HOME/.zinc}/$d" "$tmp/home/$d"; done   # its own config.json, the same toolchains and caches
run() {   # run <name> [VAR=value...]: one session of Atelier on $tmp/<name>.session, its output in $tmp/<name>.out
  name=$1; shift
  env "$@" ZINC_LANG=en ZINC_HOME="$tmp/home" ZINC_ATELIER_HOME="$tmp/book" ZINC_ATELIER_SYNC=1 ZINC_ATELIER_ECHO=1 ZINC_SYSTEM_LOG="$tmp/$name.system" \
    ZINC_ATELIER_SCRIPT="$tmp/$name.session" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 "$ZINC" run app/atelier >"$tmp/$name.out" 2>"$tmp/$name.err" \
    || { echo "atelier help: the $name session failed: $(tail -c 300 "$tmp/$name.err")"; fail=1; }
}

printf '40 help-learn\n41 template:game my-game\n44 quit\n' > "$tmp/start.session"
printf '2 move 1224 27\n' > "$tmp/start.input"
run start ZINC_INPUT="$tmp/start.input" ZINC_FRAMES=44 ZINC_SHOT="$tmp/start.png" ZINC_SHOT_FRAMES=39 ZINC_SCENE_DUMP="$tmp/scene"
[ -n "$ATELIER_KEEP" ] && cp "$tmp/start-39.png" "$ATELIER_KEEP"
python3 tools/scene-texts "$tmp/scene-39" > "$tmp/texts"
for want in 'Zinc is TypeScript for making things' 'Open the lessons' 'Small game' 'All templates' 'New sketch: how do you want to write it?' \
    'Drawing' 'Interface' 'A cube and a ring that turn.' 'A button and its number.' 'Every command, by its name' \
    'Or do them here, one step at a time:' '1. A window and a shape · 0/3' '5. Text and images · 0/3'; do
  grep -q "$want" "$tmp/texts" || { echo "atelier help: the start view does not show \"$want\""; fail=1; }
done
python3 - "$tmp/start.system" <<'EOF' || fail=1
import json, re, sys
bar = [l for l in open(sys.argv[1]) if 'menu.setApp' in l][0]
help = bar[bar.index('"label":"Help"'):]
labels = re.findall(r'"label":"([^"]*)"', help)[1:]
want = ['Learn', 'Getting Started Guide', 'Kinds of Programs', 'Syntax', 'Examples on the Web', 'Error Codes']
if labels[:6] != want: print('atelier help: the Help menu is %s, not %s first' % (labels[:8], want)); sys.exit(1)
EOF
grep -q 'opener.open {"target":"https://frulko.github.io/zinc/docs/learn/"}' "$tmp/start.system" || { echo "atelier help: Learn did not open the lessons: $(grep opener "$tmp/start.system")"; fail=1; }
[ -f "$tmp/book/my-game/zinc.json" ] && [ -f "$tmp/book/my-game/src/main.ts" ] || { echo "atelier help: the game template did not make $tmp/book/my-game"; fail=1; }
grep -q '^\[status\] my-game is ready, made from the game template$' "$tmp/start.out" || { echo "atelier help: the new project is not said open: $(grep status "$tmp/start.out" | tail -2)"; fail=1; }

# ZN-774.26: a click on the first lesson of the start view opens it beside the sketch (its chip at 414,223 on a fresh sketchbook)
rm -f "$tmp/book/.last"; printf '8 quit\n' > "$tmp/lesson.session"; printf '2 move 414 223\n3 down\n4 up\n' > "$tmp/lesson.input"
run lesson ZINC_INPUT="$tmp/lesson.input" ZINC_FRAMES=8
grep -q '^\[lesson\] 01-window-and-shape step 1/3' "$tmp/lesson.out" || { echo "atelier help: the start view's lesson did not open: $(grep -E 'lesson|status' "$tmp/lesson.out" | tail -2)"; fail=1; }

mkdir -p "$tmp/bad"; printf 'const x: number = "a";\nconsole.log(x);\n' > "$tmp/bad/main.ts"
printf '%s' "$tmp/bad" > "$tmp/book/.last"   # the sketch Atelier opens at its start
printf '3 run\n6 explain\n8 reference\n10 quit\n' > "$tmp/explain.session"
run explain ZINC_FRAMES=10
grep -q '^\[console\] \$ zinc explain Z0103$' "$tmp/explain.out" && grep -q '^\[console\] Z0103: ' "$tmp/explain.out" \
  || { echo "atelier help: the error code was not explained: $(grep console "$tmp/explain.out" | tail -4)"; fail=1; }
# ZN-774.28: the fixes under the error, and the Reference button opens its page of the site
grep -q '^\[console\] Fixed:$' "$tmp/explain.out" && grep -q '^\[console\] let a: string = "x";$' "$tmp/explain.out" \
  || { echo "atelier help: the fixes are not shown under the error: $(grep console "$tmp/explain.out" | tail -6)"; fail=1; }
grep -q 'opener.open {"target":"https://frulko.github.io/zinc/docs/diagnostics/#z0103-type-is-not-assignable"}' "$tmp/explain.system" \
  || { echo "atelier help: Reference did not open the error's page: $(grep opener "$tmp/explain.system")"; fail=1; }

printf '3 run\n5 quit\n' > "$tmp/nozinc.session"
run nozinc ZINC_BIN="$tmp/nowhere/zinc" ZINC_FRAMES=5
grep -q '^\[status\] Cannot start zinc: install Zinc Atelier again' "$tmp/nozinc.out" || { echo "atelier help: no zinc, and the status does not say how to fix it: $(grep status "$tmp/nozinc.out" | tail -2)"; fail=1; }
exit $fail
