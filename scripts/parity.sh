#!/bin/sh
# Runs console examples on sim, macos and (if Docker is available) linux, and diffs outputs (TST-02 by hand).
set -e
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
for ex in examples/hello examples/lang; do
  for profile in "" "--profile ps1"; do
    node compiler/bin/zinc.mjs run $ex --target sim $profile >"$tmp/sim" 2>/dev/null
    node compiler/bin/zinc.mjs run $ex --target macos $profile >"$tmp/macos" 2>/dev/null
    if cmp -s "$tmp/sim" "$tmp/macos"; then echo "ok    $ex ${profile:-(default)} sim == macos"; else echo "DIFF  $ex ${profile:-(default)} sim != macos"; diff "$tmp/sim" "$tmp/macos" || true; fi
    if [ -z "$profile" ] && command -v docker >/dev/null; then
      node compiler/bin/zinc.mjs run $ex --target linux >"$tmp/linux" 2>/dev/null
      if cmp -s "$tmp/sim" "$tmp/linux"; then echo "ok    $ex (default) sim == linux"; else echo "DIFF  $ex sim != linux"; fi
    fi
  done
done
rm -rf "$tmp"
