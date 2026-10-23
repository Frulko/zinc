#!/bin/sh
# The distribution guide (ZN-327): every ```sh block of docs/guide/07-distribution.md and 08-security.md is run, in order, as one script in a
# scratch directory: the worked example, from `zinc new game-2d` to an itch.io page, a download page and an update channel. `zinc` is the engine
# under test; runs are headless (ZINC_HEADLESS, ZINC_FRAMES: `zinc run` and the fused game play 30 frames and exit) with their own storage.
# A ```json block after <!-- guide: zinc.json --> is merged into the project's zinc.json at that point: "<public= line of FILE>" becomes that
# key and update.url the file:// address of dist/updates (the stand-in for the upload). Outward steps are never run: the guide shows them as a
# --dry-run or as printed commands. Then what the guide promises is checked, and every `zinc ...` written in the two pages names a command
# of `zinc help` with flags and targets it documents. macOS only (codesign, the .app, the .dmg): 77 elsewhere.
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || { echo "guide_store: macOS only"; exit 77; }
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/bin" "$tmp/work" && ln -s "$Z" "$tmp/bin/zinc"
pages="docs/guide/07-distribution.md docs/guide/08-security.md"

cat > "$tmp/merge.py" <<'PY'
import json, os, re, sys
def subst(v):
    if isinstance(v, dict): return {k: subst(x) for k, x in v.items()}
    if isinstance(v, str):
        m = re.fullmatch(r'<public= line of (.+)>', v)
        if m: return next(l[7:].strip() for l in open(m.group(1)) if l.startswith('public='))
    return v
def merge(a, b):
    for k, v in b.items(): a[k] = merge(a.get(k, {}), v) if isinstance(v, dict) and isinstance(a.get(k), dict) else v
    return a
d = json.load(open('zinc.json'))
add = subst(json.load(open(sys.argv[1])))
if 'url' in add.get('update', {}): add['update']['url'] = 'file://' + os.getcwd() + '/dist/updates/'
json.dump(merge(d, add), open('zinc.json', 'w'), indent=2)
PY
# the pages' sh blocks as one script; the marked json blocks as merges
python3 - "$tmp" $pages > "$tmp/guide.sh" <<'PY' || exit 2
import sys
tmp, out, n = sys.argv[1], ['set -ex'], 0
for page in sys.argv[2:]:
    block, mark, prev = None, False, ''
    for line in open(page):
        s = line.rstrip('\n')
        if block is None and s.startswith('```'):
            block, body, mark = s[3:].strip(), [], prev.strip() == '<!-- guide: zinc.json -->'
        elif block is not None and s.startswith('```'):
            if block == 'sh': out += body
            elif block == 'json' and mark:
                n += 1; open('%s/merge-%d.json' % (tmp, n), 'w').write('\n'.join(body))
                out.append('python3 "%s/merge.py" "%s/merge-%d.json"' % (tmp, tmp, n))
            block = None
        elif block is not None: body.append(s)
        if s.strip(): prev = s
print('\n'.join(out))
PY
grep -q '^zinc new game-2d' "$tmp/guide.sh" || { echo "guide_store: the worked example was not found in the pages"; exit 1; }
(cd "$tmp/work" && env PATH="$tmp/bin:$PATH" ZINC_HEADLESS=1 ZINC_FRAMES=30 ZINC_STORAGE="$tmp/storage" sh "$tmp/guide.sh") > "$tmp/log" 2>&1 ||
  { echo "guide_store: a command of the guide failed:"; grep '^+ ' "$tmp/log" | tail -1; tail -15 "$tmp/log"; exit 1; }

# what the guide says each step leaves behind
g="$tmp/work/my-game"
for f in build/my-game.zapp dist/my-game-macos/my-game.app dist/my-game-macos/my-game.sig dist/my-game-0.1.0.dmg dist/my-game-0.1.0.dmg.sig \
         dist/my-game-macos/sbom.spdx.json site/index.html site/SHA256SUMS dist/updates/my-game-0.1.0.zapp dist/updates/stable.manifest; do
  [ -e "$g/$f" ] || { echo "guide_store: no $f"; fail=1; }
done
[ -x "$g/build/my-game" ] || { echo "guide_store: no fused executable"; fail=1; }
grep -q '^1 test file(s), 0 failure(s)' "$tmp/log" || { echo "guide_store: zinc test did not pass the template's tests"; fail=1; }
grep -q '^permissions: none (every checked call is refused)' "$tmp/log" || { echo "guide_store: the export does not print the empty permission list"; fail=1; }
grep -q "push '[^']*/dist/my-game-macos' 'you/my-game:mac' --userversion '0.1.0'" "$tmp/log" && [ "$(grep -c "' push '" "$tmp/log")" = 1 ] &&
  grep -q '^dry run: nothing was uploaded' "$tmp/log" || { echo "guide_store: the itch.io dry run differs from the guide: $(grep -i 'push\|dry run' "$tmp/log")"; fail=1; }
for f in my-game-macos.tar.gz my-game-0.1.0.dmg my-game.zapp; do grep -q "href=\"$f\"" "$g/site/index.html" || { echo "guide_store: the download page lacks $f"; fail=1; }; done
grep -q '^my-game 0.1.0 is up to date' "$tmp/log" || { echo "guide_store: zinc update-app --check did not read the published channel"; fail=1; }

# every `zinc ...` written in the pages: a real command, with flags and targets its help documents
python3 - "$Z" $pages <<'PY' || fail=1
import re, subprocess, sys
z, pages = sys.argv[1], sys.argv[2:]
top = subprocess.run([z, 'help', '--all'], capture_output=True, text=True, check=True).stdout
cmds = set(re.findall(r'^  ([a-z][a-z-]*) ', top, re.M))
assert cmds, 'zinc help --all lists no commands'
helps = {}
def help_of(c):
    if c not in helps: helps[c] = subprocess.run([z, 'help', c], capture_output=True, text=True).stdout
    return helps[c]
targets = set(re.findall(r'--target ([a-z0-9|-]+)', help_of('export'))[0].split('|'))
bad = 0
for page in pages:
    code = False
    for n, line in enumerate(open(page), 1):
        if line.startswith('```'): code = not code; continue
        spans = [line.split(' # ')[0]] if code else re.findall(r'`([^`]+)`', line)
        for span in spans:
            t = re.sub(r'^(\$ |[A-Z_]+=\S+ )+', '', span.strip()).split()
            if len(t) < 2 or t[0] != 'zinc' or t[1][0] in '<[-': continue
            def fault(why):
                global bad; bad = 1; print('guide_store: %s:%d: `%s`: %s' % (page.split('/')[-1], n, span.strip(), why))
            for c in t[1].split('/'):
                if c not in cmds: fault('no command %s' % c)
            text = ' '.join(help_of(c) for c in t[1].split('/'))
            for i, tok in enumerate(t[2:], 2):
                f = tok.strip('[]()",').split('=')[0]
                if not re.fullmatch(r'--?[a-z][a-z-]*', f): continue
                if text and not re.search(r'(^|[\s\[(|,])' + re.escape(f) + r'\b', text): fault('zinc help %s does not document %s' % (t[1], f))
                if f == '--target' and i + 1 < len(t):
                    for v in t[i + 1].strip('[]').split('|'):
                        if v and v[0] != '<' and not v.isupper() and v not in targets: fault('no target %s' % v)
sys.exit(bad)
PY
[ $fail -eq 0 ] && echo "guide_store: ok ($(grep -c '^+ zinc' "$tmp/log") zinc commands of the guide run)"
exit $fail
