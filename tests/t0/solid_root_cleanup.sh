#!/bin/sh
# Canonical render owns cleanup, even after replacement, a throw or a queued effect.
set -eu
cd "$(dirname "$0")/../.."
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=4
unset ZINC_HOT
for engine in interp native quickjs hot; do
  case "$engine" in
    quickjs) set -- --engine quickjs ;;
    hot) export ZINC_HOT=1; set -- --interp ;;
    *) set -- "--$engine" ;;
  esac
  output=$(timeout 20 "$ZINC" run tests/data/solid_root_cleanup.tsx "$@" 2>&1) || { echo "$engine: $output"; exit 1; }
  echo "$output" | grep -q 'solid-root-cleanup: pass' || { echo "$engine: $output"; exit 1; }
  echo "solid-root-cleanup $engine: pass"
done
