#!/bin/sh
# QuickJS engine robustness for libraries (ZN-566): a runaway recursion is a RangeError the program catches, not a dead process (the stack limit follows
# the thread's real stack); a promise rejected with nobody to catch it is printed with its stack and ends the program with 101 as on the typed engine,
# or goes to the web environment's hook, which may silence it, and the program goes on as in a browser; an exception after a top-level await is the
# program's uncaught exception; onFrame registered after an awaited timer gets its frames, on a clock that goes on.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
run() { out=$("$ZINC" run "$tmp/$1" --engine quickjs 2>&1); rc=$?; }

cat > "$tmp/deep.js" <<'JS'
function f() { return f() + 1; }
try { f(); console.log('no error'); } catch (e) { console.log(e instanceof RangeError, e.message); }
function g() { try { return g() + 1; } catch (e) { return JSON.stringify({ a: [1, { b: 'x' }] }).length + /(a+)+b/.test('aaab'); } }   // native work at the deepest frame
console.log(g() > 0);
JS
run deep.js
[ $rc -eq 0 ] && [ "$out" = "true Maximum call stack size exceeded
true" ] || { echo "qjs_robust: a runaway recursion is not a caught RangeError (exit $rc): $out"; fail=1; }

cat > "$tmp/lost.js" <<'JS'
async function lost() { throw new Error('lost'); }
lost();
Promise.reject(new Error('caught later')).catch(() => console.log('handled'));
console.log('after');
JS
run lost.js
[ $rc -eq 101 ] || { echo "qjs_robust: an unhandled rejection ends with $rc, not 101"; fail=1; }
case "$out" in "after
handled
Uncaught (in promise) Error: lost
    at lost ("*) ;; *) echo "qjs_robust: an unhandled rejection is not printed with its stack after the jobs: $out"; fail=1 ;; esac
case "$out" in *"caught later"*) echo "qjs_robust: a rejection handled in the same turn is reported"; fail=1 ;; esac

cat > "$tmp/hook.js" <<'JS'
globalThis.__zincUnhandledRejection = (p, reason) => { console.log('event', reason.message, p instanceof Promise); return reason.message === 'quiet'; };
Promise.reject(new Error('quiet'));
Promise.reject(new Error('loud'));
setTimeout(() => console.log('goes on'), 1);
JS
run hook.js
[ $rc -eq 0 ] || { echo "qjs_robust: with the web environment's hook an unhandled rejection ends the program ($rc)"; fail=1; }
case "$out" in "event quiet true
event loud true
Uncaught (in promise) Error: loud
"*"goes on") ;; *) echo "qjs_robust: the hook does not hear both rejections, or does not silence the one it prevents: $out"; fail=1 ;; esac

cat > "$tmp/late_throw.js" <<'JS'
await new Promise(r => setTimeout(r, 5));
throw new Error('late');
JS
run late_throw.js
[ $rc -eq 101 ] || { echo "qjs_robust: an exception after a top-level await ends with $rc, not 101"; fail=1; }
case "$out" in "Uncaught Error: late"*) ;; *) echo "qjs_robust: an exception after a top-level await is not the program's uncaught exception: $out"; fail=1 ;; esac

cat > "$tmp/late_frame.js" <<'JS'
import { onFrame } from 'zinc:gfx';
await new Promise(r => setTimeout(r, 10));
let n = 0;
onFrame(() => { if (++n === 3) console.log('frames', n, Date.now() > 10); });
JS
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=5 "$ZINC" run "$tmp/late_frame.js" --engine quickjs 2>&1)
[ "$out" = "frames 3 true" ] || { echo "qjs_robust: onFrame after an awaited timer gets no frames, or the clock starts again: $out"; fail=1; }
exit $fail
