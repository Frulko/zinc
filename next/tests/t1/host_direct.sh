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
[ $fail -eq 0 ] && echo "host_direct: ok"
exit $fail
