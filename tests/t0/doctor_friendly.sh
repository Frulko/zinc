#!/bin/sh
# zinc doctor (the short check-up): a welcoming summary, [ok]/[!] lines, what to do, colours only for a person (NO_COLOR, a pipe), the full report under --details,
# and on macOS the offer of `xcode-select --install` when the command line tools are missing.
# ZN-774.03: the verdict comes first (exit 1 and "Not ready yet" without the engine files); no row for the console SDKs, the iPhone 4S or
# cargo (they are in --details); the plugins are said to be built on first use, never "0 of N ready"; the check-up in French.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
out=$("$ZINC" doctor 2>&1) || { echo "doctor failed"; fail=1; }
echo "$out" | grep -q "Zinc doctor" && echo "$out" | grep -q "zinc new game hello" || { echo "the check-up has no title or no first command"; fail=1; }
echo "$out" | grep -q "$(printf '\033')" && { echo "colour codes in a pipe"; fail=1; }
col=$(ZINC_COLOR=always "$ZINC" doctor 2>&1)
echo "$col" | grep -q "$(printf '\033')\[32m" || { echo "ZINC_COLOR=always gives no colour"; fail=1; }
nc=$(NO_COLOR=1 ZINC_COLOR=never "$ZINC" doctor 2>&1)
echo "$nc" | grep -q "$(printf '\033')" && { echo "NO_COLOR ignored"; fail=1; }
[ "$(echo "$out" | wc -l)" -lt 30 ] || { echo "the check-up is not short: $(echo "$out" | wc -l) lines"; fail=1; }
"$ZINC" doctor --details 2>&1 | grep -q "^pinned tools" || { echo "--details lost the full report"; fail=1; }
[ "$(echo "$out" | grep -v '^ *$' | sed -n 3p)" = "  ✓ Ready: you can make and run programs on this machine." ] || { echo "the check-up does not start with the verdict: $(echo "$out" | head -6)"; fail=1; }
echo "$out" | grep -q "Console SDKs\|iPhone 4S\|Rust (cargo)" && { echo "the check-up shows rows a beginner never needs: $(echo "$out" | grep "Console\|iPhone\|cargo")"; fail=1; }
echo "$out" | grep -Eq "^ \[.\] Plugins  (all [0-9]+ plugins with native code are ready|the plugin with native code is ready|each one is built the first time a program uses it, once|[0-9]+ (is|are) ready; the others are built the first time)" \
  && ! echo "$out" | grep -q " of [0-9]* plugins" || { echo "the plugins row does not say they are built on first use: $(echo "$out" | grep Plugins)"; fail=1; }
"$ZINC" doctor --details 2>&1 | grep -q "^Rust (cargo), for the Rust code of loro: " || { echo "--details does not say whether cargo is there"; fail=1; }
ZINC_LANG=fr "$ZINC" doctor 2>&1 | grep -q "Prêt : vous pouvez créer et lancer des programmes" || { echo "the check-up is not in French with ZINC_LANG=fr"; fail=1; }
nr=$(ZINC_ROOT="$tmp" "$ZINC" doctor 2>&1); rc=$?
[ $rc -eq 1 ] && echo "$nr" | grep -q "Not ready yet" && echo "$nr" | grep -q "the engine files are missing from $tmp" || { echo "no engine files: exit $rc, $(echo "$nr" | head -8)"; fail=1; }
if [ "$(uname)" = Darwin ]; then
  printf '#!/bin/sh\nexit 2\n' > "$tmp/xcode-select"; chmod +x "$tmp/xcode-select"
  m=$(PATH="$tmp:$PATH" "$ZINC" doctor 2>&1)
  echo "$m" | grep -q "xcode-select --install" || { echo "no offer of xcode-select --install when the tools are missing"; fail=1; }
fi
[ $fail -eq 0 ] && echo "doctor_friendly: ok"
exit $fail
