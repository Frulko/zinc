#!/bin/sh
# Zinc Inspector discovery: a program on a port the system chose (ZINC_DEVTOOLS_PORT=0) announces it in <zinc home>/run/devtools and is found
# without scanning its port, named after its project with its engine and run; a stale file is removed. When the program attached exits, the
# inspector waits for it and, once it runs again (another process, another port: what zinc dev does at each save), attaches to it again on
# the same view.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'kill $target $insp 2>/dev/null; rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home" ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000
fail=0
start() {   # the target on any free port, until it listens
  ZINC_DEV=1 ZINC_DEVTOOLS_PORT=0 timeout 60 "$ZINC" run tests/data/inspector_stage > "$tmp/target.log" 2>&1 & target=$!
  n=0; while [ $n -lt $((400 * ${ZN_WAIT_SCALE:-1})) ] && ! grep -q "zinc devtools:" "$tmp/target.log"; do sleep 0.05; n=$((n+1)); done
}
mkdir -p "$ZINC_HOME/run/devtools"
echo '{"port":1,"pid":1}' > "$ZINC_HOME/run/devtools/1.json"   # a program that died without removing its file
start
ls "$ZINC_HOME/run/devtools" | grep -qv '^1.json$' || { echo "the program does not announce its port"; fail=1; }
ZINC_INSPECTOR_DUMP=reconnect timeout 60 "$ZINC" run app/inspector/main.tsx -- announced > "$tmp/dump" 2>&1 & insp=$!
n=0; while [ $n -lt 600 ] && ! grep -q "ready for restart" "$tmp/dump"; do sleep 0.05; n=$((n+1)); done
kill $target; wait $target 2>/dev/null
sleep 1.5
start
wait $insp
want() { grep -qF -- "$1" "$tmp/dump" || { echo "missing in the inspector's dump: $1"; fail=1; }; }
want "programs: 1"
want "program: inspector_stage (page)"
want "card: interpreter · dev run · "
want "attached: inspector_stage (port "
want "dropped: inspector_stage exited: waiting for it to come back"
want "again: attached again: inspector_stage restarted | view elements"
[ -f "$ZINC_HOME/run/devtools/1.json" ] && { echo "the stale file is kept"; fail=1; }
kill $target 2>/dev/null; wait $target 2>/dev/null
[ $fail = 0 ] || cat "$tmp/dump"
exit $fail
