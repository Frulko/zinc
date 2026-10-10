#!/bin/sh
# zinc profile <file> --engine quickjs (ZN-598): a default build refuses it and names the build option; a build with -DZN_QJS_PROFILE=ON
# (build-prof/zinc, or $ZINC_QJS_PROF) prints the hottest JS functions with file:line and the opcode mix.
cd "$(dirname "$0")/../.." || exit 2
fail=0
out=$("$ZINC" profile bench/qjs/objects.mjs --engine quickjs 2>&1); rc=$?
case "$rc $out" in "2 "*ZN_QJS_PROFILE=ON*) ;; *) echo "a default build should refuse the QuickJS profiler: rc $rc: $out"; fail=1 ;; esac
prof=${ZINC_QJS_PROF:-build-prof/zinc}
if [ -x "$prof" ]; then
  out=$("$prof" profile bench/qjs/objects.mjs --engine quickjs --hz 2000 2>&1)
  echo "$out" | grep -q "^objects: 300 ticks" || { echo "the program did not run: $out"; fail=1; }
  echo "$out" | grep -q "^QuickJS profile: [0-9]* samples at 2000 Hz" || { echo "no report header: $out"; fail=1; }
  echo "$out" | grep -Eq "^ +[0-9]+ +[0-9.]+% +[0-9]+ +[0-9]+  emit +bench/qjs/objects.mjs:7:14$" || { echo "no row for emit with its file:line: $out"; fail=1; }
  echo "$out" | grep -Eq "^ +[0-9]+ +[0-9.]+%  get_field$" || { echo "no get_field in the opcode mix: $out"; fail=1; }
else echo "note: no $prof, the report itself is not checked (cmake -B build-prof -DZN_QJS_PROFILE=ON)"; fi
[ $fail -eq 0 ] && echo "qjs profile: ok"
exit $fail
