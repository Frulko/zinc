#!/bin/sh
# npm packages on QuickJS (ZN-815), run as they are and linked by zinc bundle: a package reads the Web globals (crypto, TextEncoder, URL, fetch)
# with no import, the browser build of a package wins (the "browser" exports condition, the browser field and its `false` for a Node file), a
# UMD package (dayjs's shape) loads, a catch variable may carry a type, and Date's local getters agree with the constructor's zone.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
p="$tmp/p"; m="$p/node_modules"
mkdir -p "$m/umdlib" "$m/nano" "$m/uid" "$m/qsl"
printf '{ "name": "umdlib", "main": "umdlib.min.js" }\n' > "$m/umdlib/package.json"
cat > "$m/umdlib/umdlib.min.js" <<'EOF'
!function(t,e){"object"==typeof exports&&"undefined"!=typeof module?module.exports=e():"function"==typeof define&&define.amd?define(e):(t="undefined"!=typeof globalThis?globalThis:t||self).umdlib=e()}(this,(function(){"use strict";return function(d){var x=new Date(d);return x.getFullYear()+"-"+(x.getMonth()+1)+"-"+x.getDate()+" "+x.getHours()+"h"}}));
EOF
printf '{ "name": "nano", "type": "module", "main": "index.js", "browser": { "./index.js": "./index.browser.js" }, "exports": { ".": { "browser": "./index.browser.js", "default": "./index.js" } } }\n' > "$m/nano/package.json"
printf "import { webcrypto } from 'node:crypto';\nexport const nanoid = () => 'node build';\n" > "$m/nano/index.js"
printf "export const nanoid = () => 'browser build ' + crypto.getRandomValues(new Uint8Array(4)).length;\n" > "$m/nano/index.browser.js"
printf '{ "name": "uid", "type": "module", "module": "index.js" }\n' > "$m/uid/package.json"
printf "export function v4() { return crypto.getRandomValues(new Uint8Array(16)).length + ' ' + new TextEncoder().encode('h\\u00e9').length + ' ' + new URL('https://a.b/c?d=1').pathname + ' ' + typeof fetch; }\n" > "$m/uid/index.js"
printf '{ "name": "qsl", "main": "index.js", "browser": { "./util.inspect.js": false } }\n' > "$m/qsl/package.json"
printf "var inspect = require('./util.inspect.js');\nexports.stringify = function (o) { return Object.keys(o).map(function (k) { return k + '=' + o[k]; }).join('&') + (typeof inspect === 'function' ? ' node' : ' browser'); };\n" > "$m/qsl/index.js"
printf "module.exports = require('util').inspect;\n" > "$m/qsl/util.inspect.js"
cat > "$p/main.ts" <<'EOF'
import umdlib from 'umdlib';
import { nanoid } from 'nano';
import { v4 } from 'uid';
import qs, { stringify } from 'qsl';
console.log(umdlib(new Date(2024, 0, 15, 12).getTime()));
console.log(nanoid());
console.log(v4());
console.log(qs.stringify({ a: 1, b: 2 }), stringify === qs.stringify);
try { JSON.parse('{'); } catch (e: any) { console.log('caught', e instanceof SyntaxError); }
const d = new Date(2024, 6, 15, 23, 30);
console.log(d.getHours(), d.getMinutes(), d.getDate(), new Date(d.getTime() - d.getTimezoneOffset() * 60000).getUTCHours());
EOF
want="2024-1-15 12h
browser build 4
16 3 /c function
a=1&b=2 browser true
caught true
23 30 15 23"
for tz in UTC America/New_York Asia/Kolkata; do
  got=$(TZ=$tz timeout 20 "$ZINC" run "$p/main.ts" --engine quickjs 2>&1)
  [ "$got" = "$want" ] || { echo "TZ=$tz: the program on quickjs printed: $got"; fail=1; }
done

# zinc bundle: only with the pinned esbuild already in ZINC_HOME
if ZINC_OFFLINE=1 "$ZINC" toolchain esbuild >/dev/null 2>&1; then
  timeout 60 "$ZINC" bundle "$p/main.ts" -o "$tmp/out/app.js" >"$tmp/bundle.log" 2>&1 || { echo "zinc bundle failed: $(cat "$tmp/bundle.log")"; fail=1; }
  got=$(TZ=America/New_York timeout 20 "$ZINC" run "$tmp/out/app.js" 2>&1)
  [ "$got" = "$want" ] || { echo "the bundle printed: $got"; fail=1; }
fi
exit $fail
