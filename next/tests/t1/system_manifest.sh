#!/bin/sh
# The system manifest contract (ZN-231): zinc.json "app", "permissions" (with per-target `-id`), unknown ids and bad app ids as diagnostics with the line, the Z5006 permission check at
# compile time, the capability keys of targets/capabilities.json, and the stub on a target without the feature.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
printf "import { isSupported } from 'zinc:system/tray';\nconsole.log(isSupported());\n" > "$tmp/a.ts"
out=$("$ZINC" run "$tmp/a.ts" 2>&1); case "$out" in *"Z5006"*'needs the permission "tray"'*) ;; *) echo "no Z5006 without permissions: $out"; fail=1 ;; esac
printf '{"name":"a","entry":"a.ts","permissions":["tray"],"app":{"id":"com.example.a","name":"A","dock":false,"urlSchemes":["a"]}}\n' > "$tmp/zinc.json"
out=$("$ZINC" run "$tmp/a.ts" 2>&1); [ "$out" = false ] || { echo "stub with the permission: '$out'"; fail=1; }
printf '{"name":"a","entry":"a.ts","permissions":["tray"],"targets":{"esp32":{"permissions":["-tray"]}}}\n' > "$tmp/zinc.json"
out=$("$ZINC" run "$tmp/a.ts" --profile esp32 2>&1); case "$out" in *Z5006*) ;; *) echo "-tray on esp32 does not remove the permission: $out"; fail=1 ;; esac
printf '{"name":"a","entry":"a.ts","permissions":["tray"]}\n' > "$tmp/zinc.json"
out=$("$ZINC" run "$tmp/a.ts" --profile esp32 2>&1); [ "$out" = false ] || { echo "esp32 build resolves tray to the stub: '$out'"; fail=1; }
printf '{"name":"a","entry":"a.ts","permissions":["tray"],"requires":["tray"]}\n' > "$tmp/zinc.json"
out=$("$ZINC" run "$tmp/a.ts" --profile esp32 2>&1); case "$out" in *"requires tray"*) ;; *) echo "requires tray on esp32 does not fail with the capability message: $out"; fail=1 ;; esac
printf '{"name":"a","app":{"id":"bad id"}}\n' > "$tmp/zinc.json"
out=$("$ZINC" run "$tmp/a.ts" 2>&1); code=$?; case "$out" in *"line 1: app.id 'bad id' is not a reverse-DNS id"*) [ $code -eq 2 ] || { echo "bad app id exit code $code"; fail=1; } ;; *) echo "bad app id: $out"; fail=1 ;; esac
printf '{\n "name":"a",\n "permissions":["tray","wifi"]\n}\n' > "$tmp/zinc.json"
out=$("$ZINC" run "$tmp/a.ts" 2>&1); case "$out" in *"line 3: unknown permission 'wifi'"*) ;; *) echo "unknown permission: $out"; fail=1 ;; esac
python3 - ../targets/capabilities.json <<'P' || fail=1
import json, sys
d = json.load(open(sys.argv[1]))
keys = "desktop notifications tray menubar dialogs windowctl multiwindow shortcuts instance autostart deeplink power".split()
bad = [(t, k) for t, c in d.items() if isinstance(c, dict) for k in keys if k not in c]
if bad: print("capability keys missing:", bad[:4]); sys.exit(1)
if not (d["macos"]["tray"] is True and d["linux"]["tray"] == "optional" and d["esp32"]["tray"] is False): print("wrong tray values"); sys.exit(1)
P
[ $fail -eq 0 ] && echo "system manifest: ok"
exit $fail
