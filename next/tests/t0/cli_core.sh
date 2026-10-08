#!/bin/sh
# CLI core (ZN-138): zinc init, bare check/run/build in a project, zinc help, zinc doctor and their exit codes.
cd "$(dirname "$0")/../.." || exit 2
Z="$ZINC"; case "$Z" in /*) ;; *) Z="$PWD/$Z" ;; esac
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
fail=0
cd "$t" || exit 2
"$Z" init app --template cli >/dev/null || { echo "init failed"; fail=1; }
[ -f app/zinc.json ] && [ -f app/src/main.ts ] && [ -f app/tsconfig.json ] && [ -d app/assets ] || { echo "init wrote no project"; fail=1; }
"$Z" init app >/dev/null 2>&1; [ $? -eq 1 ] || { echo "init into a non-empty directory must exit 1"; fail=1; }
"$Z" init other --template nope >/dev/null 2>&1; [ $? -eq 2 ] || { echo "unknown template must exit 2"; fail=1; }
cd app || exit 2
"$Z" check >/dev/null 2>&1 || { echo "bare check failed in a project"; fail=1; }
out=$("$Z" run 2>&1); case "$out" in "hello from "*) ;; *) echo "bare run printed: $out"; fail=1 ;; esac
"$Z" build >/dev/null 2>&1; [ -x build/app ] || { echo "bare build left no build/app"; fail=1; }
[ "$(./build/app 2>&1 | cut -c1-11)" = "hello from " ] || { echo "the built program does not run"; fail=1; }
mkdir -p "$t/empty" && cd "$t/empty" || exit 2
for c in run build check; do "$Z" $c >/dev/null 2>&1; [ $? -eq 2 ] || { echo "bare $c outside a project must exit 2"; fail=1; }; done
"$Z" help | grep -q 'zinc help <command>' || { echo "help lists no commands"; fail=1; }
"$Z" help run | grep -q '^usage: zinc run' || { echo "help run has no usage line"; fail=1; }
"$Z" run --help | grep -q '^usage: zinc run' || { echo "run --help has no usage line"; fail=1; }
"$Z" help nope >/dev/null 2>&1; [ $? -eq 2 ] || { echo "help of an unknown command must exit 2"; fail=1; }
out=$("$Z" doctor) || { echo "doctor failed"; fail=1; }
echo "$out" | grep -q '^pinned tools' && echo "$out" | grep -Eq 'sha256 [0-9a-f]{64}' && echo "$out" | grep -Eq 'installed|will be downloaded' || { echo "doctor lists no pinned tools"; fail=1; }
echo "$out" | grep -q '^tier T[0-4]$\|  tier T[0-4]$' || { echo "doctor prints no tier"; fail=1; }
[ $fail -eq 0 ] && echo "cli_core: ok"
exit $fail
