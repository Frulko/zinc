# A made-up Sonos speaker for tests/t1/ipod_sonos.sh: one group, "Salon" (RINCON_A), answering the UPnP SOAP calls zinc:sonos makes (the
# test points a copy of the plugin at this port). usage: fake_sonos.py <port> <log>
# Every command (not a Get) is written to <log> with its URI and metadata. On Play the speaker does what a real one does: it fetches the
# first song queued with a byte range (and its cover), and logs 'fetch <status> <Content-Range> <bytes as hex>' and 'cover <status> <type>'.
import http.server, html, re, sys, threading, urllib.request
PORT, LOG = int(sys.argv[1]), sys.argv[2]
ZGS = '<ZoneGroups><ZoneGroup Coordinator="RINCON_A" ID="RINCON_A:1"><ZoneGroupMember UUID="RINCON_A" Location="http://127.0.0.1:%d/xml/device_description.xml" ZoneName="Salon"/></ZoneGroup></ZoneGroups>' % PORT
QUEUE = []   # (uri, meta)
STATE = ['STOPPED']
def log(line): open(LOG, 'a').write(line + '\n')
def fetch(url, rng=None):
    req = urllib.request.Request(url, headers={'Range': rng} if rng else {})
    try:
        with urllib.request.urlopen(req, timeout=5) as r: return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e: return e.code, e.headers, b''
def speaker_fetches(song):
    uri, meta = song
    status, h, data = fetch(uri, 'bytes=0-3')
    log('fetch %d %s %s' % (status, h.get('Content-Range'), data.hex()))
    art = re.search(r'<upnp:albumArtURI>(.*?)</upnp:albumArtURI>', meta)
    if art:
        status, h, data = fetch(html.unescape(art.group(1)))
        log('cover %d %s %d' % (status, h.get('Content-Type'), len(data)))
    log('traversal %d' % fetch(re.sub(r'/file/[^/?]+', '/file/..%2F..%2FiPod_Control%2FDevice%2FSysInfo', uri))[0])
    log('no token %d' % fetch(re.sub(r'(:\d+/)[0-9a-f]+/', r'\1nottoken/', uri))[0])
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0))).decode()
        action = self.headers.get('SOAPACTION', '').strip('"').split('#')[-1]
        arg = lambda name: html.unescape((re.search(r'<%s>(.*?)</%s>' % (name, name), body, re.S) or [None, ''])[1])
        ans = ''
        if action == 'GetZoneGroupState': ans = '<ZoneGroupState>%s</ZoneGroupState>' % html.escape(ZGS)
        elif action == 'GetTransportInfo': ans = '<CurrentTransportState>%s</CurrentTransportState>' % STATE[0]
        elif action == 'GetPositionInfo':
            uri = QUEUE[0][0] if QUEUE else ''
            ans = '<Track>%d</Track><TrackDuration>0:00:02</TrackDuration><TrackMetaData>%s</TrackMetaData><TrackURI>%s</TrackURI><RelTime>0:00:01</RelTime>' % (
                1 if QUEUE else 0, html.escape(QUEUE[0][1]) if QUEUE else '', html.escape(uri))
        elif action == 'GetMediaInfo': ans = '<NrTracks>%d</NrTracks><CurrentURI>x-rincon-queue:RINCON_A#0</CurrentURI><CurrentURIMetaData></CurrentURIMetaData>' % len(QUEUE)
        elif action == 'GetCurrentTransportActions': ans = '<Actions>Play, Stop, Pause, Seek, Next, Previous</Actions>'
        elif action == 'GetTransportSettings': ans = '<PlayMode>NORMAL</PlayMode>'
        elif action == 'GetGroupVolume': ans = '<CurrentVolume>30</CurrentVolume>'
        elif action == 'RemoveAllTracksFromQueue': QUEUE.clear()
        elif action == 'AddURIToQueue':
            QUEUE.append((arg('EnqueuedURI'), arg('EnqueuedURIMetaData')))
            ans = '<FirstTrackNumberEnqueued>%d</FirstTrackNumberEnqueued><NumTracksAdded>1</NumTracksAdded><NewQueueLength>%d</NewQueueLength>' % (len(QUEUE), len(QUEUE))
        if not action.startswith('Get'):
            log('%s %s' % (action, ' '.join(x for x in (arg('EnqueuedURI'), arg('EnqueuedURIMetaData'), arg('CurrentURI'), arg('Unit'), arg('Target'), arg('DesiredVolume')) if x)))
        if action == 'Play':
            STATE[0] = 'PLAYING'
            if QUEUE: threading.Thread(target=speaker_fetches, args=(QUEUE[0],)).start()   # after the answer, as a speaker does
        elif action == 'Pause': STATE[0] = 'PAUSED_PLAYBACK'
        b = ('<s:Envelope><s:Body><u:%sResponse>%s</u:%sResponse></s:Body></s:Envelope>' % (action, ans, action)).encode()
        self.send_response(200); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
