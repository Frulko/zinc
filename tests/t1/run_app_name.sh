#!/bin/sh
# A run app carries its project's name (ZN-733): `zinc run` names its program after zinc.json "name", else the folder of a main file, else the file,
# and the host gives that name to the window (its title unless zinc.json sets one), to SDL's app metadata and to the process. The host says the
# name it was given on stderr (ZINC_WINDOW_LOG): a headless run has no window to ask. Interpreter and native (the cached executable of
# tests/data/app_name is started through a link that carries the name). The name of the app that starts the run (ZINC_APP_NAME) is not kept.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/Folder Name"
cp tests/data/app_name/main.ts "$tmp/Folder Name/main.ts"; cp tests/data/app_name/main.ts "$tmp/lone.ts"
title() { ZINC_HEADLESS=1 ZINC_FRAMES=1 ZINC_WINDOW_LOG=1 ZINC_APP_NAME="The Parent" "$ZINC" run "$@" 2>&1 | sed -n 's/^zinc: window "\(.*\)"$/\1/p' | head -1; }
expect() { [ "$1" = "$2" ] || { echo "run app name: $3: the window is named '$1', not '$2'"; fail=1; }; }
expect "$(title --interp tests/data/app_name)" "Blue Demo" "zinc.json name, interpreter"
expect "$(title --interp "$tmp/Folder Name/main.ts")" "Folder Name" "the folder of a main file"
expect "$(title --interp "$tmp/lone.ts")" "lone" "a file alone"
expect "$(title --native tests/data/app_name)" "Blue Demo" "zinc.json name, native"
"$ZINC" build tests/data/app_name -o "$tmp/built" >/dev/null 2>&1 || { echo "run app name: zinc build failed"; fail=1; }
expect "$(ZINC_HEADLESS=1 ZINC_FRAMES=1 ZINC_WINDOW_LOG=1 ZINC_APP_NAME="The Parent" "$tmp/built" 2>&1 | sed -n 's/^zinc: window "\(.*\)"$/\1/p' | head -1)" "Blue Demo" "a built app, over the name of the app that starts it"
exit $fail
