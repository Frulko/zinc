#!/bin/sh
# npm packages on the web target (docs/targets/web.md, "npm packages"): the web-npm fixture (CommonJS, exports conditions, sub-paths, imports, the browser field, a pnpm-style symlink) through
# `zinc export --target web` and `zinc dev --target web` in headless Chrome, which must agree (one resolver); a save of the app does not bundle the packages again, an install does.
# Also the package manager side without any network: detection from the lockfile and the packageManager field, the clear error when it is missing, doctor and explain.
# Skipped (77) without Chrome or python3. Firefox and Safari are not tested here.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
export ZINC_BACKGROUND=1
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
# package manager detection and the errors; PATH holds only the system tools, so no manager is found
mkdir -p "$tmp/p1" "$tmp/p2" "$tmp/p3" "$tmp/empty"
echo '{"name":"a","packageManager":"pnpm@9.1.0"}' > "$tmp/p1/package.json"
echo '{"name":"b"}' > "$tmp/p2/package.json"; : > "$tmp/p2/yarn.lock"
echo '{"name":"c"}' > "$tmp/p3/package.json"
out=$(cd "$tmp/p1" && PATH=/usr/bin:/bin "$Z" add npm:zustand 2>&1); rc=$?
[ $rc -ne 0 ] && echo "$out" | grep -q "P0001.*pnpm.*packageManager field" || { echo "web_npm: add with no pnpm: $out"; fail=1; }
echo "$out" | grep -q "corepack enable pnpm" || { echo "web_npm: the error lacks the command to run: $out"; fail=1; }
out=$(cd "$tmp/p2" && PATH=/usr/bin:/bin "$Z" install 2>&1)
echo "$out" | grep -q "P0001.*yarn.*yarn.lock" || { echo "web_npm: install with a yarn.lock: $out"; fail=1; }
out=$(cd "$tmp/p3" && PATH=/usr/bin:/bin "$Z" add npm:ky 2>&1)
echo "$out" | grep -q "P0001.*npm.*default" || { echo "web_npm: npm is the default: $out"; fail=1; }
out=$(cd "$tmp/empty" && "$Z" install 2>&1); echo "$out" | grep -q "no zinc.json" || { echo "web_npm: install without package.json or zinc.json: $out"; fail=1; }
"$Z" explain P0001 | grep -q "does not install" || { echo "web_npm: zinc explain P0001"; fail=1; }
"$Z" explain P0002 | grep -q "Node" || { echo "web_npm: zinc explain P0002"; fail=1; }
"$Z" explain W0605 | grep -q "pre-bundle" || { echo "web_npm: zinc explain W0605"; fail=1; }
"$Z" doctor 2>&1 | grep -q "npm packages" || { echo "web_npm: zinc doctor does not report the package managers"; fail=1; }
# the browser side
command -v python3 >/dev/null 2>&1 || { echo "web_npm: no python3"; [ $fail -eq 0 ] && exit 77; exit 1; }
python3 -I -c "import sys; sys.path.insert(0, 'tools'); from cdp import find_chrome; sys.exit(0 if find_chrome() else 1)" || { echo "web_npm: no Chrome"; [ $fail -eq 0 ] && exit 77; exit 1; }
out=$(timeout 200 python3 -I tools/web-npm-test "$Z" tests/fixtures/web-npm) || { echo "web_npm: $out"; fail=1; }
exit $fail
