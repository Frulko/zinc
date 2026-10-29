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
run quickjs --engine quickjs
[ $fail = 0 ] && echo "sonos_plugin: ok"
exit $fail
