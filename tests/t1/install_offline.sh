#!/bin/sh
# zinc install --offline (ZN-339.02): what `zinc add` fetched (a git plugin, kept by commit, and an archive, kept by SHA-256) is in ~/.zinc/cache/sources, so a
# second checkout installs it offline with the sources gone, byte for byte; from an empty cache, --offline fails and names each missing plugin.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
export ZINC_HOME="$tmp/home"
mkdir -p "$tmp/greet" "$tmp/shout/shout" "$tmp/a" "$tmp/b"
printf '{ "name": "greet", "kind": "module", "module": "zinc:greet", "entry": "index.ts" }\n' > "$tmp/greet/plugin.json"
echo "export const g = 1;" > "$tmp/greet/index.ts"
(cd "$tmp/greet" && git init -q && git add . && git -c user.name=t -c user.email=t@t commit -qm one) || exit 2
printf '{ "name": "shout", "kind": "module", "module": "zinc:shout", "entry": "index.ts" }\n' > "$tmp/shout/shout/plugin.json"
echo "export const s = 1;" > "$tmp/shout/shout/index.ts"
tar -czf "$tmp/shout.tar.gz" -C "$tmp/shout" shout
echo '{ "name": "app" }' > "$tmp/a/zinc.json"
"$Z" add "file://$tmp/greet" "$tmp/a" >/dev/null && "$Z" add "file://$tmp/shout.tar.gz" "$tmp/a" >/dev/null || { echo "install_offline: zinc add failed"; exit 1; }
cp "$tmp/a/zinc.json" "$tmp/a/zinc.lock" "$tmp/b/"
rm -rf "$tmp/greet" "$tmp/shout" "$tmp/shout.tar.gz"   # no source left: only the cache
"$Z" install --offline "$tmp/b" >"$tmp/out" 2>&1 || { echo "install_offline: a warm cache does not install offline: $(cat "$tmp/out")"; fail=1; }
diff -r "$tmp/a/plugins" "$tmp/b/plugins" >/dev/null || { echo "install_offline: the offline install differs from the first"; fail=1; }
ZINC_HOME="$tmp/cold" "$Z" install --offline "$tmp/b" >"$tmp/out" 2>&1 && { echo "install_offline: a cold cache installed offline"; fail=1; }
grep -q "greet: offline: not in the local cache" "$tmp/out" && grep -q "shout: offline: not in the local cache" "$tmp/out" || { echo "install_offline: the missing plugins are not named: $(cat "$tmp/out")"; fail=1; }
exit $fail
