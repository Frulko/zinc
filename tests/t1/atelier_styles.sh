#!/bin/sh
# Zinc Atelier's New sketch in the four styles (ZN-774.15, D161), on one short headless session:
#   the start view offers Drawing, Scene, Canvas and Interface, each with its line, and shows the examples under the same four
#   headings (the texts of its frame, from a scene dump); a card of each style makes a sketch in the sketchbook from its starter, under
#   the comment of the interface's language (English, then French after Tools > Language), and each sketch runs headless; the bounce
#   examples are the programs of docs/start/samples, unchanged.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/home"
for d in toolchains cache index sysroots; do [ -e "${ZINC_HOME:-$HOME/.zinc}/$d" ] && ln -s "${ZINC_HOME:-$HOME/.zinc}/$d" "$tmp/home/$d"; done   # its own config.json, the same toolchains and caches
printf '16 new:drawing\n18 new:scene\n20 lang:fr\n22 new:canvas\n24 new:interface\n26 quit\n' > "$tmp/session"
printf '5 move 640 600\n6 wheel 0 -80\n' > "$tmp/input"   # the end of the start view: the other styles' examples
ZINC_LANG=en ZINC_HOME="$tmp/home" ZINC_ATELIER_HOME="$tmp/book" ZINC_ATELIER_SYNC=1 ZINC_ATELIER_ECHO=1 ZINC_SYSTEM_LOG=/dev/null ZINC_ATELIER_SCRIPT="$tmp/session" \
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=26 ZINC_INPUT="$tmp/input" ZINC_SHOT="$tmp/start.png" ZINC_SHOT_FRAMES=4,15 ZINC_SCENE_DUMP="$tmp/scene" \
  "$Z" run app/atelier >"$tmp/out" 2>"$tmp/err" || { echo "atelier styles: the session failed: $(tail -c 300 "$tmp/err")"; exit 1; }
[ -n "$ATELIER_KEEP" ] && cp "$tmp/start-4.png" "$tmp/start-15.png" "$ATELIER_KEEP"
python3 tools/scene-texts "$tmp/scene-4" > "$tmp/top"   # the start view as it opens
python3 tools/scene-texts "$tmp/scene-15" > "$tmp/end"   # scrolled to its end
has() {   # has <top|end> <text>: that frame draws the text, on one line or wrapped over several
  tr '\n' ' ' < "$tmp/$1" | tr -s ' ' | grep -qF "$2" || { echo "atelier styles: the start view ($1) does not show \"$2\""; fail=1; }
}
heading() { grep -qxF "$2" "$tmp/$1" || { echo "atelier styles: the start view ($1) has no \"$2\" on its own"; fail=1; }; }
heading top 'New sketch: how do you want to write it?'
for h in Drawing Scene Canvas Interface; do heading top "$h"; done
has top 'Redraw the whole picture every frame, like Processing (zinc:gfx).'
has top 'Objects that draw themselves, like ActionScript 3 (zinc:stage).'
has top "The web's canvas calls: paths, fills, gradients (zinc:canvas)."
has top 'Buttons and text described in JSX, like React (zinc:ui).'
has top 'Bouncing ball Click it: the program measures the distance to its centre.'
# the examples of the other styles, under their headings, in this order
# (the examples of learn/catalog.txt, ZN-774.33: Atelier's and the lessons' in one list)
has end 'Scene A stage and a sprite Three balls roll across a stage, each at its speed. Bouncing ball Click it: the ball says where it takes a tap.'
has end 'Canvas Paths and fills A house, a path and a sun, drawn with paths. Bouncing ball Click it: the canvas says if the point is in its path.'
has end 'Interface Interface A button and its number. Components A card with a picture, a title and a button. Bouncing ball Click it: its box calls onClick.'
# style: the folder Atelier made, the main file, its import, the first line of its comment
check() {
  f="$tmp/book/$2/$3"
  [ -f "$f" ] || { echo "atelier styles: new:$1 made no $2/$3: $(ls "$tmp/book")"; fail=1; return; }
  grep -q "from '$4'" "$f" || { echo "atelier styles: $2/$3 is not written in the $1 style (no $4)"; fail=1; }
  [ "$(sed -n 1p "$f")" = "$5" ] || { echo "atelier styles: $2/$3 starts with \"$(sed -n 1p "$f")\", not \"$5\""; fail=1; }
  (cd "$tmp/book/$2" && ZINC_HEADLESS=1 ZINC_FRAMES=3 "$Z" run >"$tmp/run.out" 2>"$tmp/run.err") && [ ! -s "$tmp/run.err" ] \
    || { echo "atelier styles: the $1 sketch does not run: $(head -3 "$tmp/run.err")"; fail=1; }
}
check drawing sketch main.ts zinc:gfx '// A new sketch: a circle that breathes. Run it with the button above (⌘R).'
check scene sketch_2 main.ts zinc:stage '// A new sketch in the Scene style: the ball is an object that draws itself (zinc:stage). Run it with the button above (⌘R).'
check canvas sketch_3 main.ts zinc:canvas '// Un nouveau croquis dans le style Canvas : les appels du canvas du web dessinent un cercle qui respire (zinc:canvas). Lancez-le avec le bouton du haut (⌘R).'
check interface sketch_4 main.tsx zinc:ui/solid '// Un nouveau croquis dans le style Interface : l’écran est décrit une fois, en JSX (zinc:ui). Lancez-le avec le bouton du haut (⌘R).'
for s in drawing scene canvas interface; do
  diff -r "docs/start/samples/$s" "app/atelier/examples/bounce-$s" >/dev/null || { echo "atelier styles: examples/bounce-$s is not docs/start/samples/$s"; fail=1; }
done
[ $fail -eq 0 ] && echo "atelier styles: ok"
exit $fail
