#!/bin/sh
# QuickJS engine (ZN-051): plain JavaScript (modules, promises, virtual timers, Node style console.log), TypeScript stripped by blanking
# (tests/golden/qjs; ts_syntax.ts: the type syntax libraries write, top-level await, CommonJS files), an uncaught exception ends with exit code 101, an unknown engine is refused.
cd "$(dirname "$0")/../.." || exit 2
fail=0
for t in plain.js strip.ts ts_syntax.ts ts_more.ts; do
  "$ZINC" run tests/golden/qjs/$t --engine quickjs 2>&1 | diff -q - tests/golden/qjs/${t%.*}.out >/dev/null || { echo "$t on quickjs differs from tests/golden/qjs/${t%.*}.out"; fail=1; }
done
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
# the same TypeScript on the typed engines: what they do not type yet is Z0005 with its name, never a syntax error (Z0001, Z0002)
cp tests/golden/qjs/shapes.ts "$tmp/"
sed -e '/await/d' -e '/cjs/d' -e 's/, value + 1//' tests/golden/qjs/ts_syntax.ts > "$tmp/typed.ts"
"$ZINC" check "$tmp/typed.ts" > "$tmp/typed.out" 2>&1
! grep -q "Z000[12]" "$tmp/typed.out" || { echo "TypeScript type syntax is a syntax error on the typed engines"; fail=1; }
for w in "intersection types" "indexed access types" "object rest patterns" "index signature types"; do
  grep -q "Z0005: Syntax not supported yet: $w" "$tmp/typed.out" || { echo "the typed engines do not report '$w'"; fail=1; }
done
printf "console.log('before');\nthrow new Error('boom');\n" > "$tmp/boom.js"
"$ZINC" run "$tmp/boom.js" --engine quickjs >/dev/null 2>&1; [ $? -eq 101 ] || { echo "an uncaught exception does not end with 101 on quickjs"; fail=1; }
"$ZINC" run "$tmp/boom.js" --engine nope >/dev/null 2>&1; [ $? -eq 2 ] || { echo "an unknown engine is not refused"; fail=1; }
# zinc:sys signals: onSignal hears a kill sent to itself
printf "import * as sys from 'zinc:sys';\nsys.onSignal('SIGUSR1', () => { console.log('got SIGUSR1'); sys.exit(0); });\nsetTimeout(() => { sys.kill(sys.pid(), 'SIGUSR1'); }, 10);\n" > "$tmp/sig.ts"
"$ZINC" run "$tmp/sig.ts" --engine quickjs 2>&1 | grep -q '^got SIGUSR1$' || { echo "sys.onSignal does not work on quickjs"; fail=1; }
printf "const x: number = 1;\ninterface;\n" > "$tmp/bad.ts"
"$ZINC" run "$tmp/bad.ts" --engine quickjs 2>&1 | grep -q "bad.ts:2" || { echo "a type error position is not reported on quickjs"; fail=1; }
# a project's zinc.json window size reaches the QuickJS run as it reaches the typed engines (game-2d opened at 320x240)
mkdir "$tmp/sized"
printf '{ "entry": "main.ts", "targets": { "macos": { "width": 200, "height": 100 }, "linux": { "width": 200, "height": 100 } } }\n' > "$tmp/sized/zinc.json"
printf "import { clear, onFrame } from 'zinc:gfx';\nonFrame(() => { clear(0x102030); });\n" > "$tmp/sized/main.ts"
ZINC_HEADLESS=1 ZINC_FRAMES=2 ZINC_SHOT="$tmp/sized.png" "$ZINC" run "$tmp/sized" --engine quickjs >/dev/null 2>&1
file "$tmp/sized.png" 2>/dev/null | grep -q '200 x 100' || { echo "zinc.json's window size does not reach a quickjs run"; fail=1; }
# zinc:osc on quickjs (examples/video/mapper): its host rows are installed and the loop's events reach its handler (a message sent to itself)
port=$(python3 -c "import socket;s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.bind(('127.0.0.1',0));print(s.getsockname()[1]);s.close()")
cat > "$tmp/osc.js" <<EOF
import { listen, send, close } from 'zinc:osc';
let done = false, turns = 0;
listen($port, (m) => { console.log('osc', m.address, m.numbers.join(','), m.strings.join(',')); close(); done = true; });
send('127.0.0.1', $port, '/ping', [1, 2.5], ['hi']);
const tick = () => { if (done) return; if (++turns < 2000) setTimeout(tick, 1); else console.log('no message'); };
tick();
EOF
ZINC_HEADLESS=1 timeout 30 "$ZINC" run "$tmp/osc.js" --engine quickjs 2>&1 | grep -q "^osc /ping 1,2.5 hi$" || { echo "zinc:osc does not deliver a message on quickjs"; fail=1; }
# zinc:os rows appended after the host block (networkInterfaces, uid, shell) are installed on quickjs (zinc:sonos finds its callback address so)
printf "import { networkInterfaces, userInfo, cpus } from 'zinc:os';\nconst lo = networkInterfaces().filter((n) => n.address === '127.0.0.1');\nconsole.log('os', lo.length, lo.length > 0 ? lo[0].internal : '', userInfo().uid >= 0, cpus()[0].model !== '');\n" > "$tmp/os.js"
[ "$("$ZINC" run "$tmp/os.js" --engine quickjs 2>/dev/null)" = "os 1 true true true" ] || { echo "zinc:os networkInterfaces does not run on quickjs: $("$ZINC" run "$tmp/os.js" --engine quickjs 2>&1 | tail -1)"; fail=1; }
# a zinc:process child started once a net.fetch settled reports its end (QuickJS polled the native modules before the host events that
# spawned it, and ended the program silently with status 0), on the three engines
closed=$(python3 -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1]);s.close()")
cat > "$tmp/pf.ts" <<EOF
import * as net from 'zinc:net';
import * as proc from 'zinc:process';
async function main(): Promise<void> {
  try { await net.fetch('http://127.0.0.1:$closed/'); } catch (e) { console.log('fetch failed'); }
  const r = await proc.run('echo', ['hi'], {});
  console.log('done', r.code, r.stdout.trim());
}
main();
EOF
for eng in --interp --native "--engine quickjs"; do
  # shellcheck disable=SC2086
  [ "$(ZINC_HEADLESS=1 timeout 30 "$ZINC" run "$tmp/pf.ts" $eng 2>/dev/null | tail -1)" = "done 0 hi" ] || { echo "a process started after a fetch does not report its end ($eng)"; fail=1; }
done
exit $fail
