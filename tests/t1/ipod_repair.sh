#!/bin/sh
# examples/ipod's Repair page (repair.ts, services/musicbrainz.ts, pages/repair) on the fake iPod of tests/data/ipod-online, MusicBrainz,
# the Cover Art Archive and Last.fm served by its stub. The session: Allow changes, Repair from the sidebar (frame 60: four sections, the
# Moon Safari rows waiting for a look), Look for problems (frame 200: the release's cover, "Year 1998 · Genre Electronic", "Daft punk ->
# Daft Punk (Last.fm)", Genesis twice as a duplicate), then Fix all on Spellings, Years and genres and Covers (frame 420: the three
# sections empty, the duplicate left: a merge asks first). Checked: the texts, the iPod's database after (Air's songs with a cover, 1998
# and Electronic; Aerodynamic by Daft Punk; both Genesis kept), MusicBrainz asked with the app's User-Agent alone (its one request a second is kept on the app's clock, which ZINC_DETERMINISTIC makes virtual: not measured here), the frames
# against tests/golden/ipod-demo/repair.txt. KEEP=dir keeps the shots. UPDATE=1 rewrites the golden.
cd "$(dirname "$0")/../.." || exit 2
. tests/data/ipod-online/setup.sh
gold=$root/tests/golden/ipod-demo/repair.txt
click() { printf '%s move %s %s\n%s down\n%s up\n' "$1" "$2" "$3" $(($1 + 1)) $(($1 + 2)); }
{ click 21 196 107; click 31 60 700; click 51 1064 131; click 201 1080 491; click 261 1080 347; click 321 1080 203; } > session.input
app page 60,200,420 "$tmp/session.input"
for t in 'Repair my library' 'Covers · 1' 'Moon Safari' 'Look for problems to find a fix' 'Spellings · 1' 'Daft Punk (1), Daft punk (1)'; do says page 60 "$t"; done
for t in 'Fix: the front cover of the release on MusicBrainz' 'Fix: Year 1998 · Genre Electronic' 'Fix: Daft punk → Daft Punk (Last.fm)' 'Duplicates · 1' 'Genesis — Justice' 'Fix all 1'; do says page 200 "$t"; done
for t in 'Every album has a cover.' 'Every song has a year and a genre.' 'Every artist is written one way.' 'Duplicates · 1'; do says page 420 "$t"; done
cat > want <<'OUT'
Aerodynamic | Daft Punk |  | 2001 | Electronic | true | false
Genesis | Justice |  | 2007 | Electronic | true | false
Genesis | Justice |  | 2007 | Electronic | true | false
La Femme d'Argent | Air |  | 1998 | Electronic | true | false
One More Time | Daft Punk |  | 2001 | Electronic | true | false
Plain Song | Lyric Band |  | 2020 | Pop | true | false
Sexy Boy | Air |  | 1998 | Electronic | true | false
Sing Along | Lyric Band |  | 2020 | Pop | true | false
OUT
podread > db.out
cmp -s db.out want || { echo "ipod_repair: the iPod's database: $(tr '\n' '|' < db.out)"; fail=1; }
python3 - "$tmp/requests.jsonl" > mb.out 2>&1 <<'PY' || { echo "ipod_repair: MusicBrainz: $(cat mb.out)"; fail=1; }
import json, sys
mb = [json.loads(l) for l in open(sys.argv[1]) if '/ws/2/' in l]
assert len(mb) == 2, 'asked %d times' % len(mb)
for r in mb:
    assert r['agent'].startswith('ZincIPod/') and 'zinc/0.1' not in r['agent'], 'User-Agent: ' + r['agent']
PY
for f in 60 200 420; do echo "$f $(hash_at page $f)"; done > repair.txt
[ -n "$UPDATE" ] && cp repair.txt "$gold"
cmp -s repair.txt "$gold" || { echo "ipod_repair: frames $(tr '\n' ' ' < repair.txt), recorded $(tr '\n' ' ' < "$gold" 2>/dev/null)"; fail=1; }
[ $fail -eq 0 ] && echo "ipod_repair: ok"
exit $fail
