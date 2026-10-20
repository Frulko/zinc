#!/bin/sh
# Launch cost of zinc (ZN-592, ZN-592.01): `zinc --version` and an interpreted console.log(1) (cached bytecode) may cost at most 5 ms more
# than an empty program linked with libSystem and libc++ only, the best of 20 launches each (the best resists a loaded machine). zinc links
# nothing else: the window host (SDL3, AppKit, Metal...) is the module libzn_window, CoreFoundation is opened when asked (linking it runs ~400
# framework initializers), and zinc exports no weak definition dyld would coalesce (tools/zinc-unexported.txt). Intel Mac: 21 -> 10 ms.
cd "$(dirname "$0")/../.." || exit 2
[ -z "$ZINC_CI" ] || { echo "skipped: a time measured on a shared 3-core runner under load proves nothing"; exit 77; }
[ "$(uname)" = Darwin ] || { echo "skipped: the budget is measured on macOS"; exit 77; }
command -v python3 >/dev/null && command -v cc >/dev/null || { echo "skipped: no python3 or cc"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
fw=$(otool -L "$ZINC" | tail -n +2 | awk '{print $1}' | grep -v '^/usr/lib/libSystem\|^/usr/lib/libc++')
[ -z "$fw" ] || { echo "zinc links more than libSystem and libc++: $fw"; fail=1; }
# an exported weak definition makes dyld coalesce it and check zinc's exports against the shared cache at every launch (ZN-592.03: 0.5 ms)
weak=$(dyld_info -exports "$ZINC" 2>/dev/null | grep -c "weak-def")
[ "$weak" = 0 ] || { echo "zinc exports $weak weak definitions (hide them in tools/zinc-unexported.txt): $(dyld_info -exports "$ZINC" | grep weak-def | head -3)"; fail=1; }
printf 'int main(void) { return 0; }\n' > "$tmp/e.c"
cc "$tmp/e.c" -o "$tmp/empty" -lc++ 2>/dev/null || { echo "skipped: cannot link the empty program"; exit 77; }
echo 'console.log(1);' > "$tmp/one.ts"
"$ZINC" run "$tmp/one.ts" >/dev/null 2>&1   # the bytecode cache
BUDGET_MS=${ZN_LAUNCH_BUDGET_MS:-5}   # ms over the empty program; the Intel Mac measured 3.6-4.4 (ZN-592.01), 16 with the frameworks and weak exports
python3 - "$ZINC" "$tmp" "$BUDGET_MS" <<'PY'
import subprocess, sys, time
zinc, tmp, launch = sys.argv[1], sys.argv[2], float(sys.argv[3])
def best(cmd):
    v = []
    for _ in range(20):
        t0 = time.perf_counter(); subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); v.append((time.perf_counter() - t0) * 1000)
    return min(v)
e = best([tmp + '/empty'])
fail = 0
# the run also checks its cached program (the ~80 files it was compiled from) and runs it: 1 ms more (5.1-5.2 measured)
for name, cmd, budget in [('zinc --version', [zinc, '--version'], launch), ('zinc run console.log(1)', [zinc, 'run', tmp + '/one.ts'], launch + 1)]:
    t = best(cmd)
    print('%s: %.1f ms, empty program %.1f ms, zinc\'s own %.1f ms (budget %.0f)' % (name, t, e, t - e, budget))
    if t - e > budget: print('%s: zinc\'s own launch cost is over the budget' % name); fail = 1
sys.exit(fail)
PY
[ $? -eq 0 ] || fail=1
# a compiled console program (ZN-592.06): no window host, SDL3 or framework (it does not draw), nothing exported; 16.6 -> 7.0 ms on the Intel
# Mac, 2.0-2.1 over the empty program (the host's row dispatch keeps ~240 libSystem imports)
printf 'setTimeout(() => { console.log(1); }, 0);\n' > "$tmp/timer.ts"
if "$ZINC" build "$tmp/timer.ts" -o "$tmp/timer" >"$tmp/build.log" 2>&1; then
  libs=$(otool -L "$tmp/timer" | tail -n +2 | awk '{print $1}' | grep -v '^/usr/lib/libSystem\|^/usr/lib/libc++')
  [ -z "$libs" ] || { echo "a compiled console program links more than libSystem and libc++: $libs"; fail=1; }
  [ "$("$tmp/timer")" = 1 ] || { echo "the compiled console program does not print 1"; fail=1; }
  python3 - "$tmp" <<'PY' || fail=1
import subprocess, sys, time
tmp = sys.argv[1]
def best(cmd):
    v = []
    for _ in range(20):
        t0 = time.perf_counter(); subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); v.append((time.perf_counter() - t0) * 1000)
    return min(v)
e, t = best([tmp + '/empty']), best([tmp + '/timer'])
print('compiled console program: %.1f ms, empty program %.1f ms, %.1f ms more (budget 3)' % (t, e, t - e))
sys.exit(1 if t - e > 3 else 0)
PY
else echo "zinc build of a console program failed: $(tail -3 "$tmp/build.log")"; fail=1; fi
exit $fail
