#!/bin/sh
# Signed plugin archives (ZN-328.02): `zinc sign` writes <archive>.sig; `zinc add --key <public>` checks it and locks the key, so `zinc install` checks it again. A signature
# made with another key, a missing or damaged .sig, and a key given for a git source are refused (a changed archive: tests/t1/plugin_add.sh).
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/src/greet" "$tmp/a" "$tmp/b"
printf '{ "name": "greet", "kind": "module", "module": "zinc:greet", "entry": "index.ts" }\n' > "$tmp/src/greet/plugin.json"
printf "export function greet(n: string): string { return 'hi ' + n; }\n" > "$tmp/src/greet/index.ts"
tar -czf "$tmp/greet.tar.gz" -C "$tmp/src" greet
printf '{ "name": "app", "entry": "main.ts" }\n' > "$tmp/a/zinc.json"
"$Z" update-keygen > "$tmp/k1"; "$Z" update-keygen > "$tmp/k2"
seed=$(sed -n 's/^seed=//p' "$tmp/k1"); pub=$(sed -n 's/^public=//p' "$tmp/k1"); other=$(sed -n 's/^seed=//p' "$tmp/k2")
"$Z" sign "$tmp/greet.tar.gz" "$seed" >/dev/null || { echo "plugin_sign: zinc sign failed"; exit 1; }
"$Z" add "file://$tmp/greet.tar.gz" "$tmp/a" --key "$pub" >/dev/null || { echo "plugin_sign: a good signature was refused"; fail=1; }
grep -q "\"publicKey\": \"$pub\"" "$tmp/a/zinc.json" || { echo "plugin_sign: the key is not locked"; fail=1; }
cp "$tmp/a/zinc.json" "$tmp/b/"
"$Z" install "$tmp/b" >/dev/null || { echo "plugin_sign: zinc install refused the signed archive"; fail=1; }
cp "$tmp/greet.tar.gz.sig" "$tmp/good.sig"
"$Z" sign "$tmp/greet.tar.gz" "$other" >/dev/null
"$Z" add "file://$tmp/greet.tar.gz" "$tmp/a" --key "$pub" >/dev/null 2>"$tmp/err" && { echo "plugin_sign: a signature of another key was accepted"; fail=1; }
grep -q "does not verify" "$tmp/err" || { echo "plugin_sign: unexpected refusal: $(cat "$tmp/err")"; fail=1; }
"$Z" install "$tmp/b" >/dev/null 2>&1 && { echo "plugin_sign: zinc install accepted a signature of another key"; fail=1; }
rm "$tmp/greet.tar.gz.sig"
"$Z" add "file://$tmp/greet.tar.gz" "$tmp/a" --key "$pub" >/dev/null 2>"$tmp/err" && { echo "plugin_sign: a missing signature was accepted"; fail=1; }
grep -q "no signature" "$tmp/err" || { echo "plugin_sign: unexpected refusal: $(cat "$tmp/err")"; fail=1; }
cp "$tmp/good.sig" "$tmp/greet.tar.gz.sig"
"$Z" install "$tmp/b" >/dev/null || { echo "plugin_sign: the restored signature is refused"; fail=1; }
(cd "$tmp/src/greet" && git init -q && git add . && git -c user.name=t -c user.email=t@t commit -qm one) || exit 2
"$Z" add "file://$tmp/src/greet" "$tmp/a" --key "$pub" >/dev/null 2>&1 && { echo "plugin_sign: a key was accepted for a git source"; fail=1; }
exit $fail
