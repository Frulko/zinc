#!/bin/sh
# The lessons of docs/learn (ZN-774.12): every sample project of docs/learn/samples runs headless for a few frames (the lessons about input
# with a scripted session, tests/data/learn_samples/<sample>.input) and prints what its lesson says it prints, and the lesson's page holds the
# sample's code word for word, so the page and the project cannot drift apart.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
fail=0
n=0
check() {   # check <sample> <frames> <expected output>
  s=$1; n=$((n + 1))
  in=$PWD/tests/data/learn_samples/$s.input   # absolute: zinc run works in the project's folder
  [ -f "$in" ] || in=
  got=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=$2 ZINC_INPUT=$in "$ZINC" run docs/learn/samples/$s 2>"$t/err")
  code=$?
  if [ "$code" != 0 ] || [ "$got" != "$3" ]; then
    printf 'learn_samples: %s (exit %s) printed:\n%s\nwant:\n%s\n' "$s" "$code" "$got" "$3"; tail -5 "$t/err"; fail=1
  fi
  for src in docs/learn/samples/$s/src/main.ts docs/learn/samples/$s/src/main.tsx; do
    [ -f "$src" ] || continue
    python3 -c 'import sys; sys.exit(0 if open(sys.argv[1]).read() in open(sys.argv[2]).read() else 1)' "$src" "docs/learn/$s.md" ||
      { echo "learn_samples: docs/learn/$s.md does not hold $src as it is"; fail=1; }
  done
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

[ "$(ls -d docs/learn/samples/*/ | wc -l | tr -d ' ')" = "$n" ] || { echo "learn_samples: a sample of docs/learn/samples is not checked here"; fail=1; }
[ $fail = 0 ] && echo "learn_samples: ok ($n lessons)"
exit $fail
