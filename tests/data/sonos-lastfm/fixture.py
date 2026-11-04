"""Local protocol fixtures; never talks to a real speaker or Last.fm account."""
import hashlib
import html
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs

calls = 0
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, body, status=200):
        raw = body.encode()
        self.send_response(status)
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        global calls
        body = self.rfile.read(int(self.headers.get('Content-Length', 0))).decode()
        if self.path == '/lastfm':
            params = {k: v[0] for k, v in parse_qs(body, keep_blank_values=True).items()}
            raw = ''.join(k + params[k] for k in sorted(params) if k not in ('format', 'callback', 'api_sig')) + 'secret'
            assert params['api_sig'] == hashlib.md5(raw.encode()).hexdigest(), params
            method = params['method']
            if method == 'auth.getToken':
                return self.reply(json.dumps({'token': 'browser-token'}))
            if method == 'auth.getSession':
                if params['token'] == 'pending-token':
                    return self.reply('{"error":14,"message":"This token has not been authorized"}', 403)
                assert params['token'] == 'browser-token'
                return self.reply(json.dumps({'session': {'key': 'session'}}))
            if method == 'track.updateNowPlaying':
                return self.reply('{}')
            assert method == 'track.scrobble' and params['timestamp'] == '1000' and params['artist'] == 'Artist', params
            calls += 1
            if calls % 7 == 1:
                return self.reply('temporarily unavailable', 503)
            if calls % 7 == 4:
                return self.reply('{"error":9,"message":"Invalid session"}')
            if calls % 7 == 0:
                return self.reply('{"error":6,"message":"Invalid parameters"}')
            if calls % 7 in (5, 6):
                return self.reply(json.dumps({'scrobbles': {'@attr': {'accepted': '0', 'ignored': '1'}, 'scrobble': {'ignoredMessage': {'code': '4' if calls % 7 == 5 else '5'}}}}))
            ignored = calls % 7 == 3
            return self.reply(json.dumps({'scrobbles': {'@attr': {'accepted': '0' if ignored else '1', 'ignored': '1' if ignored else '0'},
                'scrobble': {'ignoredMessage': {'code': '3' if ignored else '0'}}}}))
        action = self.headers['SOAPAction'].strip('"').split('#')[-1]
        if action == 'GetZoneGroupState':
            groups = f'<ZoneGroups><ZoneGroup ID="A:1" Coordinator="A"><ZoneGroupMember UUID="A" ZoneName="Living room" Location="http://127.0.0.1:{self.server.server_port}/xml/device_description.xml"/><ZoneGroupMember UUID="B" Location="http://127.0.0.2:1400/xml/device_description.xml"/></ZoneGroup></ZoneGroups>'
            fields = '<ZoneGroupState>' + html.escape(groups) + '</ZoneGroupState>'
        elif action == 'GetTransportInfo':
            fields = '<CurrentTransportState>' + ('PAUSED_PLAYBACK' if os.path.exists(os.environ['FIXTURE_PAUSED']) else 'PLAYING') + '</CurrentTransportState>'
        elif action == 'GetMediaInfo':
            fields = '<CurrentURI>x-sonos-vli:spotify:one</CurrentURI><CurrentURIMetaData></CurrentURIMetaData><NrTracks>1</NrTracks>'
        elif action == 'GetCurrentTransportActions':
            fields = '<Actions>Play,Pause,Stop</Actions>'
        elif action == 'GetTransportSettings':
            fields = '<PlayMode>NORMAL</PlayMode>'
        elif action == 'GetGroupVolume':
            fields = '<CurrentVolume>10</CurrentVolume>'
        elif action == 'GetGroupMute':
            fields = '<CurrentMute>0</CurrentMute>'
        elif action == 'GetPositionInfo':
            meta = '<DIDL-Lite><item><dc:title>Song</dc:title><dc:creator>Artist</dc:creator><upnp:album>Album</upnp:album></item></DIDL-Lite>'
            fields = '<TrackDuration>0:02:00</TrackDuration><RelTime>0:01:00</RelTime><TrackURI>spotify:one</TrackURI><TrackMetaData>' + html.escape(meta) + '</TrackMetaData>'
        else:
            return self.reply('unknown SOAP action', 500)
        self.reply('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:' + action + 'Response xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">' + fields + '</u:' + action + 'Response></s:Body></s:Envelope>')

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
with open(os.environ['FIXTURE_PORT'], 'w') as f:
    f.write(str(server.server_port))
server.serve_forever()
