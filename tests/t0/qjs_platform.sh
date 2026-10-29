#!/bin/sh
# zinc:platform on QuickJS has the capability constants of targets/capabilities.json, as on the interpreter (it read them from lib/targets,
# which does not exist, and had only TARGET, PROFILE and the screen).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/t.ts" <<'TS'
import { TARGET, POWER, NET, CAMERA } from 'zinc:platform';
console.log(TARGET, POWER, NET, CAMERA);
TS
want=$(ZINC_HEADLESS=1 "$ZINC" run "$tmp/t.ts" --interp 2>&1)
got=$(ZINC_HEADLESS=1 "$ZINC" run "$tmp/t.ts" --engine quickjs 2>&1)
[ -n "$want" ] && [ "$got" = "$want" ] || { echo "qjs_platform: quickjs '$got', interpreter '$want'"; exit 1; }
echo "qjs_platform: ok"
