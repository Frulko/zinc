#!/bin/sh
# The inspector's port (ZN-633): ZINC_DEVTOOLS_PORT, else zinc.json plugins.devtools.port, else 9229. One project runs twice at the same time, once on the port
# of its zinc.json and once on the port of the variable (which wins), and a scripted DevTools client (tools/cdp-probe) reads the document of each.
# Skips (77) without python3.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || exit 77
tmp=$(mktemp -d); trap 'kill $a $b 2>/dev/null; rm -rf "$tmp"' EXIT
set -- $(python3 tests/free_ports.py 2); fromJson=$1; fromEnv=$2
mkdir -p "$tmp/app/src"
cp tests/golden/ui-style/radius.tsx "$tmp/app/src/screen.tsx"
printf "import 'zinc:devtools';\nimport './screen';\n" > "$tmp/app/src/main.tsx"
printf '{"name":"app","entry":"src/main.tsx","plugins":{"devtools":{"port":%s}}}\n' "$fromJson" > "$tmp/app/zinc.json"
export ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000
unset ZINC_DEVTOOLS_PORT
timeout 60 "$ZINC" run "$tmp/app" > "$tmp/a.log" 2>&1 & a=$!
ZINC_DEVTOOLS_PORT=$fromEnv timeout 60 "$ZINC" run "$tmp/app" > "$tmp/b.log" 2>&1 & b=$!
fail=0
for run in "a $fromJson zinc.json" "b $fromEnv ZINC_DEVTOOLS_PORT"; do
  set -- $run
  n=0; while [ $n -lt 200 ] && ! grep -q "zinc devtools:" "$tmp/$1.log"; do sleep 0.05; n=$((n+1)); done   # the inspector listens (stderr, not buffered)
  grep -q "localhost:$2)" "$tmp/$1.log" || { echo "the run with the port of $3 does not listen on $2: $(cat "$tmp/$1.log")"; fail=1; continue; }
  python3 tools/cdp-probe "$2" > "$tmp/$1.cdp" 2>&1 || { echo "no inspector on $2 ($3): $(cat "$tmp/$1.cdp")"; fail=1; }
done
kill -0 $a 2>/dev/null && kill -0 $b 2>/dev/null || { echo "a program ended before both were inspected"; fail=1; }   # both alive: inspected at once
[ $fail -eq 0 ] && echo "devtools_port: ok (zinc.json $fromJson, ZINC_DEVTOOLS_PORT $fromEnv)"
exit $fail
