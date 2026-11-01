#!/bin/sh
# A project whose display driver is rmpp is an e-ink app whatever the profile it is packed for (a Linux pack runs on the Paper Pro through
# display-rmpp, profile "linux", eink false): zinc:ui's EINK is true under that driver, ZINC_EINK=0 still turns it off, and the same program
# with no driver stays in colour.
cd "$(dirname "$0")/../.." || exit 2
d=tests/golden/eink-driver
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/plain"; cp $d/main.tsx "$tmp/plain/"; echo '{ "name": "plain", "entry": "main.tsx" }' > "$tmp/plain/zinc.json"
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=1
run() { dir=$1; shift; env "$@" "$ZINC" run "$dir" 2>&1 | grep '^eink='; }
a=$(run $d ZINC_DISPLAY=rmpp); [ "${a%% *}" = "eink=true" ] || { echo "eink driver: the rmpp driver gave '$a'"; exit 1; }
a=$(run $d ZINC_DISPLAY=rmpp ZINC_EINK=0); [ "${a%% *}" = "eink=false" ] || { echo "eink driver: ZINC_EINK=0 gave '$a'"; exit 1; }
a=$(run "$tmp/plain" X=1); [ "${a%% *}" = "eink=false" ] || { echo "eink driver: no driver gave '$a'"; exit 1; }
echo "eink driver: ok"
