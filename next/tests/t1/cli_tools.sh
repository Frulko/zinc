#!/bin/sh
# CLI tools (ZN-140): capture, bench, tsconfig, infer, export and deploy on a project made by zinc init.
cd "$(dirname "$0")/../.." || exit 2
Z="$ZINC"; case "$Z" in /*) ;; *) Z="$PWD/$Z" ;; esac
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
fail=0
cd "$t" || exit 2
"$Z" init g --template game >/dev/null || exit 2
cd g || exit 2
# capture: two numbered PNG files
"$Z" capture --frames 2,5 --out shots --size 64x48 >/dev/null || { echo "capture failed"; fail=1; }
for n in 2 5; do [ "$(head -c 4 shots/frame-$n.png 2>/dev/null | tail -c 3)" = "PNG" ] || { echo "capture wrote no PNG for frame $n"; fail=1; }; done
"$Z" capture --bogus >/dev/null 2>&1; [ $? -eq 2 ] || { echo "capture with an unknown option must exit 2"; fail=1; }
# bench: the profile lines
"$Z" bench --frames 30 2>/dev/null | grep -q '^zinc profile: frames=30 work p50=' || { echo "bench printed no profile"; fail=1; }
# tsconfig
"$Z" tsconfig . >/dev/null && grep -q '"noLib": true' tsconfig.json && grep -q 'gfx.d.ts' tsconfig.json || { echo "tsconfig is wrong"; fail=1; }
# infer: a typed program has no site, an untyped parameter is one
"$Z" infer 2>&1 | grep -q '^0 site(s)' || { echo "infer on a typed program"; fail=1; }
printf 'function f(a, b) { return a + b; }\nconsole.log(f(1, 2));\n' > src/loose.js
"$Z" infer src/loose.js 2>&1 | grep -q 'Z0109' || { echo "infer found no untyped parameter"; fail=1; }
# deploy --print: the three commands, nothing run
out=$("$Z" deploy --target rpi --device pi@raspberrypi.local --print)
[ "$(echo "$out" | sed -n 1p)" = "ssh 'pi@raspberrypi.local' 'mkdir -p ~/g'" ] && echo "$out" | sed -n 2p | grep -q "^scp -r '.*/dist/g-rpi/\.' 'pi@raspberrypi.local:~/g/'$" && [ "$(echo "$out" | sed -n 3p)" = "ssh 'pi@raspberrypi.local' 'cd ~/g && ./run.sh'" ] || { echo "deploy --print: $out"; fail=1; }
[ ! -d dist ] || { echo "deploy --print must not build"; fail=1; }
"$Z" deploy --target rpi >/dev/null 2>&1; [ $? -eq 2 ] || { echo "deploy without --device must exit 2"; fail=1; }
# export: the executable, run.sh, README
"$Z" export >/dev/null 2>&1 || { echo "export failed"; fail=1; }
d=$(ls -d dist/g-* 2>/dev/null | head -1)
[ -x "$d/g" ] && [ -x "$d/run.sh" ] && [ -f "$d/README.txt" ] || { echo "export left no package in $d"; fail=1; }
[ $fail -eq 0 ] && echo "cli_tools: ok"
exit $fail
