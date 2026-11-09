#!/bin/sh
# All run engines use project cwd; standalone files keep the caller cwd.
set -eu
cd "$(dirname "$0")/../.."
ZINC=$(cd "$(dirname "$ZINC")" && pwd -P)/$(basename "$ZINC")
tmp=$(mktemp -d); tmp=$(cd "$tmp" && pwd -P); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/project/src" "$tmp/caller" "$tmp/standalone" "$tmp/missing"
cat >"$tmp/project/src/main.ts" <<'TS'
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { message } from './message';
if (sys.cwd() !== sys.env('EXPECT_CWD')) throw new Error('cwd: ' + sys.cwd());
if (sys.launchDir() !== sys.env('EXPECT_LAUNCH')) throw new Error('launchDir: ' + sys.launchDir());
if (fs.readText('marker.txt').trim() !== message) throw new Error('relative file or module');
if (sys.env('EXPECT_SCOPED') === '1') {
  let denied = false;
  try { fs.readText('../caller/marker.txt'); } catch { denied = true; }
  if (!denied) throw new Error('project permission escaped');
}
console.log('project cwd: pass');
TS
printf "export const message = 'marker';\n" >"$tmp/project/src/message.ts"
cp "$tmp/project/src/"*.ts "$tmp/standalone/"
printf 'marker\n' >"$tmp/project/marker.txt"
printf 'marker\n' >"$tmp/caller/marker.txt"
printf '%s\n' '{"name":"project-cwd","entry":"src/main.ts","requires":["fs"],"permissions":["fs:read:."]}' >"$tmp/project/zinc.json"
for engine in --interp --native '--engine quickjs'; do
  for entry in "$tmp/project" ../project/src/main.ts ../standalone/main.ts; do
    expected="$tmp/project"; scoped=1; case "$entry" in *standalone*) expected="$tmp/caller"; scoped=0;; esac
    # shellcheck disable=SC2086
    if ! (cd "$tmp/caller" && unset ZINC_LAUNCH_DIR && EXPECT_SCOPED="$scoped" EXPECT_CWD="$expected" EXPECT_LAUNCH="$tmp/caller" ZINC_HEADLESS=1 ZINC_PERMISSIONS=enforce timeout 45 "$ZINC" run "$entry" $engine) >"$tmp/log" 2>&1; then cat "$tmp/log"; exit 1; fi
    grep -q '^project cwd: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  done
  for missing in ../missing ../absent ../absent.ts; do
    # shellcheck disable=SC2086
    if (cd "$tmp/caller" && ZINC_HEADLESS=1 timeout 15 "$ZINC" run "$missing" $engine) >"$tmp/missing" 2>&1; then echo "missing entry accepted: $engine $missing"; exit 1; fi
  done
  [ "$(cat "$tmp/project/marker.txt")" = marker ] && [ "$(cat "$tmp/caller/marker.txt")" = marker ]
done
