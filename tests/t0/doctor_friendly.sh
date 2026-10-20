#!/bin/sh
# zinc doctor (the short check-up): a welcoming summary, [ok]/[!] lines, what to do, colours only for a person (NO_COLOR, a pipe), the full report under --details,
# and on macOS the offer of `xcode-select --install` when the command line tools are missing.
cd "$(dirname "$0")/../.." || exit 2
fail=0
out=$("$ZINC" doctor 2>&1) || { echo "doctor failed"; fail=1; }
echo "$out" | grep -q "Zinc doctor" && echo "$out" | grep -q "zinc new game hello" || { echo "the check-up has no title or no first command"; fail=1; }
echo "$out" | grep -q "$(printf '\033')" && { echo "colour codes in a pipe"; fail=1; }
col=$(ZINC_COLOR=always "$ZINC" doctor 2>&1)
echo "$col" | grep -q "$(printf '\033')\[32m" || { echo "ZINC_COLOR=always gives no colour"; fail=1; }
nc=$(NO_COLOR=1 ZINC_COLOR=never "$ZINC" doctor 2>&1)
echo "$nc" | grep -q "$(printf '\033')" && { echo "NO_COLOR ignored"; fail=1; }
[ "$(echo "$out" | wc -l)" -lt 30 ] || { echo "the check-up is not short: $(echo "$out" | wc -l) lines"; fail=1; }
"$ZINC" doctor --details 2>&1 | grep -q "^pinned tools" || { echo "--details lost the full report"; fail=1; }
if [ "$(uname)" = Darwin ]; then
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  printf '#!/bin/sh\nexit 2\n' > "$tmp/xcode-select"; chmod +x "$tmp/xcode-select"
  m=$(PATH="$tmp:$PATH" "$ZINC" doctor 2>&1)
  echo "$m" | grep -q "xcode-select --install" || { echo "no offer of xcode-select --install when the tools are missing"; fail=1; }
fi
[ $fail -eq 0 ] && echo "doctor_friendly: ok"
exit $fail
