#!/bin/sh
# Exercise runtime cache reuse through the real cross-build path, without compiling ARM code.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat >"$tmp/zig" <<'PY'
#!/usr/bin/env python3
import json, os, pathlib, sys
with open(os.environ['TC_CACHE_LOG'], 'a') as log:
    log.write(json.dumps(sys.argv[1:]) + '\n')
pathlib.Path(sys.argv[sys.argv.index('-o') + 1]).touch()
PY
chmod +x "$tmp/zig"
printf 'console.log("cache");\n' >"$tmp/hello.ts"
ln -s "$PWD" "$tmp/root-one"
ln -s "$PWD" "$tmp/root-two"
export ZINC_HOME="$tmp/home" ZINC_ZIG="$tmp/zig" TC_CACHE_LOG="$tmp/commands"
for root in root-one root-one root-two; do
  ZINC_ROOT="$tmp/$root" "$ZINC" build --target armv7-linux "$tmp/hello.ts" -o "$tmp/hello" >"$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
done
python3 - "$tmp/commands" <<'PY'
import json, sys
calls = [json.loads(line) for line in open(sys.argv[1])]
builds = [[]]
for call in calls:
    assert '-mcpu=cortex_a8+neon' in call, call
    assert call[call.index('-target') + 1] == 'arm-linux-gnueabihf.2.28', call
    if '-c' in call:
        builds[-1].append(call[call.index('-o') + 1])
    else:
        builds.append([])
assert len(builds) == 4 and not builds[-1], builds
cold, warm, changed, _ = builds
assert cold and not warm, (cold, warm)
assert len(cold) == len(changed) and set(cold).isdisjoint(changed), (cold, changed)
print(f'cross runtime cache: {len(cold)} cold compiles, 0 warm, {len(changed)} after flags change')
PY
