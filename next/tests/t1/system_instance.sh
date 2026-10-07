#!/bin/sh
# Single instance and autostart (ZN-242): two real processes (the second hands its argv and cwd to the first and exits 0), a stale socket after a killed first instance is replaced,
# and autostart writes, reads back and removes its LaunchAgent / XDG entry under a temporary HOME.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$tmp"' EXIT
fail=0
export ZINC_SYSTEM_RUNTIME_DIR="$tmp" HOME="$tmp/home"; mkdir -p "$HOME"
unset ZINC_DETERMINISTIC
mkdir "$tmp/app"
cat > "$tmp/app/main.ts" <<'T'
import * as system from 'zinc:system';
import * as instance from 'zinc:system/instance';
async function main(): Promise<void> {
  const first = await instance.lock((cwd: string, argv: string[]) => { console.log('second instance args', JSON.stringify(argv)); system.quit(0); });
  console.log(first ? 'first instance' : 'another instance has the app');
  if (!first) system.quit(0);
  else setTimeout(() => { console.log('no second instance came'); system.quit(1); }, 10000);
}
main();
T
printf '{"name":"i","entry":"main.ts","permissions":["instance"],"app":{"id":"dev.zinc.test.inst"}}\n' > "$tmp/app/zinc.json"
cd "$tmp/app" || exit 2
"$ZINC" run main.ts -- --first > "$tmp/first.log" 2>&1 &
first=$!
n=0; while ! grep -q "first instance" "$tmp/first.log" 2>/dev/null && [ $n -lt 100 ]; do sleep 0.1; n=$((n+1)); done
out=$("$ZINC" run main.ts -- --second 7 2>&1); code=$?
[ "$out" = "another instance has the app" ] && [ $code -eq 0 ] || { echo "second instance: '$out' (exit $code)"; fail=1; }
wait $first
grep -q 'second instance args \["--second","7"\]' "$tmp/first.log" || { echo "the first instance did not get the second's argv: $(cat "$tmp/first.log")"; fail=1; }
# a stale socket: a first instance killed hard leaves its socket file; the next one takes over
"$ZINC" run main.ts -- --again > "$tmp/third.log" 2>&1 &
third=$!
n=0; while ! grep -q "first instance" "$tmp/third.log" 2>/dev/null && [ $n -lt 100 ]; do sleep 0.1; n=$((n+1)); done
kill -9 $(pgrep -f "run main.ts -- --again") 2>/dev/null; wait $third 2>/dev/null
[ -e "$tmp/zinc-dev.zinc.test.inst.sock" ] || echo "(no stale socket left to recover)"
"$ZINC" run main.ts -- --fourth > "$tmp/fourth.log" 2>&1 &
fourth=$!
n=0; while ! grep -q "first instance" "$tmp/fourth.log" 2>/dev/null && [ $n -lt 100 ]; do sleep 0.1; n=$((n+1)); done
grep -q "first instance" "$tmp/fourth.log" || { echo "the instance after a hard kill is not the first: $(cat "$tmp/fourth.log")"; fail=1; }
kill $(pgrep -f "run main.ts -- --fourth") 2>/dev/null; wait $fourth 2>/dev/null
# autostart under the temporary HOME
mkdir "$tmp/auto"
cat > "$tmp/auto/main.ts" <<'T'
import * as autostart from 'zinc:system/autostart';
async function main(): Promise<void> {
  console.log('before', await autostart.isEnabled());
  await autostart.enable(true, ['--mode', 'tray']);
  console.log('enabled', await autostart.isEnabled());
  await autostart.disable();
  console.log('disabled', await autostart.isEnabled());
}
main();
T
printf '{"name":"a","entry":"main.ts","permissions":["autostart"],"app":{"id":"dev.zinc.test.auto","name":"Auto Test"}}\n' > "$tmp/auto/zinc.json"
cd "$tmp/auto" || exit 2
out=$("$ZINC" run main.ts 2>&1)
[ "$out" = "before false
enabled true
disabled false" ] || { echo "autostart: $out"; fail=1; }
# the entry itself, written and read back before the program removes it
cat > "$tmp/auto/main.ts" <<'T'
import * as autostart from 'zinc:system/autostart';
async function main(): Promise<void> { await autostart.enable(true, ['--mode', 'tray']); }
main();
T
"$ZINC" run main.ts >/dev/null 2>&1
if [ "$(uname)" = Darwin ]; then f="$HOME/Library/LaunchAgents/dev.zinc.test.auto.plist"; plutil -lint "$f" >/dev/null 2>&1 || { echo "the LaunchAgent is not a valid plist"; fail=1; }; grep -q "RunAtLoad" "$f" && grep -q -- "--hidden" "$f" && grep -q -- "<string>tray</string>" "$f" || { echo "LaunchAgent content: $(cat "$f" 2>&1)"; fail=1; }
else f="$HOME/.config/autostart/dev.zinc.test.auto.desktop"; grep -q "^Name=Auto Test" "$f" && grep -q -- "--hidden" "$f" || { echo ".desktop content: $(cat "$f" 2>&1)"; fail=1; }; fi
[ $fail -eq 0 ] && echo "system instance: ok"
exit $fail
