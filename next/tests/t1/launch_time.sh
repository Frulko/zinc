#!/bin/sh
# Launch cost of zinc (ZN-592): `zinc --version` and an interpreted console.log(1) (cached bytecode) may cost at most a budget more than an
# empty program linked with the same system frameworks and libraries, the best of 20 launches each (the best resists a loaded machine). The
# empty program measures dyld and the frameworks; what is left is zinc's own: the replaced global operator new (dyld patched libc++'s uses in
# the shared cache, 8 ms on the Intel Mac), its binds and initializers.
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || { echo "skipped: the budget is measured on macOS"; exit 77; }
command -v python3 >/dev/null && command -v cc >/dev/null || { echo "skipped: no python3 or cc"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fw=$(otool -L "$ZINC" | tail -n +2 | awk '{print $1}' | sed -n 's|^/System/Library/Frameworks/\([A-Za-z]*\)\.framework/.*|-framework \1|p' | tr '\n' ' ')
printf 'int main(void) { return 0; }\n' > "$tmp/e.c"
cc "$tmp/e.c" -o "$tmp/empty" $fw -lc++ -lobjc 2>/dev/null || { echo "skipped: cannot link the empty program"; exit 77; }
echo 'console.log(1);' > "$tmp/one.ts"
"$ZINC" run "$tmp/one.ts" >/dev/null 2>&1   # the bytecode cache
BUDGET_MS=${ZN_LAUNCH_BUDGET_MS:-20}   # ms over the empty program; the Intel Mac measured 14-16 (ZN-592), 22-24 with the replaced operator new
python3 - "$ZINC" "$tmp" "$BUDGET_MS" <<'PY'
import subprocess, sys, time
zinc, tmp, budget = sys.argv[1], sys.argv[2], float(sys.argv[3])
def best(cmd):
    v = []
    for _ in range(20):
        t0 = time.perf_counter(); subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); v.append((time.perf_counter() - t0) * 1000)
    return min(v)
e = best([tmp + '/empty'])
fail = 0
for name, cmd in [('zinc --version', [zinc, '--version']), ('zinc run console.log(1)', [zinc, 'run', tmp + '/one.ts'])]:
    t = best(cmd)
    print('%s: %.1f ms, empty program %.1f ms, zinc\'s own %.1f ms (budget %.0f)' % (name, t, e, t - e, budget))
    if t - e > budget: print('%s: zinc\'s own launch cost is over the budget' % name); fail = 1
sys.exit(fail)
PY
