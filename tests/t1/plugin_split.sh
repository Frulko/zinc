#!/bin/sh
# tools/plugin-split (ZN-335) on a small monorepo: splitting two plugins twice gives the same commit ids; a commit that touches plugins/a gives exactly one new
# commit in a's split and none in b's; the split holds the plugin at its root with its history; plugins.lock names every plugin with its repository, split commit
# and source tree.
cd "$(dirname "$0")/../.." || exit 2
git subtree -h 2>&1 | grep -q "git subtree split" || { echo "plugin_split: no git subtree"; exit 77; }
tool=$PWD/tools/plugin-split
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
g() { git -C "$tmp/mono" -c user.name=t -c user.email=t@t "$@"; }
mkdir -p "$tmp/mono/plugins/a" "$tmp/mono/plugins/b" "$tmp/mono/engine"
git -C "$tmp/mono" init -q
for p in a b; do printf '{ "name": "%s", "kind": "module", "module": "zinc:%s", "entry": "index.ts" }\n' $p $p > "$tmp/mono/plugins/$p/plugin.json"; echo "export const v = 1;" > "$tmp/mono/plugins/$p/index.ts"; done
echo engine > "$tmp/mono/engine/x"
g add -A; GIT_AUTHOR_DATE=2026-01-01T00:00:00Z GIT_COMMITTER_DATE=2026-01-01T00:00:00Z g commit -qm one
echo "export const v = 2;" > "$tmp/mono/plugins/a/index.ts"; echo y > "$tmp/mono/engine/x"
g add -A; GIT_AUTHOR_DATE=2026-01-02T00:00:00Z GIT_COMMITTER_DATE=2026-01-02T00:00:00Z g commit -qm two
first=$("$tool" -C "$tmp/mono" a b); second=$("$tool" -C "$tmp/mono" a b)
[ -n "$first" ] && [ "$first" = "$second" ] || { echo "plugin_split: two splits differ: $first / $second"; fail=1; }
a1=$(echo "$first" | sed -n 's/^a //p'); b1=$(echo "$first" | sed -n 's/^b //p')
[ "$(g rev-list --count "$a1")" = 2 ] && [ "$(g rev-list --count "$b1")" = 1 ] || { echo "plugin_split: the splits do not keep the plugin's history"; fail=1; }
g show "$a1:plugin.json" | grep -q '"name": "a"' || { echo "plugin_split: the plugin is not at the root of its split"; fail=1; }
g ls-tree -r --name-only "$a1" | grep -q engine && { echo "plugin_split: the split carries the engine"; fail=1; }
echo "export const v = 3;" > "$tmp/mono/plugins/a/index.ts"; echo z > "$tmp/mono/engine/x"
g add -A; GIT_AUTHOR_DATE=2026-01-03T00:00:00Z GIT_COMMITTER_DATE=2026-01-03T00:00:00Z g commit -qm three
third=$("$tool" -C "$tmp/mono" a b)
a2=$(echo "$third" | sed -n 's/^a //p'); b2=$(echo "$third" | sed -n 's/^b //p')
[ "$(g rev-list --count "$a1..$a2")" = 1 ] && [ "$(g rev-parse "$a2^")" = "$a1" ] || { echo "plugin_split: a change in plugins/a is not exactly one new commit"; fail=1; }
[ "$b2" = "$b1" ] || { echo "plugin_split: a change elsewhere moved b's split"; fail=1; }
(cd "$tmp/mono" && ZINC_PLUGIN_REPO_BASE=https://example.org/zinc "$tool" --lock "$tmp/plugins.lock" >/dev/null) || { echo "plugin_split: --lock failed"; fail=1; }
python3 - "$tmp/plugins.lock" "$a2" "$b2" "$(g rev-parse HEAD:plugins/a)" <<'PY' || fail=1
import json, sys
lock = json.load(open(sys.argv[1]))
by = {p["name"]: p for p in lock["plugins"]}
assert set(by) == {"a", "b"}, by
assert by["a"]["commit"] == sys.argv[2] and by["b"]["commit"] == sys.argv[3], "commits"
assert by["a"]["repository"] == "https://example.org/zinc/plugin-a.git", by["a"]["repository"]
assert by["a"]["source"] == "git-tree:" + sys.argv[4], by["a"]["source"]
PY
exit $fail
