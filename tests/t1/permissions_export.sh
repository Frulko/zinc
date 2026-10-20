#!/bin/sh
# Exported apps enforce zinc.json "permissions" (ZN-322.03): `zinc export --target macos` of tests/golden/permissions (camera added) prints the
# list, the compiled program refuses what the list does not cover exactly as ZINC_PERMISSIONS=enforce does (enforce.out), and the .app's
# Info.plist asks for the camera (NSCameraUsageDescription). macOS only (77 elsewhere).
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || { echo "permissions_export: macOS only"; exit 77; }
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
cp -R tests/golden/permissions "$tmp/p"
python3 - "$tmp/p/zinc.json" <<'PY'
import json, sys
p = sys.argv[1]; d = json.load(open(p)); d['permissions'].append('camera'); d['app'] = {'id': 'com.example.perm', 'name': 'Perm'}; json.dump(d, open(p, 'w'))
PY
out=$(cd "$tmp/p" && "$Z" export . --target macos 2>&1) || { echo "export failed: $out"; exit 1; }
echo "$out" | grep -qx 'permissions: fs:read:data, net:127.0.0.1, camera' || { echo "export does not list the permissions: $out"; fail=1; }
got=$(cd "$tmp/p" && timeout 60 dist/permissions-macos/permissions 2>&1)
[ "$got" = "$(cat tests/golden/permissions/enforce.out)" ] || { echo "the exported program does not enforce: $(printf '%s\n' "$got" | diff - tests/golden/permissions/enforce.out | head -6)"; fail=1; }
plutil -p "$tmp/p/dist/permissions-macos/permissions.app/Contents/Info.plist" | grep -q '"NSCameraUsageDescription" => "Perm uses the camera."' || { echo "no camera usage string in Info.plist"; fail=1; }
[ $fail -eq 0 ] && echo "permissions export: ok"
exit $fail
