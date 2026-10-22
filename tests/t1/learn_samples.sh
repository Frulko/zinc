#!/bin/sh
# The lessons of docs/learn (ZN-774.12, the scene and Canvas tracks ZN-774.14): every sample project of docs/learn/samples runs headless for
# a few frames (the lessons about input with a scripted session, tests/data/learn_samples/<sample>.input) and prints what its lesson says it
# prints, and the lesson's page holds the sample's code word for word, so the page and the project cannot drift apart.
# The styles page (docs/start/styles.md, ZN-774.14): the same program written in the four styles (drawing, scene, Canvas, interface) gets the
# same clicks (tests/data/learn_samples/styles.input) and prints the same lines, and the page holds the four versions.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
fail=0
n=0
run() {   # run <project> <page> <frames> <input file or ''> <expected output>
  got=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=$3 ZINC_INPUT=$4 "$ZINC" run "$1" 2>"$t/err")
  code=$?
  if [ "$code" != 0 ] || [ "$got" != "$5" ]; then
    printf 'learn_samples: %s (exit %s) printed:\n%s\nwant:\n%s\n' "$1" "$code" "$got" "$5"; tail -5 "$t/err"; fail=1
  fi
  for src in "$1/src/main.ts" "$1/src/main.tsx"; do
    [ -f "$src" ] || continue
    python3 -c 'import sys; sys.exit(0 if open(sys.argv[1]).read() in open(sys.argv[2]).read() else 1)' "$src" "$2" ||
      { echo "learn_samples: $2 does not hold $src as it is"; fail=1; }
  done
}
check() {   # check <sample> <frames> <expected output>: a lesson of docs/learn
  n=$((n + 1))
  in=$PWD/tests/data/learn_samples/$1.input   # absolute: zinc run works in the project's folder
  [ -f "$in" ] || in=
  run "docs/learn/samples/$1" "docs/learn/$1.md" "$2" "$in" "$3"
}

check 01-window-and-shape 3 'The window is 640 by 400 pixels.'
check 02-colours-and-movement 70 'After 1.00 seconds the ball is at x = 160.'
check 03-keyboard 45 'key "a", the square is at x = 220
key "Space", the square is at x = 220
key "ArrowLeft", the square is at x = 220'
check 04-mouse-and-touch 30 'pressed at 80, 120
released at 340, 180: 1 line(s)
brush 12
pressed at 380, 100
released at 540, 120: 2 line(s)
pressed at 470, 300'
check 05-text-and-images 3 'The rocket picture is 96 by 96 pixels.'
check 06-sound 12 'play E (329.6 Hz)
play G (392 Hz)
play C (523.3 Hz)'
check 07-components 10 'Welcome aboard!'
check 08-state 18 'glasses: 1
glasses: 2
glasses: 3
glasses: 2'
check 09-events 20 'Pressed at 30, 28 inside the box.
Let go at 230, 148.
Key ArrowLeft: the dot is at 220, 148.
Key ArrowUp: the dot is at 220, 138.
Back to the middle.'
check 10-styles 10 'theme: Night'
check 11-drawing-in-an-interface 16 'petals: 7
petals: 8
petals: 7'
check 12-a-small-app 30 'added "Milk", 2 left to buy
added "Green tea", 3 left to buy
Bread bought, 2 left to buy
cleared, 2 on the list'
check 13-a-stage-and-a-sprite 70 'The pink ball joined the stage.
The blue ball joined the stage.
The gold ball joined the stage.
The stage holds 3 balls.
After 1.00 seconds the pink ball is at x = 120.'
check 14-children-and-local-coordinates 70 'The moon is at 34, 0 in the earth, at 504, 200 in the window.
The moon is at -34, 5 in the earth, at 410, 289 in the window.'
check 15-taps-and-drags 24 'tap 1
tap 2
picked up the green card at 30, 30 in the card
dropped the green card at 400, 70'
check 16-layout-and-scrolling 36 '20 fruits, 880 pixels of list
tapped Cherry, the list is scrolled by 0
tapped Lime, the list is scrolled by 244'
check 17-paths-and-fills 3 'Is 320, 140 in the roof? true. And 120, 140? false.'
check 18-transforms 3 'In the big clock, (0, 0) is at 410, 200 and the scale is 1.00.
In the small clock, (0, 0) is at 110, 110 and the scale is 0.45.
After restore, (0, 0) is at 0, 0 and the scale is 1.00.'
check 19-animation 70 'After 1.00 seconds the blades turned 90 degrees.'
check 20-text-and-gradients 3 'The title is 347 pixels wide, the label 229.'

[ "$(ls -d docs/learn/samples/*/ | wc -l | tr -d ' ')" = "$n" ] || { echo "learn_samples: a sample of docs/learn/samples is not checked here"; fail=1; }

# the four styles: the same clicks, the same lines; the third click misses the ball
for s in drawing scene canvas interface; do
  run "docs/start/samples/$s" docs/start/styles.md 90 "$PWD/tests/data/learn_samples/styles.input" 'hit: score 1, the ball is blue
hit: score 2, the ball is gold'
done
[ "$(ls -d docs/start/samples/*/ | wc -l | tr -d ' ')" = 4 ] || { echo "learn_samples: a sample of docs/start/samples is not checked here"; fail=1; }

[ $fail = 0 ] && echo "learn_samples: ok ($n lessons, 4 styles)"
exit $fail
