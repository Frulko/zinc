#!/bin/sh
# tools/gh-org-setup (ZN-352) against a fake gh that keeps state: --dry-run lists every repository (engine, index, templates, plugin-starter, one per
# committed plugin), the branch protection and the missing secrets, and runs nothing; a real run creates them; a second run creates nothing.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/state"
cat > "$tmp/gh" <<FAKE
#!/bin/sh
echo "\$*" >> "$tmp/calls"
key=\$(echo "\$*" | sed 's/ -X PUT//; s/ --input .*//; s/ --public.*//; s/^repo create /repo view /' | tr ' /' '__')
case "\$1 \$2" in
  "repo view"|"api repos/zinc-engine/zinc/branches/main/protection") [ -f "$tmp/state/\$key" ] ;;
  "repo create"|"api -X") touch "$tmp/state/\$key" ;;
  "secret list") echo "ZINC_UPDATE_SEED	Updated 2026-10-01" ;;
  *) exit 1 ;;
esac
FAKE
chmod +x "$tmp/gh"
n=$(git -C .. ls-files 'plugins/*/plugin.json' | awk -F/ 'NF == 3' | wc -l | tr -d ' ')   # the committed official plugins
out=$(GH="$tmp/gh" tools/gh-org-setup --dry-run)
[ ! -f "$tmp/calls" ] || { echo "gh_org_setup: --dry-run ran gh"; fail=1; }
[ "$(echo "$out" | grep -c '^+ .*/gh repo create zinc-engine/')" = "$((n + 4))" ] || { echo "gh_org_setup: --dry-run does not list the $((n + 4)) repositories: $(echo "$out" | grep -c 'repo create')"; fail=1; }
echo "$out" | grep -q "repo create zinc-engine/plugin-sqlite --public" && echo "$out" | grep -q "api -X PUT repos/zinc-engine/zinc/branches/main/protection" && echo "$out" | grep -q "^secrets to set .*ZINC_INDEX_KEYS" || { echo "gh_org_setup: --dry-run misses a setting"; fail=1; }
GH="$tmp/gh" tools/gh-org-setup > "$tmp/run1" || { echo "gh_org_setup: the first run failed"; fail=1; }
[ "$(grep -c '^repo create' "$tmp/calls")" = "$((n + 4))" ] && grep -q "^api -X PUT" "$tmp/calls" || { echo "gh_org_setup: the first run did not create everything"; fail=1; }
grep -q "^secrets to set" "$tmp/run1" && ! grep -q "ZINC_UPDATE_SEED" "$tmp/run1" || { echo "gh_org_setup: a secret already set is listed as missing"; fail=1; }
: > "$tmp/calls"
GH="$tmp/gh" tools/gh-org-setup > "$tmp/run2" || { echo "gh_org_setup: the second run failed"; fail=1; }
grep -q "create\|-X PUT" "$tmp/calls" && { echo "gh_org_setup: the second run changed something: $(grep 'create\|PUT' "$tmp/calls" | head -3)"; fail=1; }
grep -q "^= zinc-engine/zinc main is protected" "$tmp/run2" || { echo "gh_org_setup: the second run does not see the protection"; fail=1; }
exit $fail
