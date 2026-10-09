#!/bin/sh
# Trust policy layers (ZN-346, src/tc/policy.cpp): system, user, environment and project only tighten; zinc doctor names where each value comes from.
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
mkdir -p "$tmp/home" "$tmp/proj"
echo '{"tiers": ["official", "verified"], "mirrors": ["https://a.example", "https://b.example"]}' > "$tmp/system.json"
echo '{"tiers": ["official", "verified", "community"], "rebuilds": 3, "mirrors": ["https://b.example", "https://c.example"]}' > "$tmp/home/policy.json"
echo '{"name": "p", "policy": {"tiers": ["verified"], "rebuilds": 1, "prebuilt": true, "transparency": "required"}}' > "$tmp/proj/zinc.json"
out=$(cd "$tmp/proj" && ZINC_SYSTEM_POLICY="$tmp/system.json" ZINC_HOME="$tmp/home" ZINC_PREBUILT=0 "$Z" doctor 2>&1)
fail=0
echo "$out" | grep -q "tiers *verified  (project " || { echo "policy: tiers"; fail=1; }
echo "$out" | grep -q "prebuilt *source only  (environment ZINC_PREBUILT)" || { echo "policy: prebuilt"; fail=1; }
echo "$out" | grep -q "rebuilds *3  (user " || { echo "policy: rebuilds (a project's 1 must not lower the user's 3)"; fail=1; }
echo "$out" | grep -q "transparency *required  (project " || { echo "policy: transparency"; fail=1; }
echo "$out" | grep -q "mirrors *https://b.example  (user " || { echo "policy: mirrors (the user may narrow the system's list, not add to it)"; fail=1; }
[ $fail = 0 ] || echo "$out" | tail -6
exit $fail
