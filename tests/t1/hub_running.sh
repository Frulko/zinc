#!/bin/sh
# The Hub's Running page and the engine heartbeat (ZN-844), headless on this machine with stand-ins: zinc-app's pidfiles in $TMPDIR, a
# fake /proc (ZINC_PROC_ROOT) whose cmdline says zinc, and the lines zinc-watch writes (<base>.watch). The page lists the live apps with
# their state, CPU, memory and uptime, shows the hung one at the top with "Stop it?", removes the pidfile of a pid that is gone or is no
# longer a zinc, and Stop ends an app (SIGTERM) and one that ignores SIGTERM (SIGKILL after 3 s). Then a running app writes ZINC_HEARTBEAT.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); pids=
trap 'kill $pids 2>/dev/null; rm -rf "$tmp"' EXIT
P=$tmp/proc
mkdir -p "$P" "$tmp/t"
export TMPDIR=$tmp/t ZINC_PROC_ROOT=$P ZINC_HUB_DIR=$tmp/hub
unset ZINC_DETERMINISTIC   # the uptime compares the pidfile's time with the real clock (tests/run sets the virtual one)
fail=0
standin() {   # name, watch line, [stubborn]: a live process with its fake /proc entry, pidfile and watcher line
  if [ -n "$3" ]; then sh -c 'trap "" TERM; while :; do sleep 0.1; done' & else sh -c 'trap "rm -rf $0/$$; exit 0" TERM; while :; do sleep 0.1; done' "$P" & fi
  pid=$!; pids="$pids $pid"
  mkdir "$P/$pid" && printf '/home/root/zinc/bin/zinc\0run\0/home/root/zinc-apps/%s.zapp\0' "$1" > "$P/$pid/cmdline"
  base=$TMPDIR/zinc-app-_home_root_zinc-apps_$1.zapp
  echo "$pid" > "$base.pid" && echo "$2" > "$base.watch"
  eval "pid_$1=$pid"
}
standin web 'ok 3 45210 full'
standin stuck 'hung 0 120000 full' stubborn
standin notes 'waste 12 30000 hidden'
echo 999999 > "$TMPDIR/zinc-app-_home_root_zinc-apps_gone.zapp.pid"   # the app ended without its watcher
sleep 30 & other=$!; pids="$pids $other"                                 # a pid now used by another program
mkdir "$P/$other" && printf 'sleep\0' > "$P/$other/cmdline" && echo "$other" > "$TMPDIR/zinc-app-_home_root_zinc-apps_reused.zapp.pid"
app() {
  ZINC_HEADLESS=1 ZINC_FRAMES=2000000000 ZINC_HUB_SCRIPT="$1" ZINC_SCENE_DUMP="$tmp/scene.bin" timeout 60 "$Z" run app/hub >"$tmp/app.log" 2>&1 \
    || { echo "the hub app failed ($1):"; tail -15 "$tmp/app.log"; fail=1; }
}
expect() { grep -qF "$1" "$tmp/app.log" || { echo "expected '$1' in:"; grep '^hub:' "$tmp/app.log"; fail=1; }; }

app "page running"
texts=$(python3 tools/scene-texts "$tmp/scene.bin")
for t in Running web 'OK · CPU 3% · 44 MB · up 0 min' stuck 'Not responding · CPU 0% · 117 MB · up 0 min' notes \
         'Hidden but using the CPU · CPU 12% · 29 MB · up 0 min · hidden' 'stuck is not responding. Stop it?' Wait; do
  echo "$texts" | grep -qxF "$t" || { echo "the running page does not show '$t':"; echo "$texts" | head -40; fail=1; }
done
expect 'hub: stuck is not responding'
for f in gone reused; do [ -e "$TMPDIR/zinc-app-_home_root_zinc-apps_$f.zapp.pid" ] && { echo "the stale pidfile of $f was kept"; fail=1; }; done
kill -0 "$other" 2>/dev/null || { echo "the program that reused a pid was signalled"; fail=1; }
# the widget Accueil shows: the app not responding, with Stop
app "widget"
texts=$(python3 tools/scene-texts "$tmp/scene.bin")
for t in 'Zinc Hub' 'stuck is not responding' Stop; do echo "$texts" | grep -qxF "$t" || { echo "the widget does not show '$t':"; echo "$texts"; fail=1; }; done
# stuck installed (no server): its tile on the Apps grid has the "!" badge
mkdir -p "$tmp/hub/apps/com.example.stuck" && printf 'version=1.0.0\nchannel=stable\nname=stuck\nsha256=x\n' > "$tmp/hub/apps/com.example.stuck/installed"
mkdir -p "$tmp/appdata/stuck"; export ZINC_HUB_APP_DATA=$tmp/appdata
app "page apps"
texts=$(python3 tools/scene-texts "$tmp/scene.bin")
echo "$texts" | grep -qxF stuck && echo "$texts" | grep -qxF '!' || { echo "the grid has no Not responding badge on stuck:"; echo "$texts" | head -30; fail=1; }
# Reset data on a running app stops it first (it would write its state back), then removes its data
standin mail 'ok 1 1000 full'
mkdir -p "$tmp/hub/apps/com.example.mail" "$tmp/appdata/mail" && printf 'version=1.0.0\nchannel=stable\nname=mail\nsha256=x\n' > "$tmp/hub/apps/com.example.mail/installed"
app "reset com.example.mail; reset com.example.mail"
expect "Reset mail: removed $tmp/appdata/mail"
sleep 0.3
kill -0 "$pid_mail" 2>/dev/null && { echo "Reset data left mail running"; fail=1; }
[ -e "$tmp/appdata/mail" ] && { echo "Reset data kept the data of the app it stopped"; fail=1; }

app "page running; stop web; stop stuck"
expect 'Stopped web.'
expect 'stuck did not stop on its own: it was killed.'
sleep 0.3
for n in web stuck; do
  eval "p=\$pid_$n"
  kill -0 "$p" 2>/dev/null && { echo "$n ($p) still runs after Stop"; fail=1; }
  [ -e "$TMPDIR/zinc-app-_home_root_zinc-apps_$n.zapp.pid" ] && { echo "the pidfile of $n was kept after Stop"; fail=1; }
done
texts=$(python3 tools/scene-texts "$tmp/scene.bin")
echo "$texts" | grep -qxF notes && ! echo "$texts" | grep -qF 'not responding. Stop it?' || { echo "after Stop: notes alone, no banner:"; echo "$texts" | head -30; fail=1; }

# the heartbeat: a running app rewrites ZINC_HEARTBEAT with its window state, every 2 s
ZINC_HEADLESS=1 ZINC_FRAMES=2000000000 ZINC_HEARTBEAT="$tmp/beat" "$Z" run app/hub >"$tmp/beat.log" 2>&1 & hub=$!; pids="$pids $hub"
for i in $(seq 1 300); do [ -s "$tmp/beat" ] && break; sleep 0.1; done
[ "$(cat "$tmp/beat" 2>/dev/null)" = full ] || { echo "no heartbeat from a running app: '$(cat "$tmp/beat" 2>/dev/null)'"; tail -5 "$tmp/beat.log"; fail=1; }
rm -f "$tmp/beat"; sleep 3
[ "$(cat "$tmp/beat" 2>/dev/null)" = full ] || { echo "the heartbeat was not written again within 3 s"; fail=1; }
kill $hub

[ $fail -eq 0 ] && echo "hub running: ok"
exit $fail
