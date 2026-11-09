#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
check_icons() {
  names=$(printf '%s\n' "$1" | sed -n 's/^feedback icons: //p' | tr ',' '\n')
  for required in info loader-circle; do
    printf '%s\n' "$names" | rg -qx "$required" || { echo "missing inferred feedback icon: $required"; echo "$1"; exit 1; }
  done
  if printf '%s\n' "$1" | rg -q 'warning U0001'; then echo "$1"; exit 1; fi
}
for engine in interp quickjs; do
  case "$engine" in interp) set -- --interp;; quickjs) set -- --engine quickjs;; esac
  for fixture in kit-feedback kit-feedback-react; do
    got=$(ZINC_HEADLESS=1 ZINC_FRAMES=8 timeout 20 "$ZINC" run "tests/golden/$fixture" "$@" 2>&1) || { echo "$got"; exit 1; }
    check_icons "$got"
    echo "$got" | rg -q '^feedback( react)?: ok$' || { echo "$got"; exit 1; }
  done
  got=$(ZINC_RENDER=native ZINC_HEADLESS=1 ZINC_FRAMES=8 timeout 20 "$ZINC" run tests/golden/kit-feedback "$@" 2>&1) || { echo "$got"; exit 1; }
  echo "$got" | rg -q '^feedback: ok$' || { echo "$got"; exit 1; }
done
echo 'kit feedback: ok'
