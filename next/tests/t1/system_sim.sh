#!/bin/sh
# The system plugin against its recording simulator (ZN-232): every case of tests/golden/system/<case>/ (main.ts, zinc.json, script) prints the `[system] op json` lines and the program's own output
# of `<case>/expected`, on the interpreter and as an AOT program alike; ZINC_SYSTEM_SCRIPT delivers the scripted events at their tick. ZN_UPDATE_GOLDEN=1 rewrites the expectations.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
for d in tests/golden/system/*/; do
  n=$(basename "$d")
  got=$(ZINC_DETERMINISTIC=1 ZINC_SYSTEM_SCRIPT="$PWD/$d/script" "$ZINC" run "$d" 2>&1)
  if [ -n "$ZN_UPDATE_GOLDEN" ]; then printf '%s\n' "$got" > "$d/expected"; continue; fi
  [ "$got" = "$(cat "$d/expected")" ] || { echo "$n: interpreter output differs from $d/expected"; printf '%s\n' "$got" | diff - "$d/expected" | head -5; fail=1; }
  "$ZINC" build "$d/main.ts" -o "$tmp/$n" >/dev/null 2>"$tmp/err" || { echo "$n: build fails: $(head -c 300 "$tmp/err")"; fail=1; continue; }
  aot=$(ZINC_DETERMINISTIC=1 ZINC_SYSTEM_SCRIPT="$PWD/$d/script" "$tmp/$n" 2>&1)
  [ "$aot" = "$got" ] || { echo "$n: the AOT program prints something else than the interpreter"; printf '%s\n' "$aot" | diff - "$d/expected" | head -5; fail=1; }
done
[ $fail -eq 0 ] && echo "system sim: ok"
exit $fail
