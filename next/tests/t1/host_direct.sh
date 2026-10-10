#!/bin/sh
# Direct host rows (ZN-397): the hot zinc:gfx rows skip the HostCall decoding in the interpreter and the AOT build. The frame hash and the output are the ones the
# decoded path gave (recorded in the golden), in both.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
app=tests/data/host_direct/main.ts
want=$(cat tests/data/host_direct/golden.txt)
env="ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=4 ZINC_FRAMEHASH=last"
got=$(env $env "$ZINC" run "$app" 2>&1 | sed 's/^zinc: framehash [0-9]* //')
fail=0
[ "$got" = "$want" ] || { printf 'interpreter:\n%s\nwant:\n%s\n' "$got" "$want"; fail=1; }
"$ZINC" build "$app" -o "$t/app" >/dev/null 2>&1 || { echo "host_direct: AOT build failed"; exit 1; }
got=$(env $env "$t/app" 2>&1 | sed 's/^zinc: framehash [0-9]* //')
[ "$got" = "$want" ] || { printf 'aot:\n%s\nwant:\n%s\n' "$got" "$want"; fail=1; }
# width() at the top of a module, before any other graphics call, starts the surface at its size in both (ZN-563: the inline AOT read saw 320x240)
printf "import { width, height } from 'zinc:gfx';\nconst W = width();\nconsole.log(W + 'x' + height());\n" > "$t/top.ts"
"$ZINC" build "$t/top.ts" -o "$t/top" >/dev/null 2>&1 || { echo "host_direct: AOT build of top.ts failed"; exit 1; }
for got in "$(ZINC_HEADLESS=1 ZINC_SIZE=200x100 "$ZINC" run "$t/top.ts" 2>&1)" "$(ZINC_HEADLESS=1 ZINC_SIZE=200x100 "$t/top" 2>&1)"; do
  [ "$got" = "200x100" ] || { echo "width() at the top of a module: $got, want 200x100"; fail=1; }
done
[ $fail -eq 0 ] && echo "host_direct: ok"
exit $fail
