#!/bin/sh
# zinc updates itself (src/tc/selfupdate.cpp), on a local release (file://, no network): an engine laid out as install.sh leaves it (a copy of this zinc in
# engine/bin, .zinc-install, a `zinc` link) and a release directory with the signed manifest of this machine and the CLI archive of a fake 99.0.0 (bin/zinc
# answers --version and runs a copy of this zinc for the rest). Proves: the version stamp; --check (exit 10) on the default channel URL and on --channel beta;
# a wrong checksum, a wrong signature, an unsigned manifest and a read-only install directory change nothing; the install swaps the directories and keeps
# engine.prev, the link follows; --rollback swaps them back; the daily notice: on a terminal it says so once the background check has run, and it is silent
# with ZINC_NO_UPDATE_CHECK, ZINC_CI, --quiet, without a terminal and offline; it shows on every command but --version and the like, and a Homebrew zinc
# names brew upgrade in it and in zinc update (up to date or not); zinc doctor says it.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'chmod -R u+w "$tmp" 2>/dev/null; rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"
unset ZINC_UPDATE_URL ZINC_UPDATE_REPO ZINC_NO_UPDATE_CHECK ZINC_CI CI ZINC_HEADLESS ZINC_UPDATE_ALLOW_UNSIGNED ZINC_STEPS ZINC_DETERMINISTIC   # the runner sets the last two: they silence the notice
k=$("$ZINC" update-keygen); seed=$(echo "$k" | sed -n 's/^seed=//p'); export ZINC_UPDATE_PUBKEY=$(echo "$k" | sed -n 's/^public=//p')
other=$("$ZINC" update-keygen | sed -n 's/^seed=//p')
[ "$("$ZINC" update-pubkey "$seed")" = "$ZINC_UPDATE_PUBKEY" ] || { echo "zinc update-pubkey does not print the seed's public key"; fail=1; }
V=$("$ZINC" --version | cut -d' ' -f2)
case "$(uname -s)" in Darwin) os=macos ;; *) os=linux ;; esac
m="zinc-$os-$(uname -m)"

# the install: what install.sh leaves
E="$tmp/zinc/engine"
mkdir -p "$E/bin" "$E/share/zinc" "$tmp/bin" "$tmp/rel" "$tmp/p"
cp "$ZINC" "$E/bin/zinc" && echo "$V" > "$E/share/zinc/VERSION" && printf 'url=file://%s/rel\nchannel=stable\n' "$tmp" > "$E/.zinc-install"
ln -s "$E/bin/zinc" "$tmp/bin/zinc"
L="$tmp/bin/zinc"
[ "$("$L" --version)" = "zinc-next $V" ] || { echo "the version stamp: $("$L" --version)"; fail=1; }

# the release: zinc-99.0.0-<os>-<arch>.tar.gz and its manifests
N="$tmp/p/zinc-99.0.0-$os-$(uname -m)"
mkdir -p "$N/bin" "$N/share/zinc" && cp "$ZINC" "$N/bin/zinc-real" && echo 99.0.0 > "$N/share/zinc/VERSION"
printf '#!/bin/sh\n[ "$1" = --version ] && { echo "zinc-next 99.0.0"; exit 0; }\nexec "$(dirname "$0")/zinc-real" "$@"\n' > "$N/bin/zinc" && chmod +x "$N/bin/zinc"
(cd "$tmp/p" && tar -czf "$tmp/rel/$(basename "$N").tar.gz" "$(basename "$N")") || exit 2
sum=$("$ZINC" toolchain sha256 "$tmp/rel/$(basename "$N").tar.gz" | cut -d' ' -f1)
manifest() {   # manifest <file> <version> <sha256> <seed|none>
  printf 'version=%s\nurl=%s\nsha256=%s\nnotes=faster and nicer\n' "$2" "$(basename "$N").tar.gz" "$3" > "$1"
  if [ "$4" = none ]; then { echo signature=none; cat "$1"; } > "$1.s"; else "$ZINC" update-sign "$1" "$4" > "$1.s"; fi
  mv "$1.s" "$1"
}
manifest "$tmp/rel/$m.manifest" 99.0.0 "$sum" "$seed"
manifest "$tmp/rel/$m-beta.manifest" 99.1.0-beta.1 "$sum" "$seed"

out=$("$L" update --check 2>&1); rc=$?
[ $rc -eq 10 ] && echo "$out" | grep -q "zinc 99.0.0 is available (this is $V): faster and nicer" || { echo "--check on the default channel ($rc): $out"; fail=1; }
out=$("$L" update --check --channel beta 2>&1); [ $? -eq 10 ] && echo "$out" | grep -q "99.1.0-beta.1 is available" || { echo "--check --channel beta: $out"; fail=1; }

unchanged() {   # unchanged <what>: the engine is the old one, nothing was left beside it
  cmp -s "$E/bin/zinc" "$ZINC" && [ ! -e "$E.prev" ] && [ ! -e "$E.incoming" ] || { echo "$1 changed the install: $(ls "$tmp/zinc")"; fail=1; }
}
refused() {   # refused <manifest> <expected message> <what>
  out=$("$L" update "file://$1" 2>&1); rc=$?
  [ $rc -eq 1 ] && echo "$out" | grep -q "$2" || { echo "$3 is not refused ($rc): $out"; fail=1; }
  unchanged "$3"
}
# a zinc of the Homebrew formula (tools/homebrew-formula) points to brew upgrade, even beside an install.sh marker
H="$tmp/brew/Cellar/zinc/$V/libexec"
mkdir -p "$H/bin" && cp "$ZINC" "$H/bin/zinc" && cp "$E/.zinc-install" "$H/"
out=$("$H/bin/zinc" update "file://$tmp/rel/$m.manifest" 2>&1); [ $? -eq 1 ] && echo "$out" | grep -q "brew upgrade zinc" || { echo "a Homebrew zinc is not sent to brew upgrade: $out"; fail=1; }
manifest "$tmp/rel/same.manifest" "$V" "$sum" "$seed"   # up to date, it still says where the next release comes from
out=$("$H/bin/zinc" update "file://$tmp/rel/same.manifest" 2>&1); [ $? -eq 0 ] && echo "$out" | grep -q "is up to date" && echo "$out" | grep -q "brew upgrade zinc" || { echo "an up-to-date Homebrew zinc does not name brew upgrade: $out"; fail=1; }
manifest "$tmp/rel/badsum.manifest" 99.0.0 "$(printf '%064d' 0)" "$seed"
refused "$tmp/rel/badsum.manifest" "checksum mismatch" "a wrong checksum"
manifest "$tmp/rel/badsig.manifest" 99.0.0 "$sum" "$other"
refused "$tmp/rel/badsig.manifest" "does not verify" "a wrong signature"
manifest "$tmp/rel/unsigned.manifest" 99.0.0 "$sum" none
refused "$tmp/rel/unsigned.manifest" "ZINC_UPDATE_ALLOW_UNSIGNED=1" "an unsigned manifest"
chmod a-w "$tmp/zinc"
out=$("$L" update 2>&1); [ $? -eq 1 ] && echo "$out" | grep -q "cannot write" || { echo "a read-only install is not refused: $out"; fail=1; }
chmod u+w "$tmp/zinc"
unchanged "a read-only install"

# the notice: needs a terminal (script gives one), once the background check has written ~/.zinc/update-check.json
printf 'console.log("hi");\n' > "$tmp/hi.ts"
tty() { script -q /dev/null "$@" < /dev/null 2>&1 | tr -d '\r'; }
rm -f "$ZINC_HOME/update-check.json"   # what --check wrote: the result below comes from the background check
out=$(tty "$L" run "$tmp/hi.ts")
n=0; while ! grep -q '"latest": "99.0.0"' "$ZINC_HOME/update-check.json" 2>/dev/null && [ $n -lt 50 ]; do sleep 0.1; n=$((n+1)); done
grep -q '"latest": "99.0.0"' "$ZINC_HOME/update-check.json" 2>/dev/null || { echo "the background check wrote no result: $(cat "$ZINC_HOME/update-check.json" 2>&1)"; fail=1; }
tty "$L" run "$tmp/hi.ts" | grep -q "zinc 99.0.0 is available: run zinc update" || { echo "no notice on a terminal: $(tty "$L" run "$tmp/hi.ts")"; fail=1; }
tty "$L" check "$tmp/hi.ts" | grep -q "zinc 99.0.0 is available" || { echo "no notice on zinc check: $(tty "$L" check "$tmp/hi.ts")"; fail=1; }
tty "$L" --version | grep -q "is available" && { echo "a notice on zinc --version"; fail=1; }
# whatever installed it, the notice names its way: Homebrew
tty "$H/bin/zinc" run "$tmp/hi.ts" | grep -q "zinc 99.0.0 is available: run brew upgrade zinc" || { echo "no Homebrew notice: $(tty "$H/bin/zinc" run "$tmp/hi.ts")"; fail=1; }
for quiet in "env ZINC_NO_UPDATE_CHECK=1" "env ZINC_CI=1" "env ZINC_HEADLESS=1" "env ZINC_DETERMINISTIC=1"; do
  tty $quiet "$L" run "$tmp/hi.ts" | grep -q "is available" && { echo "a notice with $quiet"; fail=1; }
done
tty "$L" run --quiet "$tmp/hi.ts" | grep -q "is available" && { echo "a notice with --quiet"; fail=1; }
"$L" run "$tmp/hi.ts" 2>&1 | grep -q "is available" && { echo "a notice without a terminal"; fail=1; }
"$L" doctor 2>&1 | grep -q "Zinc 99.0.0 is available" || { echo "zinc doctor does not say an update exists: $("$L" doctor 2>&1 | head -12)"; fail=1; }
ZINC_NO_UPDATE_CHECK=1 "$L" doctor 2>&1 | grep -q "not checked" || { echo "zinc doctor checks with ZINC_NO_UPDATE_CHECK=1"; fail=1; }
# offline: a stale stamp and an unreachable channel: silent, the stamp moves on
cp "$E/.zinc-install" "$tmp/marker" && printf 'url=file:///nonexistent\nchannel=stable\n' > "$E/.zinc-install"
echo '{"checked": 0, "latest": ""}' > "$ZINC_HOME/update-check.json"
out=$(tty "$L" run "$tmp/hi.ts")
echo "$out" | grep -q "^hi$" && ! echo "$out" | grep -q "available\|update" || { echo "offline, zinc run printed: $out"; fail=1; }
grep -q '"checked": 0,' "$ZINC_HOME/update-check.json" && { echo "the daily stamp was not written"; fail=1; }
cp "$tmp/marker" "$E/.zinc-install"

# the install, through the link
out=$("$L" update 2>&1); rc=$?
[ $rc -eq 0 ] && echo "$out" | grep -q "What changed: faster and nicer" && echo "$out" | grep -q "zinc 99.0.0 is installed in" || { echo "zinc update failed ($rc): $out"; fail=1; }
[ "$("$L" --version)" = "zinc-next 99.0.0" ] && cmp -s "$E.prev/bin/zinc" "$ZINC" && [ -f "$E/.zinc-install" ] && [ ! -e "$E.incoming" ] || { echo "the swap: $(ls -a "$tmp/zinc" "$E")"; fail=1; }

# the rollback, and the rollback of the rollback
out=$("$E/bin/zinc" update --rollback 2>&1); rc=$?
[ $rc -eq 0 ] && echo "$out" | grep -q "zinc $V is back" && cmp -s "$E/bin/zinc" "$ZINC" && [ "$(cat "$E.prev/share/zinc/VERSION")" = 99.0.0 ] || { echo "--rollback ($rc): $out"; fail=1; }
"$L" update --rollback >/dev/null 2>&1 && [ "$("$L" --version)" = "zinc-next 99.0.0" ] || { echo "--rollback does not return to the newer version"; fail=1; }
[ $fail -eq 0 ] && echo "self_update: ok"
exit $fail
