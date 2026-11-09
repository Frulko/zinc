#!/bin/sh
# zinc:gestures manipulate and glide (ZN-684): two fingers turn a pose a quarter turn about their midpoint, a finger that lands in the
# middle of a gesture does not move it, the scale stays within its bounds, the speed is followed with dt, and a released pose glides on
# and comes to rest.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat >"$tmp/main.ts" <<'EOF'
import { Finger, Pose, manipulate, glide } from 'zinc:gestures';
const r = (v: number): string => (Math.round(v * 1000) / 1000).toString();
const show = (n: string, p: Pose): void => console.log(n + ' ' + r(p.x) + ' ' + r(p.y) + ' ' + r(p.scale) + ' ' + r(p.angle * 180 / Math.PI));
const move = (f: Finger, x: number, y: number): void => { f.px = f.x; f.py = f.y; f.x = x; f.y = y; };
const p = new Pose(); p.x = 100; p.y = 0;
const a = new Finger(1, 0, 0), b = new Finger(2, 100, 0);
move(a, 50, -50); move(b, 50, 50);
manipulate(p, [a, b], 0.5, 2);
show('turn', p);                                     // a quarter turn about (50, 0)
const c = new Finger(3, 300, 300);                   // lands: no motion yet
move(a, 50, -50);
manipulate(p, [a, c], 0.5, 2);
show('land', p);                                     // unchanged
move(a, 50, -150); move(b, 50, 150);
manipulate(p, [a, b], 0.5, 2);
show('clamp', p);                                    // the spread is 3x, the scale stops at 2
move(a, 60, -150);
manipulate(p, [a], 0.5, 2, 0.1);
console.log('speed ' + r(p.vx) + ' ' + r(p.vy));    // 10 units in 0.1 s, followed at min(1, 18 * 0.1) = 1
let frames = 0;
while ((p.vx !== 0 || p.vy !== 0) && frames < 1000) { glide(p, 1 / 60); frames++; }
console.log('rest ' + (frames > 10 && frames < 1000 ? 'ok' : 'no ' + frames) + ' ' + (p.x > 60 ? 'moved' : 'still'));
EOF
ZINC_HEADLESS=1 timeout 60 "$ZINC" run "$tmp/main.ts" >"$tmp/out" 2>"$tmp/err"
got=$(grep -E '^(turn|land|clamp|speed|rest) ' "$tmp/out")
want='turn 50 50 1 90
land 50 50 1 90
clamp 50 100 2 90
speed 100 0
rest ok moved'
[ "$got" = "$want" ] || { echo "gestures_manipulate: got"; printf '%s\n' "$got"; tail -5 "$tmp/err"; exit 1; }
echo ok
