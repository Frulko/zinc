#!/bin/sh
# ZN-417: a parameter its function never consumes is borrowed: the callee neither retains nor releases it (Item.weight's receiver, describe's
# argument), a loop element passed to a method that cannot release stays lent (Shelf.total), and a receiver the method stores stays owned, so
# its caller retains the element first (Item.keepIn from main). The program prints the same as Node and leaks nothing (ZN_LEAK_CHECK).
# The IR is read without the optimiser, which would inline the methods.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZN_NO_OPT=1 "$ZINC" --emit=ir-rc tests/data/rc_borrow.ts > "$tmp/ir.txt" 2>&1 || { echo "rc_borrow: no IR"; cat "$tmp/ir.txt"; exit 1; }
python3 - "$tmp/ir.txt" <<'PY' || exit 1
import re, sys
funcs, cur = {}, None
for line in open(sys.argv[1]):
    m = re.match(r'func @(\S+)\(', line)
    if m: cur = m.group(1); funcs[cur] = []; continue
    if cur: funcs[cur].append(line.strip())
def rc(f, v): return [l for l in funcs[f] if l in ('retain %' + v, 'release %' + v)]
def loads(f): return [m.group(1) for l in funcs[f] for m in [re.match(r'%(\d+): ref Item = arrget ', l)] if m]
bad = []
for f in ('Item.weight', 'describe'):
    if rc(f, '0'): bad.append(f + ': the borrowed parameter is ' + ' and '.join(rc(f, '0')))
if any(rc('Shelf.total', v) for v in loads('Shelf.total')): bad.append('Shelf.total: the loop element is retained around a call that cannot release')
calls = [l for l in funcs['main'] if 'Item.keepIn' in l]
elems = loads('main')
if not calls or not any('retain %' + v in funcs['main'] for v in elems): bad.append('main: the element passed to keepIn (an owned receiver) is not retained')
for b in bad: print('rc_borrow: ' + b)
sys.exit(1 if bad else 0)
PY
out=$(ZN_LEAK_CHECK=1 "$ZINC" run tests/data/rc_borrow.ts 2>&1) || { echo "rc_borrow: run failed: $out"; exit 1; }
[ "$out" = "$(printf '12\nitem 1\n3')" ] || { echo "rc_borrow: wrong output: $out"; exit 1; }
