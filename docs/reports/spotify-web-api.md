# Spotify Web API from a wall-mounted TouchPad remote (state 2026-10-15)

Target: native app on HP TouchPad (HTTPS fetch only), user has a Mac, a phone, Premium, Sonos speakers.
Every claim carries a source; "UNCONFIRMED" marks what I could not verify on developer.spotify.com.

## 1. Registration and Development Mode

- Register at https://developer.spotify.com/dashboard. New apps start in Development Mode. Source: https://developer.spotify.com/documentation/web-api/concepts/rate-limits
- Dev Mode: max 5 authenticated users (allowlist, added in the dashboard); non-allowlisted users can log in but get 403 on API calls. The app owner must have Premium or the app stops working. Source: https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- Feb 2026 rules: new Client IDs from 2026-02-11: Premium owner, 1 Client ID per developer, 5 users. Applied to all existing Dev Mode apps from 2026-03-09. Source: https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security and https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- Client ID cap raised to 25 in July 2026: stated by the migration guide changelog note; UNCONFIRMED elsewhere. Same URL as above.
- Dev Mode is "for learning, experimentation, and non-commercial personal projects" (the 2026-02-06 post). A personal wall remote fits. Extended Quota needs an organization with 250k MAU: irrelevant here. Source: quota-modes URL.
- Endpoints gone for apps created on/after 2024-11-27 (and Dev Mode apps): Related Artists, Recommendations, Audio Features, Audio Analysis, Featured Playlists, Category Playlists, 30 s preview URLs in multi-get, Spotify-owned/algorithmic playlists. Source: https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api
- Feb 2026 Dev Mode removals (new apps now; for existing apps the endpoint part was POSTPONED on 2026-03-09, no new date known; assume gone): batch `GET /tracks|albums|artists|...` (use `/{id}`), `GET /browse/new-releases`, `/browse/categories*`, `GET /artists/{id}/top-tracks`, `GET /users/{id}`, `GET /users/{id}/playlists`, `GET /markets`; `PUT/DELETE /me/tracks|albums|...` replaced by `PUT/DELETE /me/library`, `GET /me/library/contains`; `/playlists/{id}/tracks` renamed `/playlists/{id}/items` (field `tracks`->`items`, `tracks.tracks.track`->`items.items.item`); playlist contents only for playlists the user owns or collaborates on. Fields removed: track/album `available_markets`, `popularity`, `linked_from`; artist `followers`, `popularity`; `/me` `country, email, product...`. Source: february-2026-migration-guide URL above.
- Search: `limit` max 50 -> 10, default 20 -> 5; paginate with `offset`. Same source.
- Redirect URIs: HTTPS required; HTTP only for loopback IP literals `http://127.0.0.1:PORT` or `http://[::1]:PORT`; `localhost` is forbidden; must exactly match the registered string (port may vary only if registered without a port). Enforced for new apps since 2025-04-09, everyone by Nov 2025. Source: https://developer.spotify.com/documentation/web-api/concepts/redirect_uri
  Register exactly `http://127.0.0.1:8765/callback`.

## 2. Login flow

Device Authorization (device code) flow: Spotify documents only Authorization Code, PKCE, Client Credentials and Implicit (deprecated). No device flow for third parties. Source: https://developer.spotify.com/documentation/web-api/concepts/api-calls (tutorial list). (Absence of evidence; treat as confirmed-not-offered.)

Chosen design: PKCE once on the Mac with the script in section 7, copy `{client_id, refresh_token}` to the tablet. No client secret anywhere.

Authorize: `GET https://accounts.spotify.com/authorize?client_id=..&response_type=code&redirect_uri=..&scope=..&state=..&code_challenge_method=S256&code_challenge=..`
Exchange: `POST https://accounts.spotify.com/api/token`, `Content-Type: application/x-www-form-urlencoded`, body `grant_type=authorization_code&code=..&redirect_uri=..&client_id=..&code_verifier=..`. Verifier 43-128 chars of `[A-Za-z0-9._~-]`, challenge = base64url(SHA256(verifier)) without padding. Source: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow

Refresh on the tablet (no Authorization header for PKCE):
```
POST https://accounts.spotify.com/api/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&refresh_token=<RT>&client_id=<CLIENT_ID>
```
Response 200: `access_token`, `token_type=Bearer`, `expires_in=3600`, `scope`, and OPTIONALLY a new `refresh_token`. If present, replace the stored one atomically (write temp file, rename); if absent keep the old. Whether the old one stays valid after rotation is not documented: always save the new one. Source: https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens
Access token lifetime: 3600 s; refresh 1-2 min early.

IMPORTANT 2026 rule: refresh tokens now die 6 months after the original authorization; refreshing does NOT extend it. New apps since 2026-06-18, existing since 2026-07-20. Expiry returns `400 {"error":"invalid_grant"}`. So: expect to rerun the Mac script about every 6 months; on `invalid_grant` stop retrying and show "re-login needed" on the tablet; store the authorization date yourself (Spotify does not expose it). Source: https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration

## 3. Scopes

Required: `user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative user-library-read user-read-recently-played`.
Useful extras: `user-library-modify` (heart button via `PUT /me/library`), `user-read-playback-position` (podcast resume). Not needed: `streaming`, `app-remote-control`. Source: https://developer.spotify.com/documentation/web-api/concepts/scopes
Changing scopes means rerunning the login script.

## 4. Endpoints (base `https://api.spotify.com/v1`, header `Authorization: Bearer <AT>`)

Player commands need Premium, scope `user-modify-playback-state`, return `204`; ordering between calls is not guaranteed (wait for the 204 / re-poll). Source: https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback

| Action | Request |
|---|---|
| State | `GET /me/player?additional_types=episode` |
| Devices | `GET /me/player/devices` |
| Transfer | `PUT /me/player` body `{"device_ids":["<id>"],"play":true}` (exactly one id, else 400) |
| Play context | `PUT /me/player/play?device_id=<id>` body `{"context_uri":"spotify:playlist:ID","offset":{"position":0}}` (offset only for album/playlist; `offset.uri` also allowed) |
| Play tracks | same, body `{"uris":["spotify:track:ID"],"position_ms":0}` |
| Resume | `PUT /me/player/play` (no body) |
| Pause | `PUT /me/player/pause` |
| Next / prev | `POST /me/player/next`, `POST /me/player/previous` |
| Seek | `PUT /me/player/seek?position_ms=60000` |
| Volume | `PUT /me/player/volume?volume_percent=0..100` |
| Shuffle | `PUT /me/player/shuffle?state=true` |
| Repeat | `PUT /me/player/repeat?state=off|track|context` |
| Queue add | `POST /me/player/queue?uri=spotify%3Atrack%3AID` |

All accept optional `device_id` query. Transfer/play/queue pages: https://developer.spotify.com/documentation/web-api/reference/transfer-a-users-playback , https://developer.spotify.com/documentation/web-api/reference/add-to-queue . Pause/next/seek/volume/shuffle/repeat paths from my knowledge of the reference (same scope; pages not re-fetched): https://developer.spotify.com/documentation/web-api/reference/ (UNCONFIRMED this session).

`GET /me/player` fields (204 with empty body when nothing is active): `device{id,name,type,is_active,is_restricted,supports_volume,volume_percent}`, `repeat_state`, `shuffle_state`, `context{type,uri}`, `timestamp`, `progress_ms`, `is_playing`, `item` (track or episode; the field is `item`, not `track`; check `item.type`), `currently_playing_type`, `actions`. Art: `item.album.images[]` (typically 640, 300, 64 px, widest first; sizes UNCONFIRMED this session). Source: https://developer.spotify.com/documentation/web-api/reference/get-information-about-the-users-current-playback

Library and browsing:
- `GET /me/playlists?limit=50&offset=0` (playlist object now carries `items` instead of `tracks`; per the migration guide).
- `GET /playlists/{id}/items?limit=50&offset=0&fields=items(item(name,uri,artists(name),album(images)))` for playlists owned/collaborated by the user only; others return no items. Old `/tracks` path removed (migration guide).
- `GET /me/tracks?limit=50`, `GET /me/albums?limit=50` still present (migration guide only lists the write/contains ones as replaced; read paths not in the removal list).
- `GET /me/player/recently-played?limit=50` (max 50; `before`/`after` ms cursors; no podcasts). Items: `track`, `played_at`, `context`. Source: https://developer.spotify.com/documentation/web-api/reference/get-recently-played
- `GET /search?q=..&type=track,album,artist,playlist&limit=10&offset=0` (limit max 10 now).
- Saved/unsaved: `PUT|DELETE /me/library?uris=spotify:track:ID`, `GET /me/library/contains?uris=...`.

Rate limits: rolling 30 s window, numeric limit unpublished (lower in Dev Mode); 429 carries `Retry-After` in seconds: sleep that long. 429 with `reason: QUOTA_EXCEEDED` is the Dev Mode quota bucket. Sources: https://developer.spotify.com/documentation/web-api/concepts/rate-limits , https://developer.spotify.com/documentation/web-api/concepts/quota-modes
Polling: no official figure. Recommendation (mine): poll `GET /me/player` every 3-5 s while the screen is on and a session is active, interpolate `progress_ms` locally between polls, refetch right after any command (~300-500 ms later), back off to 15-30 s when idle/screen dimmed, use ETag/`If-None-Match` (304 is supported per https://developer.spotify.com/documentation/web-api/concepts/api-calls). One user at 4 s is ~8 requests per 30 s: should be fine, but Dev Mode limit is unpublished.

## 5. Sonos and Connect pitfalls

Evidence is community-only; Spotify has no statement. Sources: https://github.com/spotify/web-api/issues/1337 , https://community.spotify.com/t5/Spotify-for-Developers/Unable-to-get-sonos-devices-in-discover-device-API/m-p/6011783/highlight/true , https://community.openhab.org/t/openhab-integration-to-spotify-web-connect-api-player/31610/79
- Sonos is often absent from `/me/player/devices`; a Spotify moderator said not all devices are supported by the player endpoints. Sonos tends to show up only after it was recently used from the Spotify app (Connect session), and sometimes as the active device with `"id": null, "is_restricted": true`.
- `is_restricted: true` means "no Web API commands will be accepted" (official doc: https://developer.spotify.com/documentation/web-api/reference/get-a-users-available-devices). Expect volume/play via API to fail (403 `PREMIUM_REQUIRED`/`RESTRICTED_DEVICE` style errors; exact codes UNCONFIRMED). Device ids are not stable: refetch periodically.
- `404 NO_ACTIVE_DEVICE`: nothing is active. Fix: `GET /devices`, pick id, `PUT /me/player {"device_ids":[id],"play":true}`, then retry the command. Note that newer Sonos speakers may play Spotify through Sonos's own cloud service, not Connect, in which case Web API control is impossible. UNCONFIRMED: test with the user's actual speakers first (curl `/me/player/devices` after starting a song from the phone's Spotify to a Sonos).
- Fallback: control the Sonos locally via UPnP/SOAP on `http://<sonos-ip>:1400` (AVTransport `/MediaRenderer/AVTransport/Control`, RenderingControl `/MediaRenderer/RenderingControl/Control` for volume/mute, device description `/xml/device_description.xml`; discovery by SSDP `urn:schemas-upnp-org:device:ZonePlayer:1`). This is Sonos's documented-by-community local API, not Spotify's (UNCONFIRMED here: no Sonos source consulted). It gives Play/Pause/Next/Volume/transport state for whatever the Sonos is playing, even Spotify via the Sonos service, but cannot choose Spotify content. Practical split: Spotify Web API for browsing and starting content on any visible device (or a Spotify Connect-capable device the Sonos group exposes); Sonos UPnP for volume, pause, wake, and when `is_restricted`.
- Another hedge (known pattern, UNCONFIRMED): run a Connect receiver (librespot/raspotify) on a Pi/Mac that appears as a normal unrestricted device and feeds the Sonos line-in.

## 6. Minimal tablet loop (pseudocode)

```
tok = refresh()                       # section 2; save rotated refresh_token
st  = GET /me/player                  # 204 => idle, show devices
on 401: refresh once, retry; on invalid_grant: show "re-login (6 months)"
on 429: sleep Retry-After
on 404 NO_ACTIVE_DEVICE: transfer to last device_id (play=true), retry
```

## 7. Login script (Mac, Python 3 stdlib)

Save as `spotify_login.py`; run `python3 spotify_login.py <CLIENT_ID> /path/spotify.json`. Register redirect `http://127.0.0.1:8765/callback` in the dashboard first.

```python
#!/usr/bin/env python3
"""Spotify PKCE login, once. Usage: spotify_login.py CLIENT_ID OUT.json"""
import base64, hashlib, json, os, secrets, sys, threading, webbrowser
import urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

SCOPES = ("user-read-playback-state user-modify-playback-state user-read-currently-playing "
          "playlist-read-private playlist-read-collaborative user-library-read "
          "user-library-modify user-read-recently-played user-read-playback-position")
REDIRECT = "http://127.0.0.1:8765/callback"

if len(sys.argv) != 3:
    sys.exit(__doc__)
client_id, out = sys.argv[1], sys.argv[2]

verifier = secrets.token_urlsafe(64)[:96]  # 43-128 chars of [A-Za-z0-9_-]
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
state = secrets.token_urlsafe(16)
got = {}

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path != "/callback":
            self.send_response(404); self.end_headers(); return
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        got.update(q)
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"Done, you can close this tab." if "code" in q else b"Login failed.")
        threading.Thread(target=self.server.shutdown, daemon=True).start()
    def log_message(self, *a):
        pass

srv = HTTPServer(("127.0.0.1", 8765), H)
url = "https://accounts.spotify.com/authorize?" + urllib.parse.urlencode({
    "client_id": client_id, "response_type": "code", "redirect_uri": REDIRECT,
    "scope": SCOPES, "state": state,
    "code_challenge_method": "S256", "code_challenge": challenge})
print("Opening:", url)
webbrowser.open(url)
srv.serve_forever()

if got.get("state") != state or "code" not in got:
    sys.exit("login failed: %r" % got)

body = urllib.parse.urlencode({
    "grant_type": "authorization_code", "code": got["code"], "redirect_uri": REDIRECT,
    "client_id": client_id, "code_verifier": verifier}).encode()
req = urllib.request.Request("https://accounts.spotify.com/api/token", data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"})
tok = json.load(urllib.request.urlopen(req))
data = {"client_id": client_id, "refresh_token": tok["refresh_token"]}
fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    json.dump(data, f)
print(json.dumps(data))
print("Granted scopes:", tok.get("scope"))
print("Re-run in under 6 months (refresh tokens expire 6 months after this login).")
```

## Open items to verify on the real hardware
1. Do the user's Sonos appear in `/me/player/devices` and is `is_restricted` false?
2. Do existing-app endpoint removals (postponed 2026-03-09) apply to this Client ID: try `/playlists/{id}/items` and `/tracks` on day one.
3. Confirm image sizes and non-Spotify-owned playlist behaviour.
