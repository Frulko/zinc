#!/bin/sh
# zinc:sonos against a made-up speaker (tests/data/sonos/stub_speaker.py --house: Salon with a hidden stereo partner, Bureau, on a free
# local port the plugin reaches as 127.0.0.1:<port>). tests/data/sonos/plugin.ts drives the SoCo-named calls and prints one line per check,
# compared with plugin.expected; the speaker's log proves the SOAP arguments and the GENA requests (SUBSCRIBE with CALLBACK, NT and
# TIMEOUT, renew with the SID, UNSUBSCRIBE) and that the program's own server answered every NOTIFY with 200. The interpreter runs it
# all; QuickJS runs the same program once and must print the same lines. No real speaker is contacted. KEEP=dir keeps the logs.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || exit 77
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
data=$(pwd)/tests/data/sonos
tmp=$(mktemp -d); srv=''
trap '[ -n "$srv" ] && { kill $srv; wait $srv; } 2>/dev/null; [ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/* "$KEEP/" 2>/dev/null; rm -rf "$tmp"' EXIT
port=$((20000 + ($$ + 33) % 20000))
fail=0
run() {   # run <engine flag>: a fresh speaker, the program, its lines against the expected ones
  name=$1; shift
  : > "$tmp/$name.log"
  python3 "$data/stub_speaker.py" $port "$tmp/$name.log" --house > "$tmp/$name.stub" 2>&1 & srv=$!
  for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null -X GET "http://127.0.0.1:$port/" && break; sleep 0.3; done
  SONOS_STUB=127.0.0.1:$port ZINC_HEADLESS=1 timeout 60 "$Z" run "$data/plugin.ts" "$@" > "$tmp/$name.out" 2> "$tmp/$name.err"
  sleep 0.3; kill $srv; wait $srv 2>/dev/null; srv=''
  diff "$data/plugin.expected" "$tmp/$name.out" > "$tmp/$name.diff" || { echo "sonos_plugin: $name printed: $(head -20 "$tmp/$name.diff" | tr '\n' ';') $(tail -3 "$tmp/$name.err")"; fail=1; }
}
run interp --interp
log=$tmp/interp.log
want() { grep -qE "$1" "$log" || { echo "sonos_plugin: the speaker's log has no $2: $(tr '\n' ';' < "$log" | cut -c1-900)"; fail=1; }; }
want '^AddURIToQueue http://127\.0\.0\.1:9/song1\.mp3 <DIDL-Lite.*<dc:title>Song 1</dc:title>.*<dc:creator>Band &amp; Co</dc:creator>' 'song queued with its DIDL'
want '^Next fault 701$' 'refused Next'
want '^Stop' 'Stop'
want '^SetPlayMode SHUFFLE_NOREPEAT$' 'shuffle'
want '^SetPlayMode SHUFFLE$' 'repeat all with shuffle'
want '^SetCrossfadeMode 1$' 'cross fade'
want '^SetGroupMute 1$' 'group mute'
want '^SetRelativeGroupVolume 5$' 'relative group volume'
want '^EndDirectControlSession' 'EndDirectControlSession'
want '^SetAVTransportURI x-rincon-mp3radio://radio\.example/live\.mp3 <DIDL-Lite.*<dc:title>Radio X</dc:title>.*audioBroadcast' 'forced radio with its title'
want '^SetAVTransportURI x-rincon:RINCON_A$' 'Bureau joining in party mode'
# the queue and the Sonos playlists (the stub refuses a saved queue's change with a stale UpdateID: the lines prove it was read first)
want '^AddMultipleURIsToQueue 16 http://127\.0\.0\.1:9/song1\.mp3 .* http://127\.0\.0\.1:9/song16\.mp3 <DIDL-Lite.*<dc:title>Song 1</dc:title>.*<dc:title>Song 16</dc:title>.*</DIDL-Lite> 0 0$' 'first chunk of 16 URIs'
want '^AddMultipleURIsToQueue 4 http://127\.0\.0\.1:9/song17\.mp3 .* 17 0$' 'second chunk after the first'
want '^AddMultipleURIsToQueue 2 .*song21\.mp3 .*song22\.mp3 .* 0 1$' 'URIs added as next'
want '^RemoveTrackRangeFromQueue 5 2$' 'range removed'
want '^ReorderTracksInQueue 1 1 4$' 'move of one entry'
want '^ReorderTracksInSavedQueue SQ:1 2 0$' 'move in a Sonos playlist'
want '^SaveQueue Saved$' 'queue saved as a playlist'
want '^DestroyObject SQ:2$' 'playlist deleted'
want '^NOTIFY /MediaServer/ContentDirectory/Event [1-9][0-9]* 200$' 'queue event answered'
for svc in /ZoneGroupTopology/Event /MediaRenderer/AVTransport/Event /MediaRenderer/GroupRenderingControl/Event /MediaRenderer/RenderingControl/Event /MediaServer/ContentDirectory/Event; do
  want "^SUBSCRIBE $svc <http://127\.0\.0\.1:[0-9]+/sonos-events> Second-2\$" "subscription to $svc"
  want "^RENEW $svc uuid:RINCON_A_sub[0-9]+ Second-2\$" "renewal of $svc"
  want "^UNSUBSCRIBE $svc uuid:RINCON_A_sub[0-9]+\$" "end of $svc"
  want "^NOTIFY $svc 0 200\$" "first event of $svc answered"
done
grep -E '^NOTIFY ' "$log" | grep -qv ' 200$' && { echo "sonos_plugin: a NOTIFY was not answered 200: $(grep -E '^NOTIFY ' "$log" | grep -v ' 200$' | head -3 | tr '\n' ';')"; fail=1; }
grep -q 'refused' "$log" && { echo "sonos_plugin: the speaker refused a subscription: $(grep refused "$log" | head -3 | tr '\n' ';')"; fail=1; }
run quickjs --engine quickjs
[ $fail = 0 ] && echo "sonos_plugin: ok"
exit $fail
