#!/bin/sh
# examples/ipod's Discover page (services/discover.ts, pages/discover) on the fake iPod and history of tests/data/ipod-online, Last.fm's
# side served by its stub. The session: Discover from the sidebar (frame 50: Cassius first, because of Daft Punk and Air, then Stardust and
# Phoenix; Justice, on the iPod, left out; Missing Band in "not on this iPod"), Cassius clicked (frame 100: its top albums and songs from
# the stub). Checked: the texts, the two Last.fm calls (and a second visit answered from the cache), the frames against
# tests/golden/ipod-demo/discover.txt. KEEP=dir keeps the shots. UPDATE=1 rewrites the golden.
cd "$(dirname "$0")/../.." || exit 2
. tests/data/ipod-online/setup.sh
gold=$root/tests/golden/ipod-demo/discover.txt
printf '31 move 60 206\n32 down\n33 up\n61 move 700 194\n62 down\n63 up\n' > session.input
app page 50,100 "$tmp/session.input"
for t in 'Discover' 'Cassius' 'because you listen to Daft Punk and Air' 'Stardust' 'because you listen to Air' 'In your history, not on this iPod' 'Missing Band' '8 listens'; do says page 50 "$t"; done
python3 "$root/tools/scene-texts" "$tmp/page-scene-50" | grep -qx 'Justice' && { echo "ipod_discover: Justice, on the iPod, is listed"; fail=1; }
order=$(python3 "$root/tools/scene-texts" "$tmp/page-scene-50" | grep -x 'Cassius\|Stardust\|Phoenix' | tr '\n' ' ')
[ "$order" = 'Cassius Stardust Phoenix ' ] || { echo "ipod_discover: the order: $order"; fail=1; }
for t in 'Top albums' 'Feeling for You' 'Au Reve' 'Top songs' 'The Sound of Violence' 'Bandcamp' 'MusicBrainz' 'Last.fm'; do says page 100 "$t"; done
[ "$(grep -c '"artist.gettop' requests.jsonl)" = 2 ] || { echo "ipod_discover: Last.fm calls: $(cat requests.jsonl)"; fail=1; }
app again 100 "$tmp/session.input"
says again 100 'Feeling for You'
[ "$(grep -c '"artist.gettop' requests.jsonl)" = 2 ] || { echo "ipod_discover: the second visit asked Last.fm again"; fail=1; }
for f in 50 100; do echo "$f $(hash_at page $f)"; done > discover.txt
[ -n "$UPDATE" ] && cp discover.txt "$gold"
cmp -s discover.txt "$gold" || { echo "ipod_discover: frames $(tr '\n' ' ' < discover.txt), recorded $(tr '\n' ' ' < "$gold" 2>/dev/null)"; fail=1; }
[ $fail -eq 0 ] && echo "ipod_discover: ok"
exit $fail
