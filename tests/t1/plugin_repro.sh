#!/bin/sh
# Reproducible plugins (ZN-333): the same plugins built from two directories under two ZINC_HOMEs, a second apart, give byte-identical libraries and
# byte-identical `zinc plugin-build --pack` archives (deterministic ustar: sorted names, time 0, owner 0). sqlite (a vendored C library) is in the CI job.
# Skipped (77) without the pinned zig.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
[ -n "$ZINC_ZIG" ] || ZINC_ZIG=$(ls -d "${ZINC_HOME:-$HOME/.zinc}"/toolchains/zig-*/zig 2>/dev/null | head -1)
[ -x "$ZINC_ZIG" ] || { echo "plugin_repro: no pinned zig downloaded"; exit 77; }
export ZINC_ZIG
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
for n in 1 2; do
  mkdir -p "$tmp/home$n" "$tmp/p$n/nested$n/plugins"
  cp -R ../plugins/device ../plugins/svg "$tmp/p$n/nested$n/plugins/"
  echo '{ "name": "repro" }' > "$tmp/p$n/nested$n/zinc.json"
  for p in device svg; do ZINC_HOME="$tmp/home$n" "$Z" plugin-build "$p" "$tmp/p$n/nested$n" --pack "$tmp/$p-$n.tar" >/dev/null 2>&1 || { echo "plugin_repro: $p does not build"; fail=1; }; done
  sleep 1
done
for p in device svg; do cmp -s "$tmp/$p-1.tar" "$tmp/$p-2.tar" || { echo "plugin_repro: the $p archives differ"; fail=1; }; done
tar tf "$tmp/device-1.tar" | grep -q "/key$" || { echo "plugin_repro: the archive has no key"; fail=1; }
exit $fail
