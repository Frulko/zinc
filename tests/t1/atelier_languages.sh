#!/bin/sh
# Zinc Atelier in five languages (ZN-774.06, D159): one scripted run starts in German (ZINC_LANG=de), then Tools > Language switches it to
# English, French, Spanish and Italian. In each language the start view (the texts its frame draws, from a scene dump) and the desktop
# menu (the menu bar the recording simulator logs) show no English left: a text the English frame and menu also show is allowed only when
# it is that language's own word for it in i18n/<lang>/atelier.json (Animation, Interface...), the brand and the language names.
# The switch is saved for the next start: `lang` in $ZINC_HOME/config.json, with the other keys of that file kept.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/home"; printf '{"welcomed":true}\n' > "$tmp/home/config.json"
for d in toolchains cache index sysroots; do [ -e "${ZINC_HOME:-$HOME/.zinc}/$d" ] && ln -s "${ZINC_HOME:-$HOME/.zinc}/$d" "$tmp/home/$d"; done   # its own config.json, the same toolchains and caches
printf '4 lang:en\n7 lang:fr\n10 lang:es\n13 lang:it\n16 quit\n' > "$tmp/session"
ZINC_LANG=de ZINC_HOME="$tmp/home" ZINC_ATELIER_HOME="$tmp/book" ZINC_ATELIER_SYNC=1 ZINC_SYSTEM_LOG="$tmp/system" ZINC_ATELIER_SCRIPT="$tmp/session" \
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=16 ZINC_SCALE=1 ZINC_SHOT_FRAMES=3,6,9,12,15 ZINC_SCENE_DUMP="$tmp/scene" ZINC_SHOT="$tmp/start.png" \
  "$ZINC" run app/atelier >"$tmp/out" 2>"$tmp/err" || { echo "atelier languages: the session failed: $(tail -c 300 "$tmp/err")"; exit 1; }
[ -n "$ATELIER_KEEP" ] && cp "$tmp"/start-*.png "$ATELIER_KEEP"   # the five start views, to look at them
grep -q '"lang":"it"' "$tmp/home/config.json" && grep -q '"welcomed":true' "$tmp/home/config.json" \
  || { echo "atelier languages: the language is not saved in config.json with its other keys: $(cat "$tmp/home/config.json")"; fail=1; }
python3 - "$tmp" <<'EOF' || fail=1
import json, re, subprocess, sys
tmp = sys.argv[1]
order = [('de', 3), ('en', 6), ('fr', 9), ('es', 12), ('it', 15)]
# the last menu bar set in each language (its checked item of Tools > Language): a switch may set it twice, the lessons' titles coming after
bars = {}
for l in open(tmp + '/system'):
    m = re.search(r'"id":"lang:(\w+)","type":"radio","checked":true', l) if 'menu.setApp' in l else None
    if m: bars[m.group(1)] = l
if len(bars) < 5: print('atelier languages: menu bars logged in %s, 5 languages expected' % sorted(bars)); sys.exit(1)
seen = {}
for lang, frame in order:
    bar = bars[lang]
    texts = set(re.findall(r'"label":"((?:[^"\\]|\\.)*)"', bar))
    dump = subprocess.run(['python3', 'tools/scene-texts', '%s/scene-%d' % (tmp, frame)], capture_output=True, text=True).stdout
    seen[lang] = (texts, set(l for l in dump.split('\n') if l.strip()))
names = set(json.load(open('i18n/%s/atelier.json' % l))['atelier.language.name'] for l, _ in order)
bad = 0
for lang, _ in order:
    if lang == 'en': continue
    own = set(json.load(open('i18n/%s/atelier.json' % lang)).values())
    for part, i in (('menu', 0), ('start view', 1)):
        if not seen[lang][i]: print('atelier languages: %s: the %s shows nothing' % (lang, part)); bad += 1
        left = sorted(t for t in seen[lang][i] & seen['en'][i] if re.search('[^\W\d_]{2}', t) and t not in own and t not in names and t != 'Zinc Atelier')   # key hints (⌘T) are no words
        if left: print('atelier languages: %s: English left in the %s: %s' % (lang, part, ', '.join(left[:8]))); bad += 1
sys.exit(1 if bad else 0)
EOF
exit $fail
