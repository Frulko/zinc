#!/bin/sh
# zinc-session with ZINC_SHELL=1 (read from session.conf) runs the player as the shell, with the socket and the boot app
# left to it, and nothing else; when the shell fails twice within 60 s it writes zinc-report.txt and falls back to the
# old loop, which starts the boot app itself. `zinc` and `setsid` are stand-ins (no engine, no Linux needed).
cd "$(dirname "$0")/../.." || exit 2
root=$(pwd)
tmp=$(mktemp -d)
session=0
trap '[ $session -gt 0 ] && kill -TERM $session 2>/dev/null; sleep 0.3; rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/run" "$tmp/boot"
touch "$tmp/boot/app.zapp"
cat > "$tmp/bin/zinc" <<EOF
#!/bin/sh
case "\$1 \$2" in
  --version*) echo 0.0.0 ;;
  *player.zapp) echo "player socket=\$ZINC_SHELL_SOCKET boot=\$ZINC_BOOT_APP" >> "$tmp/events"; [ -z "\$ZINC_SHELL_SOCKET" ] || exit 3; exec sleep 30 ;;
  run*) echo "app \$2" >> "$tmp/events"; exec sleep 30 ;;
esac
EOF
printf '#!/bin/sh\nexec python3 -c "import os, sys; os.setsid(); os.execvp(sys.argv[1], sys.argv[1:])" "$@"\n' > "$tmp/bin/setsid"
printf '#!/bin/sh\nexit 0\n' > "$tmp/bin/systemd-notify"
chmod +x "$tmp/bin/"*
printf '# the shell\nZINC_SHELL=1\n' > "$tmp/session.conf"

wait_for() { n=0; while ! eval "$1"; do n=$((n + 1)); [ $n -gt 60 ] && return 1; sleep 0.1; done; }
env PATH="$tmp/bin:$PATH" ZINC_HOME="$tmp/home" ZINC_RUN="$tmp/run" ZINC_APP="$tmp/boot" ZINC_PLAYER="$tmp/player.zapp" \
  ZINC_SESSION_CONF="$tmp/session.conf" ZINC_SHELL=0 /bin/bash "$root/image/files/usr/lib/zinc/zinc-session" > "$tmp/session.out" 2>&1 &
session=$!
wait_for 'grep -q "^app " "$tmp/events" 2>/dev/null' || { echo "pi session shell: no fallback to the old loop: $(cat "$tmp/events" "$tmp/session.out" 2>&1)"; exit 1; }
fail=0
expected="player socket=$tmp/run/shell.sock boot=1
player socket=$tmp/run/shell.sock boot=0
app $tmp/boot/app.zapp"
[ "$(cat "$tmp/events")" = "$expected" ] || { echo "pi session shell: unexpected starts:"; cat "$tmp/events"; fail=1; }
grep -q "failed twice" "$tmp/run/zinc-report.txt" 2>/dev/null || { echo "pi session shell: no zinc-report.txt"; fail=1; }
[ $fail = 0 ] && echo "pi session shell: ok"
exit $fail
