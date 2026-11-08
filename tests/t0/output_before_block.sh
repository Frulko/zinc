#!/bin/sh
# The program's output is written before a call that starts a child or waits on stdin (ZN-643), on the interpreter, in a native program (AOT)
# and on QuickJS. Each program proves it itself: right after the call it looks for its own line in the file its output goes to (appended,
# as the child appends to it too). A program whose output waits for the next turn of the loop says `no`.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
cat > "$tmp/child.ts" <<'T'
import { spawn } from 'zinc:process';
import * as fs from 'zinc:fs';
import { args } from 'zinc:sys';
const log = args()[0];
console.log('parent');
const p = spawn('sh', ['-c', 'echo child >> "$0"', log], {});
const seen = fs.readText(log).indexOf('parent\n') >= 0;
p.onExit((code: i32): void => { console.log('written before the child: ' + (seen ? 'yes' : 'no')); });
T
cat > "$tmp/stdin.ts" <<'T'
import * as fs from 'zinc:fs';
import { args, onStdin } from 'zinc:sys';
const log = args()[0];
console.log('name?');
let done = false;
onStdin((chunk: string): void => { if (done) return; done = true; console.log('hello ' + chunk.trim()); });
const seen = fs.readText(log).indexOf('name?\n') >= 0;
console.log('prompt before the read: ' + (seen ? 'yes' : 'no'));
T
# check NAME EXPECTED: the log of the run that just ended
check() { printf "$2" | cmp -s - "$tmp/$1.log" || { echo "$1: $(tr '\n' '|' < "$tmp/$1.log" | head -c 200) $(tail -c 300 "$tmp/err" | tr "\n" "|")"; fail=1; }; }
ce='parent\nchild\nwritten before the child: yes\n'
se='name?\nprompt before the read: yes\nhello bob\n'
export ZINC_HEADLESS=1
timeout 20 "$ZINC" run --interp "$tmp/child.ts" -- "$tmp/interp.log" >> "$tmp/interp.log" 2>>"$tmp/err"; check interp "$ce"
echo bob | timeout 20 "$ZINC" run --interp "$tmp/stdin.ts" -- "$tmp/interp-stdin.log" >> "$tmp/interp-stdin.log" 2>>"$tmp/err"; check interp-stdin "$se"
for f in child stdin; do timeout 120 "$ZINC" build "$tmp/$f.ts" -o "$tmp/$f" > "$tmp/build.log" 2>&1 || { echo "zinc build $f failed: $(head -c 300 "$tmp/build.log")"; exit 1; }; done
timeout 20 "$tmp/child" "$tmp/aot.log" >> "$tmp/aot.log" 2>>"$tmp/err"; check aot "$ce"
echo bob | timeout 20 "$tmp/stdin" "$tmp/aot-stdin.log" >> "$tmp/aot-stdin.log" 2>>"$tmp/err"; check aot-stdin "$se"
timeout 20 "$ZINC" run "$tmp/child.ts" --engine quickjs -- "$tmp/quickjs.log" >> "$tmp/quickjs.log" 2>>"$tmp/err"; check quickjs "$ce"
echo bob | timeout 20 "$ZINC" run "$tmp/stdin.ts" --engine quickjs -- "$tmp/quickjs-stdin.log" >> "$tmp/quickjs-stdin.log" 2>>"$tmp/err"; check quickjs-stdin "$se"
exit $fail
