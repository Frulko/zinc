#!/bin/sh
# image/files/usr/lib/zinc/zinc-session gives an app of the agent it starts (a tile tapped in the player: next-app names
# agent/apps/<name>) the agent's pid file and log, so `zinc device stop <name>` finds and ends it; a stopped app (SIGTERM,
# 143) leaves no crash report and the player comes back. `zinc` and `setsid` are stand-ins (no engine, no Linux needed).
cd "$(dirname "$0")/../.." || exit 2
root=$(pwd)
tmp=$(mktemp -d)
session=0
trap '[ $session -gt 0 ] && kill -TERM $session 2>/dev/null; sleep 0.3; rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/run" "$tmp/home/agent/apps/demo"
touch "$tmp/home/agent/apps/demo/app.zapp"
cat > "$tmp/bin/zinc" <<EOF
#!/bin/sh
case "\$1 \$2" in
  --version*) echo 0.0.0 ;;
  *player.zapp) echo started >> "$tmp/player.started"; exec sleep 30 ;;
  run*) echo "demo runs \$2"; exec sleep 30 ;;
esac
EOF
printf '#!/bin/sh\nexec python3 -c "import os, sys; os.setsid(); os.execvp(sys.argv[1], sys.argv[1:])" "$@"\n' > "$tmp/bin/setsid"
printf '#!/bin/sh\nexit 0\n' > "$tmp/bin/systemd-notify"
chmod +x "$tmp/bin/"*
echo "$tmp/home/agent/apps/demo" > "$tmp/run/next-app"

wait_for() { n=0; while ! eval "$1"; do n=$((n + 1)); [ $n -gt 50 ] && return 1; sleep 0.1; done; }
env PATH="$tmp/bin:$PATH" ZINC_HOME="$tmp/home" ZINC_RUN="$tmp/run" ZINC_APP="$tmp/none" ZINC_PLAYER="$tmp/player.zapp" \
  /bin/bash "$root/image/files/usr/lib/zinc/zinc-session" > "$tmp/session.out" 2>&1 &
session=$!
pidfile="$tmp/home/agent/run/demo.pid"
wait_for '[ -s "$pidfile" ]' || { echo "pi session: no agent pid file for the app it started: $(cat "$tmp/session.out")"; exit 1; }
pid=$(cat "$pidfile")
kill -0 "$pid" || { echo "pi session: the pid file names no running process"; exit 1; }
wait_for 'grep -q "demo runs" "$tmp/home/agent/logs/demo.log" 2>/dev/null' || { echo "pi session: the app's output is not in the agent's log"; exit 1; }
kill -TERM -- "-$pid"   # what the agent's stopApp does
wait_for '[ -e "$tmp/player.started" ]' || { echo "pi session: the player did not come back after the stop"; exit 1; }
fail=0
[ ! -e "$pidfile" ] || { echo "pi session: the pid file outlives the app"; fail=1; }
[ ! -e "$tmp/run/crash.txt" ] || { echo "pi session: a stopped app left a crash report"; fail=1; }
[ $fail = 0 ] && echo "pi session: ok"
exit $fail
