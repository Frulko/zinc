#!/bin/sh
# zinc:secure-store: expo-secure-store's calls round-trip a secret through the macOS Keychain on every engine, under a test service removed at the end.
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || { echo "skip: the keychain backend is macOS's"; exit 0; }
svc="zn-test-secure-store-$$"
trap 'for e in interp native quickjs; do for k in token empty; do security delete-generic-password -s "$svc-$e" -a $k >/dev/null 2>&1; done; done' EXIT
want='true
null
sécret ✓
""
null
rejected: Invalid key provided to S'
fail=0
for engine in --interp --native "--engine quickjs"; do
  # shellcheck disable=SC2086
  got=$("$ZINC" run plugins/secure-store/tests/secure_store.ts $engine -- "$svc-${engine##*-}" 2>&1 | grep -v '^  \|^zinc')
  [ "$got" = "$want" ] || { printf 'secure-store on %s differs:\n%s\n' "$engine" "$got"; fail=1; }
  security find-generic-password -s "$svc-${engine##*-}" >/dev/null 2>&1 && { echo "secure-store on $engine left an item in the keychain"; fail=1; }
done
exit $fail
