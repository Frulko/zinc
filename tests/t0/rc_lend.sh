#!/bin/sh
# ZN-413: a load lends its value when nothing in the value's live range can release: no retain of the loop elements of sum(), the retain kept in
# show() (an element used after console output), and in viaTemp() the temporary box released only after the lent item's last use. The program prints the same as Node
# and leaks nothing (ZN_LEAK_CHECK). The IR is read without the optimiser, which would inline the three functions into main.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZN_NO_OPT=1 "$ZINC" --emit=ir-rc tests/data/rc_lend.ts > "$tmp/ir.txt" 2>&1 || { echo "rc_lend: no IR"; cat "$tmp/ir.txt"; exit 1; }
python3 - "$tmp/ir.txt" <<'PY' || exit 1
import re, sys
funcs, cur = {}, None
for line in open(sys.argv[1]):
    m = re.match(r'func @(\S+)\(', line)
    if m: cur = m.group(1); funcs[cur] = []; continue
    if cur: funcs[cur].append(line.strip())
def loads(f, op): return [m.group(1) for l in funcs[f] for m in [re.match(r'%(\d+): ref \S+ = ' + op + r' ', l)] if m]
def retained(f, v): return any(l == 'retain %' + v for l in funcs[f])
bad = []
for v in loads('sum', 'arrget'): bad += ['sum: the element %' + v + ' is retained'] if retained('sum', v) else []
if not any(retained('show', v) for v in loads('show', 'arrget')): bad.append('show: the element is not retained across console.log')
body = funcs['viaTemp']
it = loads('viaTemp', 'getfield')
if not it or retained('viaTemp', it[0]): bad.append('viaTemp: the item is retained or not loaded')
else:
    use = max(i for i, l in enumerate(body) if re.search(r'getfield \S+ %' + it[0] + r'\b', l))
    box = re.search(r'getfield \S+ %(\d+)', next(l for l in body if l.startswith('%' + it[0] + ':'))).group(1)
    rel = [i for i, l in enumerate(body) if l == 'release %' + box]
    if not rel or min(rel) < use: bad.append('viaTemp: the box %' + box + ' is released before the item\'s last use')
for b in bad: print('rc_lend: ' + b)
sys.exit(1 if bad else 0)
PY
out=$(ZN_LEAK_CHECK=1 "$ZINC" run tests/data/rc_lend.ts 2>&1) || { echo "rc_lend: run failed: $out"; exit 1; }
[ "$out" = "$(printf '12\n1\n2\n3\n6\n42')" ] || { echo "rc_lend: wrong output: $out"; exit 1; }
