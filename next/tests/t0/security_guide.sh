#!/bin/sh
# The distribution threat model (ZN-351): every test the guide's attack table cites exists, the TUF and transparency-log attacks are all in the table, and
# `zinc help add` points to the guide.
cd "$(dirname "$0")/../.." || exit 2
g=../docs/guide/08-security.md
fail=0
sec=$(mktemp); trap 'rm -f "$sec"' EXIT
sed -n '/^## Plugin distribution: threat model and guarantees/,/^## /p' "$g" > "$sec"
for t in $(grep -oE '`[a-z_0-9]+`' "$sec" | tr -d '`' | sort -u); do
  case $t in tuf_index|mirrors|plugin_fetch|plugin_tiers|tlog|revocation|trust_policy|plugin_community|plugin_sign|plugin_lock|plugin_cli|plugin_add|policy)
    [ -f tests/t1/$t.sh ] || [ -f tests/t0/$t.sh ] || { echo "security_guide: the guide cites a test that does not exist: $t"; fail=1; } ;;
  esac
done
for attack in "Freeze" "Rollback" "Arbitrary package" "below threshold" "not theirs" "transparency log" "rewritten history" "revoked"; do
  grep -qi "$attack" "$sec" || { echo "security_guide: the attack table lacks: $attack"; fail=1; }
done
"$ZINC" help add | grep -q "docs/guide/08-security.md" || { echo "security_guide: zinc help add does not link the guide"; fail=1; }
exit $fail
