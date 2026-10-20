#!/bin/sh
# Deep links on macOS (ZN-243): a bundled app registered for a URL scheme (zinc build --bundle) receives `open <scheme>://...` on a cold start (current()) and on a running app (onOpen).
# The bundle lives under ~/.zinc/cache/macos/devapp: LaunchServices does not register bundles in temporary directories.
[ "$(uname)" = Darwin ] || { echo "skipped: macOS only"; exit 77; }
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); app="$HOME/.zinc/cache/macos/devapp/ZnDeepLinkTest.app"; ls=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
trap '$ls -u "$app" >/dev/null 2>&1; rm -rf "$app" "$tmp"' EXIT
mkdir -p "$HOME/.zinc/cache/macos/devapp"
cat > "$tmp/main.ts" <<T
import * as system from 'zinc:system';
import * as deeplink from 'zinc:system/deeplink';
import * as fs from 'zinc:fs';
const log = (s: string) => fs.appendText('$tmp/out.log', s + '\n');
log('current ' + JSON.stringify(deeplink.current()));
deeplink.onOpen((u: string) => { log('open-url ' + u); });
setTimeout(() => system.quit(0), 7000);
T
printf '{"name":"dl","entry":"main.ts","permissions":["deep-link","fs:write:%s/out.log"],"app":{"id":"dev.zinc.test.deeplinktest","name":"DL Test","urlSchemes":["zndltest"],"dock":false}}\n' "$tmp" > "$tmp/zinc.json"
cd "$tmp" || exit 2
env -u ZINC_DETERMINISTIC "$ZINC" build --bundle main.ts -o "$app" >/dev/null 2>&1 || { echo "build --bundle failed"; exit 1; }
$ls -f "$app"
env -u ZINC_DETERMINISTIC -u ZINC_HEADLESS open "zndltest://cold/start"
n=0; while ! grep -q "current" "$tmp/out.log" 2>/dev/null && [ $n -lt 100 ]; do sleep 0.1; n=$((n+1)); done
sleep 1
env -u ZINC_DETERMINISTIC -u ZINC_HEADLESS open "zndltest://warm/1"
n=0; while ! grep -q "warm/1" "$tmp/out.log" 2>/dev/null && [ $n -lt 100 ]; do sleep 0.1; n=$((n+1)); done
fail=0
grep -q 'current \["zndltest://cold/start"\]' "$tmp/out.log" || { echo "cold start: the URL is not in current(): $(cat "$tmp/out.log" 2>&1)"; fail=1; }
grep -q 'open-url zndltest://warm/1' "$tmp/out.log" || { echo "warm: onOpen did not get the URL: $(cat "$tmp/out.log" 2>&1)"; fail=1; }
pkill -f "ZnDeepLinkTest.app" 2>/dev/null
[ $fail -eq 0 ] && echo "macos deeplink: ok"
exit $fail
