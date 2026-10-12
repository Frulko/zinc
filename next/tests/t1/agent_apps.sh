#!/bin/sh
# Apps on a device through the agent (ZN-729.02), on the loopback interface: a project deployed (packed, installed, started) with its log
# and its exit status; a UI app started with its inspector, whose /json/list is read through a forwarded port; an export directory
# installed and started with arguments and variables, its log followed while it runs, stopped, removed; a log that grows past its bound;
# a reversed port (a server of the workstation called from the device);
# and the shell as a terminal: typed commands, the window's size followed when it changes, the exit status. Skips (77) without python3.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || exit 77
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
D="$tmp/device" W="$tmp/work" name="zn-a$$" fail=0
dev() { ZINC_HOME="$W" timeout 60 "$Z" device "$@"; }
bad() { echo "FAIL: $*"; fail=1; }
cleanup() {
  for f in "$D"/agent/run/*.pid; do [ -e "$f" ] && kill -- "-$(cat "$f")" 2>/dev/null; done   # apps outlive their agent
  kill $apid $fpid $lpid $rpid $spid 2>/dev/null; wait $apid $fpid $lpid $rpid $spid 2>/dev/null
  rm -rf "$tmp"
}
trap cleanup EXIT
until_grep() { n=0; while [ $n -lt 100 ] && ! grep -q "$1" "$2" 2>/dev/null; do sleep 0.1; n=$((n+1)); done; grep -q "$1" "$2" 2>/dev/null; }

ZINC_HOME="$D" SHELL=/bin/sh "$Z" agent --bind 127.0.0.1 --port 0 --no-mdns --name "$name" > "$tmp/agent.log" 2>&1 & apid=$!
until_grep "pairing code" "$tmp/agent.log" || { echo "the agent did not start: $(cat "$tmp/agent.log")"; exit 1; }
port=$(sed -n 's/.*listening on 127.0.0.1:\([0-9]*\).*/\1/p' "$tmp/agent.log")
dev pair "127.0.0.1:$port" "$(sed -n 's/.*pairing code: \([0-9]*\).*/\1/p' "$tmp/agent.log")" > /dev/null || { echo "pairing failed"; exit 1; }

# a command-line project: deploy runs it there, its output and its exit status are in its log
ZINC_HOME="$W" "$Z" new cli "$tmp/cli" > /dev/null || exit 2
out=$(cd "$tmp/cli" && dev deploy --no-logs 2>&1) || bad "deploy: $out"
app=$(echo "$out" | sed -n 's/^installed \([^ ]*\) on .*/\1/p')
[ -n "$app" ] || bad "deploy did not say what it installed: $out"
n=0; while [ $n -lt 100 ] && ! dev logs "$app" 2>/dev/null | grep -q '^\[exited'; do sleep 0.1; n=$((n+1)); done
dev logs "$app" > "$tmp/cli.log" 2>&1
want=$(cd "$tmp/cli" && ZINC_HOME="$W" "$Z" run . 2>/dev/null | head -1)
[ -n "$want" ] && grep -qF "$want" "$tmp/cli.log" && grep -q '^\[exited 0\]' "$tmp/cli.log" || bad "the log of the deployed project lacks its output '$want' or its exit: $(cat "$tmp/cli.log")"

# a UI app with its inspector: /json/list through a forwarded port
set -- $(python3 tests/free_ports.py 2); inspector=$1; arg=$2
mkdir -p "$tmp/ui/src"
cp tests/golden/ui-style/radius.tsx "$tmp/ui/src/screen.tsx"
printf "import 'zinc:devtools';\nimport './screen';\n" > "$tmp/ui/src/main.tsx"
printf '{"name":"inspected","entry":"src/main.tsx"}\n' > "$tmp/ui/zinc.json"
out=$(dev deploy "$tmp/ui" --no-logs --env ZINC_DEVTOOLS_PORT=$inspector --env ZINC_HEADLESS=1 --env ZINC_REALTIME=1 --env ZINC_FRAMES=100000000 2>&1) || bad "deploy of the UI app: $out"
n=0; while [ $n -lt 100 ] && ! dev logs inspected 2>/dev/null | grep -q "zinc devtools:"; do sleep 0.1; n=$((n+1)); done
dev apps | grep -q "^inspected .*running" || bad "the UI app is not running: $(dev apps; dev logs inspected)"
ZINC_HOME="$W" "$Z" device forward 0 "$inspector" > "$tmp/fwd.log" 2>&1 & fpid=$!   # not through dev(): $! must be the process to end
until_grep "forwarding 127.0.0.1:" "$tmp/fwd.log" || bad "forward did not start: $(cat "$tmp/fwd.log")"
local=$(sed -n 's/forwarding 127.0.0.1:\([0-9]*\) .*/\1/p' "$tmp/fwd.log")
get() { python3 -c "import sys, urllib.request; sys.stdout.write(urllib.request.urlopen(sys.argv[1], timeout=5).read().decode())" "http://127.0.0.1:$local/json/list" 2>&1; }
for again in 1 2; do   # each connection is a session of its own
  list=$(get)
  case $list in *'"webSocketDebuggerUrl"'*"127.0.0.1:$local"*) ;; *) bad "the inspector through the forwarded port ($again): $list";; esac
done
dev stop inspected | grep -q "^stopped inspected" || bad "stop of the UI app"

# an export directory: arguments, variables, the log followed while it runs, stop, uninstall
mkdir -p "$tmp/tool"
printf '#!/bin/sh\necho "tool $1 says $GREETING"\nexec sleep 60\n' > "$tmp/tool/run.sh"
dev install "$tmp/tool" --name tool > /dev/null 2>&1 || bad "install of an export directory"
dev run tool --env GREETING=bonjour -- "$arg" > /dev/null 2>&1 || bad "run of the export directory"
ZINC_HOME="$W" "$Z" device logs tool -f > "$tmp/tool.log" 2>&1 & lpid=$!
until_grep "tool $arg says bonjour" "$tmp/tool.log" || bad "the followed log lacks the app's line: $(cat "$tmp/tool.log")"
dev apps | grep -q "^tool .*export .*running" || bad "apps does not show the tool running: $(dev apps)"
dev stop tool > /dev/null; until_grep "^\[exited" "$tmp/tool.log" || bad "the followed log does not get the exit of the stopped app"
dev apps | grep -q "^tool .*stopped" || bad "the tool still runs after stop"
dev uninstall tool > /dev/null && dev uninstall inspected > /dev/null && dev uninstall "$app" > /dev/null || bad "uninstall"
[ -z "$(dev apps)" ] || bad "apps are left after uninstall: $(dev apps)"
# the other way: a server of the workstation called from the device through a reversed port
mkdir -p "$tmp/site"; echo "from the workstation" > "$tmp/site/index.html"
python3 -m http.server "$arg" --bind 127.0.0.1 --directory "$tmp/site" > /dev/null 2>&1 & spid=$!
ZINC_HOME="$W" "$Z" device reverse 0 "$arg" > "$tmp/rev.log" 2>&1 & rpid=$!
until_grep "reaches 127.0.0.1:$arg" "$tmp/rev.log" || bad "reverse did not start: $(cat "$tmp/rev.log")"
there=$(sed -n 's/^port \([0-9]*\) of .*/\1/p' "$tmp/rev.log")
n=0; got=; while [ $n -lt 30 ] && [ "$got" != "from the workstation" ]; do   # the server may still be starting
  got=$(dev shell "python3 -c 'import urllib.request; print(urllib.request.urlopen(\"http://127.0.0.1:$there/index.html\", timeout=5).read().decode(), end=\"\")'" 2>/dev/null); n=$((n+1)); [ "$got" = "from the workstation" ] || sleep 0.2
done
[ "$got" = "from the workstation" ] || bad "the device does not reach the workstation's server through the reversed port: $got"

# an app that prints 5 MB: its log is cut back to its bound while it runs, the end kept beside it
mkdir -p "$tmp/loud"
printf '#!/bin/sh\nhead -c 5000000 /dev/zero | tr "\\000" x\necho\necho loud-done\nexec sleep 60\n' > "$tmp/loud/run.sh"
dev install "$tmp/loud" --name loud > /dev/null 2>&1 && dev run loud > /dev/null 2>&1 || bad "install and run of the loud app"
log="$D/agent/logs/loud.log"
n=0; while [ $n -lt 80 ] && [ ! -s "$log.1" ]; do sleep 0.1; n=$((n+1)); done
[ -s "$log.1" ] && [ "$(wc -c < "$log.1")" -le 1048576 ] && [ "$(wc -c < "$log")" -lt 4194304 ] && grep -q loud-done "$log.1" || bad "the log was not bounded: $(wc -c < "$log") bytes, kept $(wc -c < "$log.1" 2>/dev/null)"
dev uninstall loud > /dev/null || bad "uninstall of the loud app"

# the shell as a terminal: the client in a pseudo-terminal, commands typed, the window resized, the status of exit
python3 - "$Z" "$W" <<'PY' || bad "the terminal session"
import fcntl, os, pty, select, struct, sys, termios, time
zinc, home = sys.argv[1], sys.argv[2]
pid, fd = pty.fork()
if pid == 0:
    os.environ["ZINC_HOME"] = home
    os.execv(zinc, [zinc, "device", "shell"])
def size(rows, cols): fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
def expect(text):
    seen, end = b"", time.time() + 15
    while time.time() < end:
        if select.select([fd], [], [], 0.2)[0]:
            try: seen += os.read(fd, 4096)
            except OSError: break
            if text in seen: return
    sys.exit("terminal: no %r in %r" % (text, seen[-300:]))
size(30, 100)
os.write(fd, b"stty size\n"); expect(b"30 100")
size(40, 120); time.sleep(0.3)                      # SIGWINCH to the client, which tells the device
os.write(fd, b"stty size\n"); expect(b"40 120")
os.write(fd, b"exit 3\n")
end = time.time() + 15
while time.time() < end:
    done, status = os.waitpid(pid, os.WNOHANG)
    if done:
        sys.exit(0 if os.WIFEXITED(status) and os.WEXITSTATUS(status) == 3 else "terminal: the client ended with %r" % status)
    if select.select([fd], [], [], 0.1)[0]:
        try: os.read(fd, 4096)
        except OSError: pass
sys.exit("terminal: the client did not end")
PY

dev install "$tmp/cli/src" > "$tmp/notapp" 2>&1 && bad "a directory that is not an export was installed"
grep -q "neither a .zapp nor an export directory" "$tmp/notapp" || bad "not an app: $(cat "$tmp/notapp")"

[ $fail -eq 0 ] && echo "agent_apps: ok"
exit $fail
