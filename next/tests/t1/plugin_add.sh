#!/bin/sh
# zinc add / zinc install (ZN-328.01): a plugin from a local git repository (pinned by commit) and one from a file:// archive (pinned by sha256) land in plugins/<name> and in
# zinc.json "lock"; a second checkout with only zinc.json and the sources gets the same bytes with `zinc install`, at the pinned commit although the repository moved on.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
export ZINC_HOME="$tmp/home"   # its own cache of sources (ZN-339.02); the refusals below use an empty one
mkdir -p "$tmp/greet" "$tmp/shout/shout" "$tmp/a" "$tmp/b"
printf '{ "name": "greet", "kind": "module", "module": "zinc:greet", "entry": "index.ts" }\n' > "$tmp/greet/plugin.json"
printf "export function greet(n: string): string { return 'hi ' + n; }\n" > "$tmp/greet/index.ts"
(cd "$tmp/greet" && git init -q && git add . && git -c user.name=t -c user.email=t@t commit -qm one) || exit 2
printf '{ "name": "shout", "kind": "module", "module": "zinc:shout", "entry": "index.ts" }\n' > "$tmp/shout/shout/plugin.json"
printf "export function shout(s: string): string { return s.toUpperCase() + '!'; }\n" > "$tmp/shout/shout/index.ts"
tar -czf "$tmp/shout.tar.gz" -C "$tmp/shout" shout
printf '{ "name": "app", "entry": "main.ts" }\n' > "$tmp/a/zinc.json"
printf "import { greet } from 'zinc:greet';\nimport { shout } from 'zinc:shout';\nconsole.log(shout(greet('zinc')));\n" > "$tmp/a/main.ts"
"$Z" add "file://$tmp/greet" "$tmp/a" >/dev/null || { echo "plugin_add: zinc add from git failed"; exit 1; }
"$Z" add "file://$tmp/shout.tar.gz" "$tmp/a" >/dev/null || { echo "plugin_add: zinc add from an archive failed"; exit 1; }
commit=$(git -C "$tmp/greet" rev-parse HEAD); sum=$(shasum -a 256 "$tmp/shout.tar.gz" | cut -d' ' -f1)
grep -q "\"commit\": \"$commit\"" "$tmp/a/zinc.json" || { echo "plugin_add: the commit is not pinned"; fail=1; }
grep -q "\"sha256\": \"$sum\"" "$tmp/a/zinc.json" || { echo "plugin_add: the sha256 is not pinned"; fail=1; }
[ -d "$tmp/a/plugins/greet/.git" ] && { echo "plugin_add: the .git directory was copied"; fail=1; }
[ "$("$Z" run "$tmp/a/main.ts" 2>&1)" = "HI ZINC!" ] || { echo "plugin_add: the project does not run with its plugins: $("$Z" run "$tmp/a/main.ts" 2>&1 | head -3)"; fail=1; }
printf "export function greet(n: string): string { return 'bye ' + n; }\n" > "$tmp/greet/index.ts"
(cd "$tmp/greet" && git -c user.name=t -c user.email=t@t commit -qam two) || exit 2
cp "$tmp/a/zinc.json" "$tmp/a/main.ts" "$tmp/b/"
"$Z" install "$tmp/b" >/dev/null || { echo "plugin_add: zinc install failed"; fail=1; }
diff -r "$tmp/a/plugins" "$tmp/b/plugins" >/dev/null || { echo "plugin_add: the second checkout got other bytes"; fail=1; }
printf 'x' >> "$tmp/shout.tar.gz"
"$Z" install "$tmp/b" >/dev/null 2>&1 || { echo "plugin_add: the locked bytes in the cache are not used when the origin changed"; fail=1; }
ZINC_HOME="$tmp/cold" "$Z" install "$tmp/b" >/dev/null 2>"$tmp/err" && { echo "plugin_add: a changed archive was installed"; fail=1; }
grep -q "changed" "$tmp/err" || { echo "plugin_add: the refusal does not say the archive changed: $(cat "$tmp/err")"; fail=1; }
"$Z" add "$tmp/greet" "$tmp/a" >/dev/null 2>&1 && { echo "plugin_add: a plain directory was added (pluginDirs is for those)"; fail=1; }
exit $fail
