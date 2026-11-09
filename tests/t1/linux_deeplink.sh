#!/bin/sh
# Deep links on Linux (ZN-243): deeplink.register('notes') writes the .desktop entry (Exec with %u, MimeType x-scheme-handler/notes) under XDG_DATA_HOME and makes it the default
# handler in XDG_CONFIG_HOME/mimeapps.list, keeping the other lines; a second launch with notes://x hands the URL to the running instance, where deeplink.onOpen gets it.
# Temporary XDG dirs and runtime dir: nothing of the user's desktop is touched. xdg-mime, when installed, must read the same default back.
[ "$(uname)" = Linux ] || { echo "skipped: Linux only"; exit 77; }
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$tmp"' EXIT
fail=0
export ZINC_SYSTEM_RUNTIME_DIR="$tmp" XDG_DATA_HOME="$tmp/data" XDG_CONFIG_HOME="$tmp/config" ZINC_HEADLESS=1
unset ZINC_DETERMINISTIC
mkdir -p "$tmp/app" "$XDG_CONFIG_HOME"
printf '[Added Associations]\ntext/plain=editor.desktop;\n\n[Default Applications]\nx-scheme-handler/notes=old.desktop;\ntext/html=browser.desktop;\n' > "$XDG_CONFIG_HOME/mimeapps.list"
cat > "$tmp/app/main.ts" <<'T'
import * as system from 'zinc:system';
import * as sys from 'zinc:sys';
import * as deeplink from 'zinc:system/deeplink';
import * as instance from 'zinc:system/instance';
async function main(): Promise<void> {
  if (sys.args().indexOf('--register') >= 0) { console.log('registered', await deeplink.register('notes')); return; }
  deeplink.onOpen((url: string) => { console.log('open-url ' + url); system.quit(0); });
  const first = await instance.lock((cwd: string, argv: string[]) => { console.log('second instance args', JSON.stringify(argv)); });
  if (first) console.error('first instance');   // stderr: the test waits on this line (stdout into a file is flushed at exit)
  else { console.log('handed over: ' + JSON.stringify(deeplink.current())); system.quit(0); }
  if (first) setTimeout(() => { console.log('no deep link came'); system.quit(1); }, 120000);   // only ends a failed run
}
main();
T
printf '{"name":"dl","entry":"main.ts","permissions":["deep-link","instance"],"app":{"id":"dev.zinc.test.deeplink","name":"Deep Link Test"}}\n' > "$tmp/app/zinc.json"
cd "$tmp/app" || exit 2
out=$("$ZINC" run main.ts -- --register 2>/dev/null)
[ "$out" = "registered true" ] || { echo "register: '$out'"; fail=1; }
d="$XDG_DATA_HOME/applications/dev.zinc.test.deeplink.desktop"
grep -q '^Exec=".*" %u$' "$d" && grep -q '^MimeType=x-scheme-handler/notes;$' "$d" && grep -q '^Name=Deep Link Test$' "$d" || { echo ".desktop content: $(cat "$d" 2>&1)"; fail=1; }
m="$XDG_CONFIG_HOME/mimeapps.list"
[ "$(grep -c '^x-scheme-handler/notes=' "$m")" = 1 ] && grep -q '^x-scheme-handler/notes=dev.zinc.test.deeplink.desktop;$' "$m" && grep -q '^text/html=browser.desktop;$' "$m" && grep -q '^text/plain=editor.desktop;$' "$m" || { echo "mimeapps.list: $(cat "$m")"; fail=1; }
if command -v xdg-mime >/dev/null 2>&1; then
  q=$(xdg-mime query default x-scheme-handler/notes 2>/dev/null)
  [ "$q" = dev.zinc.test.deeplink.desktop ] || { echo "xdg-mime reads back '$q'"; fail=1; }
fi
# the URL of a second launch reaches the first through the single-instance socket
ready() { n=0; while ! grep -q "first instance" "$1" 2>/dev/null && kill -0 "$2" 2>/dev/null && [ $n -lt 6000 ]; do sleep 0.1; n=$((n+1)); done; }
"$ZINC" run main.ts > "$tmp/first.log" 2>&1 &
first=$!
ready "$tmp/first.log" $first
out=$("$ZINC" run main.ts -- notes://doc/7 2>/dev/null); code=$?
[ "$out" = 'handed over: ["notes://doc/7"]' ] && [ $code -eq 0 ] || { echo "second launch: '$out' (exit $code)"; fail=1; }
wait $first
grep -q '^open-url notes://doc/7$' "$tmp/first.log" || { echo "the first instance did not get the URL: $(cat "$tmp/first.log")"; fail=1; }
[ $fail -eq 0 ] && echo "linux deeplink: ok"
exit $fail
