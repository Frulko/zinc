#!/bin/sh
# zinc:ui/kit stays lean as it grows (ZN-1078.03, docs/ui-kit.md "What a component costs"): a program pays for the components it uses, not
# for the families it never names. One Button imported from 'zinc:ui/kit' (the index, every family loaded) against the same Button imported
# from its own file: the difference is what the unused families cost, bounded per family, in the AOT binary (zinc build) and in the QuickJS
# bundle (zinc bundle --minify, when the pinned esbuild is in ZINC_HOME). Ten components are built too, for the cost of one more. And the kit's
# modules run no code when they load: no call or registration at the top level (the theme and its schemes are made at the first read).
# About 20 s: three AOT builds.
cd "$(dirname "$0")/../.." || exit 2
root=$(pwd -P)
fail=0
tmp=$(cd "$(mktemp -d)" && pwd -P); trap 'rm -rf "$tmp"' EXIT
AOT_PER_FAMILY=4096   # bytes an unused family may add to the binary (class layouts and names the program never reaches)
JS_PER_FAMILY=256     # the same in the minified bundle
AOT_PER_COMPONENT=65536 JS_PER_COMPONENT=4096   # one more component used, on average over nine

# 1. no top-level side effects: a module-level statement that is not a declaration, or a const/let whose value is a call (an empty Map or Set is not)
python3 -I - "$root"/lib/std/kit/*.ts "$root"/lib/std/kit/*.tsx > "$tmp/effects" <<'PY'
import sys, re
decl = re.compile(r'^(import|export\s+(\{|\*|type|interface|default\s+function|function|async\s+function|class|abstract|enum|declare)|function|async\s+function|class|interface|type|enum|declare|//|/\*|\*|\}|\]|\)|$)')
var = re.compile(r'^(export\s+)?(const|let|var)\s+[\w$]+\s*(:[^=]+)?(=\s*(.*))?$')
strip = lambda s: re.sub(r"'(\\.|[^'\\])*'|\"(\\.|[^\"\\])*\"|`(\\.|[^`\\])*`|//.*$", "''", s)
for p in sys.argv[1:]:
    depth = 0
    for n, line in enumerate(open(p), 1):
        s = line.rstrip('\n'); code = strip(s)
        if depth == 0 and s and not s[0].isspace():
            m = var.match(code)
            if m:
                init = (m.group(5) or '').strip()
                if re.match(r'^(new\s|[\w$.]+\s*(<[^>]*>)?\s*\()', init) and not re.match(r'^new (Map|Set|WeakMap)\b[^(]*\(\)', init): print(f'{p.split("/lib/")[1]}:{n}: {s[:120]}')
            elif not decl.match(s): print(f'{p.split("/lib/")[1]}:{n}: {s[:120]}')
        depth = max(0, depth + sum(code.count(c) for c in '{([') - sum(code.count(c) for c in '})]'))
PY
[ -s "$tmp/effects" ] && { echo "the kit runs code when it loads (make it lazy, docs/ui-kit.md):"; cat "$tmp/effects"; fail=1; }

# 2. the programs: Button through the index, Button from its file, ten components through the index
up=$(echo "$tmp" | sed 's|/[^/]*|../|g')
families=$(grep -c "^export .* from '\./" lib/std/kit/index.ts)
app() {   # app <file> <import specifier> <names> <jsx>
  printf "import { render, createSignal } from 'zinc:ui/solid';\nimport { %s } from '%s';\nconst [on, setOn] = createSignal(true);\nconst [n, setN] = createSignal(40);\nconst [tab, setTab] = createSignal(0);\nconst App = () => <View>%s</View>;\nrender(App, 0xffffff, (dt: number) => {});\n" "$3" "$2" "$4" > "$tmp/$1.tsx"
}
app direct "${up}${root#/}/lib/std/kit/button" Button '<Button label="Go" />'
app one zinc:ui/kit Button '<Button label="Go" />'
app ten zinc:ui/kit 'Button, Card, Input, Switch, Badge, Tabs, Slider, Progress, Alert, Avatar' \
  "<Button label=\"Go\" /><Card><Input placeholder=\"Name\" /></Card><Switch checked={on} onChange={setOn} /><Badge label=\"New\" /><Tabs items={['One', 'Two']} selected={tab} onSelect={setTab} /><Slider value={n} onChange={setN} /><Progress value={n} /><Alert title=\"Saved\" /><Avatar name=\"Ada Lovelace\" />"
size() { wc -c < "$1" | tr -d ' '; }
gate() {   # gate <what> <direct> <one> <ten> <per family> <per component>
  extra=$(($3 - $2)); budget=$(($5 * (families - 1))); each=$((($4 - $3) / 9))
  echo "$1: Button $2 B, through the index $3 B (+$extra for $((families - 1)) unused families, budget $budget), ten $4 B (+$each per component)"
  [ "$extra" -le "$budget" ] || { echo "$1: the unused families add $extra bytes, more than $budget"; fail=1; }
  [ "$each" -le "$6" ] || { echo "$1: one more component costs $each bytes, more than $6"; fail=1; }
}

# 3. the QuickJS bundle
if ZINC_OFFLINE=1 "$ZINC" toolchain esbuild >/dev/null 2>&1; then
  bundled=1
  for p in direct one ten; do "$ZINC" bundle "$tmp/$p.tsx" -o "$tmp/js/$p.js" --minify > "$tmp/$p.blog" 2>&1 || { echo "zinc bundle $p failed: $(tail -3 "$tmp/$p.blog")"; fail=1; bundled=0; }; done
  [ $bundled -eq 1 ] && gate bundle "$(size "$tmp/js/direct.js")" "$(size "$tmp/js/one.js")" "$(size "$tmp/js/ten.js")" $JS_PER_FAMILY $JS_PER_COMPONENT
else
  echo "skip the bundle: no esbuild in ZINC_HOME (zinc toolchain esbuild fetches it)"
fi

# 4. the AOT binary
built=1
mkdir -p "$tmp/bin"
for p in direct one ten; do ZINC_STEPS=1 "$ZINC" build "$tmp/$p.tsx" -o "$tmp/bin/$p" > "$tmp/$p.log" 2>&1 || { echo "zinc build $p failed: $(tail -3 "$tmp/$p.log")"; fail=1; built=0; }; done
[ $built -eq 1 ] && gate aot "$(size "$tmp/bin/direct")" "$(size "$tmp/bin/one")" "$(size "$tmp/bin/ten")" $AOT_PER_FAMILY $AOT_PER_COMPONENT
grep -h "zinc: plugins:" "$tmp/one.log" | sed "s/^zinc: plugins:/aot, Button through the index links the plugins:/"
exit $fail
