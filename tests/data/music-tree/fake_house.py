# A made-up house for headless runs of examples/music-tree (tests/t1/music_tree_sonos.sh): Sonos speakers (UPnP SOAP, reached at 127.0.0.1:<port>)
# and the Spotify Web API (/v1, the test's stub client calls it). usage: fake_house.py <port> <log>
# Four groups, five rooms; the groups are paused until a Play. Spotify plays "Chanson du Mac" (album al1, 61 s in) on a Mac. Every
# Sonos command (not a Get) and every Spotify request that is not a GET is written to <log>, one line each.
import http.server, html, json, re, sys
PORT, LOG = int(sys.argv[1]), sys.argv[2]
ROOMS = [('RINCON_A', ['Salon', 'Cuisine']), ('RINCON_C', ['Bureau']), ('RINCON_D', ['Chambre']), ('RINCON_E', ['Atelier'])]
ZGS = '<ZoneGroups>' + ''.join(
  '<ZoneGroup Coordinator="%s" ID="%s:1">' % (c, c) + ''.join(
    '<ZoneGroupMember UUID="%s" Location="http://127.0.0.1:%d/xml/device_description.xml" ZoneName="%s"/>' % (c if i == 0 else c + str(i), PORT, n)
    for i, n in enumerate(names)) + '</ZoneGroup>' for c, names in ROOMS) + '</ZoneGroups>'
META = html.escape('<DIDL-Lite><item><dc:title>Le titre</dc:title><dc:creator>Un artiste</dc:creator><upnp:album>Album</upnp:album></item></DIDL-Lite>')
SERVICES = html.escape('<Services><Service Capabilities="0" Id="12" MaxMessagingChars="0" Name="Spotify" Version="1.1" Uri="x" SecureUri="x" ContainerType="MService"></Service></Services>')
STATE = ['PAUSED_PLAYBACK']
ANSWERS = {
  'GetZoneGroupState': '<ZoneGroupState>%s</ZoneGroupState>' % html.escape(ZGS),
  'GetPositionInfo': '<Track>1</Track><TrackDuration>0:03:00</TrackDuration><TrackMetaData>%s</TrackMetaData><TrackURI>x-file-cifs://song.mp3</TrackURI><RelTime>0:01:00</RelTime>' % META,
  'GetMediaInfo': '<NrTracks>1</NrTracks><CurrentURI>x-rincon-queue:RINCON_A#0</CurrentURI><CurrentURIMetaData></CurrentURIMetaData>',
  'GetCurrentTransportActions': '<Actions>Play, Stop, Pause, Next, Previous</Actions>',
  'GetTransportSettings': '<PlayMode>NORMAL</PlayMode>',
  'GetGroupVolume': '<CurrentVolume>30</CurrentVolume>', 'GetVolume': '<CurrentVolume>25</CurrentVolume>', 'GetMute': '<CurrentMute>0</CurrentMute>',
  'ListAvailableServices': '<AvailableServiceDescriptorList>%s</AvailableServiceDescriptorList>' % SERVICES,
}
MAC = {'id': 'mac1', 'name': 'MacBook de Test', 'type': 'Computer', 'is_restricted': False, 'is_active': True, 'volume_percent': 50}
SONG = {'id': 't1', 'name': 'Chanson du Mac', 'type': 'track', 'uri': 'spotify:track:t1', 'duration_ms': 187000,
        'artists': [{'id': 'ar1', 'name': 'Air', 'type': 'artist', 'uri': 'spotify:artist:ar1'}],
        'album': {'id': 'al1', 'name': 'Album 1', 'type': 'album', 'uri': 'spotify:album:al1', 'images': []}}
SPOTIFY = {
  '/v1/me': {'id': 'u1', 'display_name': 'Testeur'},
  '/v1/me/player': {'is_playing': True, 'shuffle_state': False, 'repeat_state': 'off', 'progress_ms': 61000, 'context': {'uri': 'spotify:album:al1'}, 'device': MAC, 'item': SONG},
  '/v1/me/player/devices': {'devices': [MAC]},
  '/v1/me/library/contains': [False],
}
def log(line): open(LOG, 'a').write(line + '\n')
class H(http.server.BaseHTTPRequestHandler):
    def reply(self, b):
        self.send_response(200); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def spotify(self):
        n = int(self.headers.get('Content-Length', 0)); self.rfile.read(n)
        if self.command != 'GET': log('spotify %s %s' % (self.command, self.path))
        j = SPOTIFY.get(self.path.split('?')[0]) if self.command == 'GET' else None
        if j is None: self.send_response(204); self.end_headers(); return
        self.reply(json.dumps(j).encode())
    def do_POST(self):
        if self.path.startswith('/v1/'): return self.spotify()
        n = int(self.headers.get('Content-Length', 0)); body = self.rfile.read(n).decode()
        action = self.headers.get('SOAPACTION', '').strip('"').split('#')[-1]
        if action == 'Play': STATE[0] = 'PLAYING'
        ans = '<CurrentTransportState>%s</CurrentTransportState>' % STATE[0] if action == 'GetTransportInfo' else ANSWERS.get(action, '')
        if not action.startswith('Get'):
            m = re.search(r'<(EnqueuedURI|CurrentURI|Target|ObjectID|NewPlayMode|DesiredVolume)>(.*?)</', body)
            log('sonos %s %s' % (action, html.unescape(m.group(2))[:90] if m else ''))
        self.reply(('<s:Envelope><s:Body><u:%sResponse>%s</u:%sResponse></s:Body></s:Envelope>' % (action, ans, action)).encode())
    do_GET = do_PUT = do_DELETE = spotify
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
