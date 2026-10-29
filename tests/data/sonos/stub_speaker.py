# A made-up Sonos speaker for the tests of zinc:sonos (tests/t1/sonos_plugin.sh, ipod_sonos.sh, music_tree_sonos.sh never contacts one):
# the UPnP SOAP actions the plugin sends, and GENA events (SUBSCRIBE, renew, UNSUBSCRIBE, then NOTIFY to the subscriber's CALLBACK
# with the state, as a speaker does). The plugin reaches it as 127.0.0.1:<port> (Speaker.port, from the Location of the topology).
# usage: stub_speaker.py <port> <log> [--house] [--fetch]
#   --house  two rooms: Salon (RINCON_A, with a hidden stereo partner RINCON_A2) and Bureau (RINCON_B, its own group); else Salon alone
#   --fetch  on Play, fetch the first queued song with a byte range and its cover, as a real speaker does (examples/ipod)
# <log>: every command (not a Get) as '<Action> <args...>', the GENA requests as 'SUBSCRIBE <path> <callback> <timeout>',
# 'RENEW <path> <sid>', 'UNSUBSCRIBE <path> <sid>', and 'NOTIFY <path> <seq> <status>' for each event sent.
import http.server, html, re, sys, threading, urllib.request
PORT, LOG = int(sys.argv[1]), sys.argv[2]
HOUSE, FETCH = '--house' in sys.argv, '--fetch' in sys.argv
LOC = 'http://127.0.0.1:%d/xml/device_description.xml' % PORT
if HOUSE:
    ZGS = ('<ZoneGroupState><ZoneGroups><ZoneGroup Coordinator="RINCON_A" ID="RINCON_A:1">'
           '<ZoneGroupMember UUID="RINCON_A" Location="%s" ZoneName="Salon"/>'
           '<ZoneGroupMember UUID="RINCON_A2" Location="%s" ZoneName="Salon" Invisible="1"/></ZoneGroup>'
           '<ZoneGroup Coordinator="RINCON_B" ID="RINCON_B:2"><ZoneGroupMember UUID="RINCON_B" Location="%s" ZoneName="Bureau"/></ZoneGroup>'
           '</ZoneGroups><VanishedDevices/></ZoneGroupState>') % (LOC, LOC, LOC)
else:
    ZGS = '<ZoneGroups><ZoneGroup Coordinator="RINCON_A" ID="RINCON_A:1"><ZoneGroupMember UUID="RINCON_A" Location="%s" ZoneName="Salon"/></ZoneGroup></ZoneGroups>' % LOC
S = {'state': 'STOPPED', 'mode': 'NORMAL', 'fade': '0', 'gvol': 30, 'gmute': '0', 'vol': 20, 'mute': '0', 'uri': '', 'meta': '', 'track': 0}
QUEUE = []   # (uri, meta)
SUBS = {}    # sid -> [path, callback, seq]
NSUB = [0]
lock = threading.Lock()
def log(line):
    with lock: open(LOG, 'a').write(line + '\n')
esc = lambda s: html.escape(s, quote=True)

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

def current():
    n = S['track']
    return QUEUE[n - 1] if S['uri'].startswith('x-rincon-queue:') and 0 < n <= len(QUEUE) else (S['uri'], S['meta'])

# ---- events: what each service's NOTIFY says (the AVTransport and RenderingControl ones in a LastChange, as a speaker writes them)
def body(path):
    props = []
    if path.startswith('/MediaRenderer/AVTransport'):
        uri, meta = current()
        ev = ('<Event xmlns="urn:schemas-upnp-org:metadata-1-0/AVT/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/"><InstanceID val="0">'
              '<TransportState val="%s"/><CurrentPlayMode val="%s"/><CurrentCrossfadeMode val="%s"/><NumberOfTracks val="%d"/><CurrentTrack val="%d"/>'
              '<CurrentTrackURI val="%s"/><CurrentTrackDuration val="0:03:20"/><CurrentTrackMetaData val="%s"/>'
              '<AVTransportURI val="%s"/><AVTransportURIMetaData val="%s"/><CurrentTransportActions val="Play, Stop, Pause, Seek, Next, Previous"/>'
              '</InstanceID></Event>') % (S['state'], S['mode'], S['fade'], len(QUEUE), S['track'], esc(uri), esc(meta), esc(S['uri']), esc(S['meta']))
        props.append('<LastChange>%s</LastChange>' % esc(ev))
    elif path.startswith('/MediaRenderer/RenderingControl'):
        ev = ('<Event xmlns="urn:schemas-upnp-org:metadata-1-0/RCS/"><InstanceID val="0"><Volume channel="Master" val="%d"/><Volume channel="LF" val="100"/>'
              '<Mute channel="Master" val="%s"/><Bass val="0"/><Treble val="0"/><Loudness channel="Master" val="1"/></InstanceID></Event>') % (S['vol'], S['mute'])
        props.append('<LastChange>%s</LastChange>' % esc(ev))
    elif path.startswith('/MediaRenderer/GroupRenderingControl'):
        props += ['<GroupMute>%s</GroupMute>' % S['gmute'], '<GroupVolume>%d</GroupVolume>' % S['gvol'], '<GroupVolumeChangeable>1</GroupVolumeChangeable>']
    elif path.startswith('/ZoneGroupTopology'):
        props += ['<ZoneGroupState>%s</ZoneGroupState>' % esc(ZGS), '<ThirdPartyMediaServersX></ThirdPartyMediaServersX>']
    return ('<?xml version="1.0"?><e:propertyset xmlns:e="urn:schemas-upnp-org:event-1-0">%s</e:propertyset>'
            % ''.join('<e:property>%s</e:property>' % p for p in props)).encode()

def notify(sid):
    with lock:
        if sid not in SUBS: return
        path, cb, seq = SUBS[sid]; SUBS[sid][2] += 1
    data = body(path)
    req = urllib.request.Request(cb, data=data, method='NOTIFY', headers={'Content-Type': 'text/xml; charset="utf-8"', 'NT': 'upnp:event',
                                 'NTS': 'upnp:propchange', 'SID': sid, 'SEQ': str(seq)})
    try:
        with urllib.request.urlopen(req, timeout=5) as r: status = r.status
    except urllib.error.HTTPError as e: status = e.code
    except Exception as e: status = 'error ' + type(e).__name__
    log('NOTIFY %s %d %s' % (path, seq, status))
def changed(*prefixes):   # after the answer, as a speaker does
    for sid, (path, cb, seq) in list(SUBS.items()):
        if any(path.startswith(p) for p in prefixes): threading.Timer(0.05, notify, args=(sid,)).start()

class H(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def answer(self, status, b=b'', headers=()):
        self.send_response(status)
        for k, v in headers: self.send_header(k, v)
        self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_SUBSCRIBE(self):
        sid, cb, nt, timeout = self.headers.get('SID'), self.headers.get('CALLBACK', ''), self.headers.get('NT'), self.headers.get('TIMEOUT', '')
        if sid:   # a renewal: no CALLBACK, no NT
            if sid not in SUBS or cb or nt: log('RENEW refused %s' % sid); return self.answer(412)
            log('RENEW %s %s %s' % (self.path, sid, timeout)); return self.answer(200, headers=[('SID', sid), ('TIMEOUT', timeout or 'Second-1800')])
        if nt != 'upnp:event' or not cb.startswith('<http://'): log('SUBSCRIBE refused %s %s %s' % (self.path, cb, nt)); return self.answer(412)
        with lock:
            NSUB[0] += 1; sid = 'uuid:RINCON_A_sub%07d' % NSUB[0]
            SUBS[sid] = [self.path, cb[1:cb.index('>')], 0]
        log('SUBSCRIBE %s %s %s' % (self.path, cb, timeout))
        self.answer(200, headers=[('SID', sid), ('TIMEOUT', timeout or 'Second-1800'), ('Server', 'Linux UPnP/1.0 Sonos/80.1-55014 (ZPS1)')])
        threading.Timer(0.05, notify, args=(sid,)).start()   # the initial event: the whole state
    def do_UNSUBSCRIBE(self):
        sid = self.headers.get('SID')
        with lock: ok = SUBS.pop(sid, None) is not None
        log('UNSUBSCRIBE %s %s%s' % (self.path, sid, '' if ok else ' unknown'))
        self.answer(200 if ok else 412)
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0))).decode()
        action = self.headers.get('SOAPACTION', '').strip('"').split('#')[-1]
        arg = lambda name: html.unescape((re.search(r'<%s>(.*?)</%s>' % (name, name), body, re.S) or [None, ''])[1])
        ans, fault = '', 0
        if action == 'GetZoneGroupState': ans = '<ZoneGroupState>%s</ZoneGroupState>' % esc(ZGS)
        elif action == 'GetTransportInfo': ans = '<CurrentTransportState>%s</CurrentTransportState><CurrentTransportStatus>OK</CurrentTransportStatus><CurrentSpeed>1</CurrentSpeed>' % S['state']
        elif action == 'GetPositionInfo':
            uri, meta = current()
            ans = '<Track>%d</Track><TrackDuration>0:03:20</TrackDuration><TrackMetaData>%s</TrackMetaData><TrackURI>%s</TrackURI><RelTime>0:00:01</RelTime>' % (
                S['track'], esc(meta), esc(uri))
        elif action == 'GetMediaInfo': ans = '<NrTracks>%d</NrTracks><CurrentURI>%s</CurrentURI><CurrentURIMetaData>%s</CurrentURIMetaData>' % (len(QUEUE), esc(S['uri']), esc(S['meta']))
        elif action == 'GetCurrentTransportActions': ans = '<Actions>Play, Stop, Pause, Seek, Next, Previous</Actions>'
        elif action == 'GetTransportSettings': ans = '<PlayMode>%s</PlayMode><RecQualityMode>NOT_IMPLEMENTED</RecQualityMode>' % S['mode']
        elif action == 'GetCrossfadeMode': ans = '<CrossfadeMode>%s</CrossfadeMode>' % S['fade']
        elif action == 'GetGroupVolume': ans = '<CurrentVolume>%d</CurrentVolume>' % S['gvol']
        elif action == 'GetGroupMute': ans = '<CurrentMute>%s</CurrentMute>' % S['gmute']
        elif action == 'GetVolume': ans = '<CurrentVolume>%d</CurrentVolume>' % S['vol']
        elif action == 'GetMute': ans = '<CurrentMute>%s</CurrentMute>' % S['mute']
        elif action == 'RemoveAllTracksFromQueue': QUEUE.clear(); S['track'] = 0
        elif action == 'AddURIToQueue':
            QUEUE.append((arg('EnqueuedURI'), arg('EnqueuedURIMetaData')))
            ans = '<FirstTrackNumberEnqueued>%d</FirstTrackNumberEnqueued><NumTracksAdded>1</NumTracksAdded><NewQueueLength>%d</NewQueueLength>' % (len(QUEUE), len(QUEUE))
        elif action == 'SetAVTransportURI' and arg('CurrentURI').startswith('x-rincon:'): pass   # another room joins: one stub plays for all
        elif action == 'SetAVTransportURI': S['uri'], S['meta'] = arg('CurrentURI'), arg('CurrentURIMetaData'); S['track'] = 1 if QUEUE else 0
        elif action == 'Seek':
            if arg('Unit') == 'TRACK_NR':
                n = int(arg('Target') or 0)
                if not 0 < n <= len(QUEUE): fault = 711
                else: S['track'] = n
        elif action == 'Next':
            if S['track'] >= len(QUEUE): fault = 701   # no next track: a speaker refuses, without a description
            else: S['track'] += 1
        elif action == 'Previous': S['track'] = max(1, S['track'] - 1)
        elif action == 'Play': S['state'] = 'PLAYING'
        elif action == 'Pause': S['state'] = 'PAUSED_PLAYBACK'
        elif action == 'Stop': S['state'] = 'STOPPED'
        elif action == 'SetPlayMode': S['mode'] = arg('NewPlayMode')
        elif action == 'SetCrossfadeMode': S['fade'] = arg('CrossfadeMode')
        elif action == 'SetGroupVolume': S['gvol'] = int(arg('DesiredVolume'))
        elif action == 'SetRelativeGroupVolume':
            S['gvol'] = max(0, min(100, S['gvol'] + int(arg('Adjustment')))); ans = '<NewVolume>%d</NewVolume>' % S['gvol']
        elif action == 'SetGroupMute': S['gmute'] = arg('DesiredMute')
        elif action == 'SetVolume': S['vol'] = int(arg('DesiredVolume'))
        elif action == 'SetMute': S['mute'] = arg('DesiredMute')
        if not action.startswith('Get'):
            names = ('EnqueuedURI', 'EnqueuedURIMetaData', 'CurrentURI', 'CurrentURIMetaData', 'Unit', 'Target', 'DesiredVolume', 'NewPlayMode', 'CrossfadeMode', 'Adjustment', 'DesiredMute', 'Channel')
            log(' '.join([action] + [x for x in (arg(n) for n in names) if x] + (['fault %d' % fault] if fault else [])))
        if fault:
            b = ('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring>'
                 '<detail><UPnPError xmlns="urn:schemas-upnp-org:control-1-0"><errorCode>%d</errorCode></UPnPError></detail></s:Fault></s:Body></s:Envelope>' % fault).encode()
            return self.answer(500, b, [('Content-Type', 'text/xml')])
        if action == 'Play' and FETCH and QUEUE: threading.Thread(target=speaker_fetches, args=(QUEUE[0],)).start()   # after the answer
        if not action.startswith('Get'):
            if action in ('SetGroupVolume', 'SetRelativeGroupVolume', 'SetGroupMute'): changed('/MediaRenderer/GroupRenderingControl')
            elif action in ('SetVolume', 'SetMute'): changed('/MediaRenderer/RenderingControl', '/MediaRenderer/GroupRenderingControl')
            elif action != 'SnapshotGroupVolume': changed('/MediaRenderer/AVTransport')
        b = ('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:%sResponse xmlns:u="urn:schemas-upnp-org:service:x:1">%s</u:%sResponse></s:Body></s:Envelope>' % (action, ans, action)).encode()
        self.answer(200, b, [('Content-Type', 'text/xml; charset="utf-8"')])
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
