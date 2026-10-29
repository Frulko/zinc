# A made-up Sonos speaker for the tests of zinc:sonos (tests/t1/sonos_plugin.sh, ipod_sonos.sh, music_tree_sonos.sh never contacts one):
# the UPnP SOAP actions the plugin sends, and GENA events (SUBSCRIBE, renew, UNSUBSCRIBE, then NOTIFY to the subscriber's CALLBACK
# with the state, as a speaker does). The plugin reaches it as 127.0.0.1:<port> (Speaker.port, from the Location of the topology).
# usage: stub_speaker.py <port> <log> [--house] [--fetch]
#   --house  two rooms: Salon (RINCON_A, with a hidden stereo partner RINCON_A2) and Bureau (RINCON_B, its own group); else Salon alone
#   --fetch  on Play, fetch the first queued song with a byte range and its cover, as a real speaker does (examples/ipod)
# The queue (Q:0) and the Sonos playlists (SQ:n) are kept with their UpdateIDs; a change to the queue sends a ContentDirectory event
# (ContainerUpdateIDs Q:0,<id>) and keeps the song that plays current (its number follows it), as a speaker does.
# <log>: every command (not a Get or a Browse) as '<Action> <args...>', the GENA requests as 'SUBSCRIBE <path> <callback> <timeout>',
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
S = {'state': 'STOPPED', 'mode': 'NORMAL', 'fade': '0', 'gvol': 30, 'gmute': '0', 'vol': 20, 'mute': '0', 'uri': '', 'meta': '', 'track': 0, 'qid': 0, 'sqid': 0}
QUEUE = []   # [uri, meta]: one list per entry, so the entry that plays is found again by identity after a move
PLAYLISTS = {}   # n -> {'title', 'tracks': [[uri, meta]], 'uid'}
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
    return tuple(QUEUE[n - 1]) if S['uri'].startswith('x-rincon-queue:') and 0 < n <= len(QUEUE) else (S['uri'], S['meta'])

def queue_changed(change):   # runs `change` on QUEUE; the entry that played stays current (removed: the one now at its place)
    n = S['track']
    playing = QUEUE[n - 1] if 0 < n <= len(QUEUE) else None
    change()
    S['qid'] += 1
    hit = [i for i, e in enumerate(QUEUE) if e is playing]
    S['track'] = hit[0] + 1 if hit else (min(n, len(QUEUE)) if QUEUE else 0)

def didl_items(entries, parent):   # the DIDL-Lite of entries, each its own meta's <item> with the id of its place
    out = []
    for i, (uri, meta) in enumerate(entries):
        m = re.search(r'<item\b[^>]*>(.*)</item>', meta, re.S)
        inner = m.group(1) if m else '<dc:title>%s</dc:title><upnp:class>object.item.audioItem.musicTrack</upnp:class>' % esc(uri)
        if '<res' not in inner: inner = '<res protocolInfo="http-get:*:*:*">%s</res>' % esc(uri) + inner
        out.append('<item id="%s/%d" parentID="%s" restricted="true">%s</item>' % (parent, i + 1, parent, inner))
    return ('<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" '
            'xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">%s</DIDL-Lite>' % ''.join(out))
def didl_metas(text):   # the DIDL documents of AddMultipleURIsToQueue, joined by spaces
    return re.findall(r'<DIDL-Lite.*?</DIDL-Lite>', text, re.S)

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
    elif path.startswith('/MediaServer/ContentDirectory'):
        props += ['<ContainerUpdateIDs>Q:0,%d</ContainerUpdateIDs>' % S['qid'], '<SavedQueuesUpdateID>RINCON_A,%d</SavedQueuesUpdateID>' % S['sqid']]
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
        elif action == 'RemoveAllTracksFromQueue': queue_changed(QUEUE.clear); ans = '<NewUpdateID>%d</NewUpdateID>' % S['qid']
        elif action in ('AddURIToQueue', 'AddMultipleURIsToQueue'):
            if action == 'AddURIToQueue': new = [[arg('EnqueuedURI'), arg('EnqueuedURIMetaData')]]
            else:
                uris, metas = arg('EnqueuedURIs').split(' '), didl_metas(arg('EnqueuedURIsMetaData'))
                if len(uris) != int(arg('NumberOfURIs') or 0): fault = 402
                new = [[u, metas[i] if i < len(metas) else ''] for i, u in enumerate(uris)]
            want = int(arg('DesiredFirstTrackNumberEnqueued') or 0)
            at = want - 1 if 0 < want <= len(QUEUE) + 1 else (S['track'] if arg('EnqueueAsNext') == '1' and S['track'] > 0 else len(QUEUE))
            if not fault: queue_changed(lambda: QUEUE.__setitem__(slice(at, at), new))
            ans = ('<FirstTrackNumberEnqueued>%d</FirstTrackNumberEnqueued><NumTracksAdded>%d</NumTracksAdded><NewQueueLength>%d</NewQueueLength><NewUpdateID>%d</NewUpdateID>'
                   % (at + 1, len(new), len(QUEUE), S['qid']))
        elif action in ('RemoveTrackFromQueue', 'RemoveTrackRangeFromQueue'):
            start = int(arg('ObjectID').split('/')[-1]) if action == 'RemoveTrackFromQueue' else int(arg('StartingIndex') or 0)
            count = 1 if action == 'RemoveTrackFromQueue' else int(arg('NumberOfTracks') or 0)
            if not (0 < start and start + count - 1 <= len(QUEUE)): fault = 711
            else: queue_changed(lambda: QUEUE.__delitem__(slice(start - 1, start - 1 + count)))
            ans = '<NewUpdateID>%d</NewUpdateID>' % S['qid']
        elif action == 'ReorderTracksInQueue':
            start, count, before = int(arg('StartingIndex') or 0), int(arg('NumberOfTracks') or 0), int(arg('InsertBefore') or 0)
            if not (0 < start and start + count - 1 <= len(QUEUE)): fault = 711
            else:
                def move():
                    moved = QUEUE[start - 1:start - 1 + count]
                    rest = QUEUE[:start - 1] + [None] * count + QUEUE[start - 1 + count:]   # placeholders keep the numbers of InsertBefore
                    k = min(max(before, 1), len(QUEUE) + 1) - 1
                    out = [e for e in rest[:k] if e is not None] + moved + [e for e in rest[k:] if e is not None]
                    QUEUE[:] = out
                queue_changed(move)
            ans = '<NewUpdateID>%d</NewUpdateID>' % S['qid']
        elif action == 'Browse':
            oid, start, count = arg('ObjectID'), int(arg('StartingIndex') or 0), int(arg('RequestedCount') or 0)
            if oid == 'SQ:':
                lst = sorted(PLAYLISTS.items())
                part = lst[start:start + count]
                result = ('<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">%s</DIDL-Lite>'
                          % ''.join('<container id="SQ:%d" parentID="SQ:" restricted="true"><dc:title>%s</dc:title><res protocolInfo="file:*:audio/mpegurl:*">file:///jffs/settings/savedqueues.rsq#%d</res>'
                                    '<upnp:class>object.container.playlistContainer</upnp:class></container>' % (n, esc(pl['title']), n) for n, pl in part))
                total, uid = len(lst), S['sqid']
            elif oid.startswith('SQ:') and int(oid[3:] or -1) in PLAYLISTS:
                pl = PLAYLISTS[int(oid[3:])]
                result, total, uid = didl_items(pl['tracks'][start:start + count], oid), len(pl['tracks']), pl['uid']
            elif oid == 'Q:0': result, total, uid = didl_items(QUEUE[start:start + count], 'Q:0'), len(QUEUE), S['qid']
            else: result, total, uid, fault = '', 0, 0, 701
            # the numbers of a page count from its start
            if oid == 'Q:0' and start: result = re.sub(r'id="Q:0/(\d+)"', lambda m: 'id="Q:0/%d"' % (int(m.group(1)) + start), result)
            n = len(re.findall(r'<(item|container) ', result))
            ans = '<Result>%s</Result><NumberReturned>%d</NumberReturned><TotalMatches>%d</TotalMatches><UpdateID>%d</UpdateID>' % (esc(result), n, total, uid)
        elif action in ('CreateSavedQueue', 'SaveQueue'):
            n = max(PLAYLISTS.keys(), default=0) + 1
            PLAYLISTS[n] = {'title': arg('Title'), 'tracks': [list(e) for e in QUEUE] if action == 'SaveQueue' else [], 'uid': 1}
            S['sqid'] += 1
            ans = '<NumTracksAdded>%d</NumTracksAdded><NewQueueLength>%d</NewQueueLength><AssignedObjectID>SQ:%d</AssignedObjectID><NewUpdateID>1</NewUpdateID>' % (
                len(PLAYLISTS[n]['tracks']), len(PLAYLISTS[n]['tracks']), n)
        elif action in ('AddURIToSavedQueue', 'ReorderTracksInSavedQueue'):
            oid = arg('ObjectID')
            pl = PLAYLISTS.get(int(oid[3:] or -1)) if oid.startswith('SQ:') else None
            if pl is None: fault = 701
            elif int(arg('UpdateID') or -1) != pl['uid']: fault = 412   # a stale UpdateID: the speaker refuses the change
            elif action == 'AddURIToSavedQueue': pl['tracks'].append([arg('EnqueuedURI'), arg('EnqueuedURIMetaData')])
            else:
                tracks = [int(x) for x in arg('TrackList').split(',') if x != '']
                positions = [int(x) for x in arg('NewPositionList').split(',') if x != '']
                if not positions:   # taken out
                    pl['tracks'] = [e for i, e in enumerate(pl['tracks']) if i not in tracks]
                else:
                    for t, to in zip(tracks, positions): e = pl['tracks'].pop(t); pl['tracks'].insert(to, e)
            if not fault:
                pl['uid'] += 1; S['sqid'] += 1
                ans = '<NewQueueLength>%d</NewQueueLength><NewUpdateID>%d</NewUpdateID>' % (len(pl['tracks']), pl['uid'])
        elif action == 'DestroyObject':
            oid = arg('ObjectID')
            if not (oid.startswith('SQ:') and PLAYLISTS.pop(int(oid[3:] or -1), None) is not None): fault = 701
            else: S['sqid'] += 1
        elif action == 'SetAVTransportURI' and arg('CurrentURI').startswith('x-rincon:'): pass   # another room joins: one stub plays for all
        elif action == 'SetAVTransportURI': S['uri'], S['meta'] = arg('CurrentURI'), arg('CurrentURIMetaData'); S['track'] = 1 if QUEUE else 0
        elif action == 'Seek':
            if arg('Unit') == 'TRACK_NR':
                n = int(arg('Target') or 0)
                if not 0 < n <= len(QUEUE): fault = 711
                else: S['track'] = n
        elif action == 'Next':
            if S['track'] >= len(QUEUE) and S['mode'] in ('REPEAT_ALL', 'SHUFFLE') and QUEUE: S['track'] = 1   # repeat all: round again
            elif S['track'] >= len(QUEUE): fault = 701   # no next track: a speaker refuses, without a description
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
        if not action.startswith('Get') and action != 'Browse':
            names = ('EnqueuedURI', 'EnqueuedURIMetaData', 'CurrentURI', 'CurrentURIMetaData', 'Unit', 'Target', 'DesiredVolume', 'NewPlayMode', 'CrossfadeMode', 'Adjustment', 'DesiredMute', 'Channel',
                     'NumberOfURIs', 'EnqueuedURIs', 'EnqueuedURIsMetaData', 'DesiredFirstTrackNumberEnqueued', 'EnqueueAsNext', 'ObjectID', 'StartingIndex', 'NumberOfTracks', 'InsertBefore', 'Title', 'TrackList', 'NewPositionList')
            log(' '.join([action] + [x for x in (arg(n) for n in names) if x] + (['fault %d' % fault] if fault else [])))
        if fault:
            b = ('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring>'
                 '<detail><UPnPError xmlns="urn:schemas-upnp-org:control-1-0"><errorCode>%d</errorCode></UPnPError></detail></s:Fault></s:Body></s:Envelope>' % fault).encode()
            return self.answer(500, b, [('Content-Type', 'text/xml')])
        if action == 'Play' and FETCH and QUEUE: threading.Thread(target=speaker_fetches, args=(QUEUE[0],)).start()   # after the answer
        if action in ('RemoveAllTracksFromQueue', 'AddURIToQueue', 'AddMultipleURIsToQueue', 'RemoveTrackFromQueue', 'RemoveTrackRangeFromQueue', 'ReorderTracksInQueue') or \
           action in ('CreateSavedQueue', 'SaveQueue', 'AddURIToSavedQueue', 'ReorderTracksInSavedQueue', 'DestroyObject'):
            changed('/MediaServer/ContentDirectory')
        if not action.startswith('Get') and action != 'Browse':
            if action in ('SetGroupVolume', 'SetRelativeGroupVolume', 'SetGroupMute'): changed('/MediaRenderer/GroupRenderingControl')
            elif action in ('SetVolume', 'SetMute'): changed('/MediaRenderer/RenderingControl', '/MediaRenderer/GroupRenderingControl')
            elif action != 'SnapshotGroupVolume': changed('/MediaRenderer/AVTransport')
        b = ('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:%sResponse xmlns:u="urn:schemas-upnp-org:service:x:1">%s</u:%sResponse></s:Body></s:Envelope>' % (action, ans, action)).encode()
        self.answer(200, b, [('Content-Type', 'text/xml; charset="utf-8"')])
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
