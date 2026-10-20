#!/bin/sh
# zinc:async-storage: React Native's AsyncStorage imported by its npm name, every call against a fresh store (plugins/async-storage).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf 'other\tkept\n' > "$tmp/s.kv"   # a key of zinc:storage that clear() must leave
got=$(ZINC_STORAGE="$tmp/s.kv" "$ZINC" run ../plugins/async-storage/tests/async_storage.ts 2>&1 | grep -v '^  \|^zinc')
want='null
""
{"name":"Ada","prefs":{"theme":"dark","size":3},"tags":["b"]}
[["k1","v1"],["k2","v2"],["k3",null]]
empty,k2,user
0'
[ "$got" = "$want" ] || { printf 'async-storage output differs:\n%s\n' "$got"; exit 1; }
grep -q '^other	kept$' "$tmp/s.kv" || { echo "clear() removed a key that is not AsyncStorage's"; exit 1; }
