# ipod-web as a music service in the Sonos app (SMAPI)

Research only, 2026-10-29. No code changed. Companion of `docs/reports/ipod-daemon.md` (the daemon: `examples/ipod-web`).
Sources: bonob `src/smapi.ts`, `src/server.ts`, `src/sonos.ts` and README (read 2026-10-29), Sonos community threads, and the SMAPI
specification from memory (developer.sonos.com / docs.sonos.com could not be fetched: 404 and a TLS error). Anything marked
"unverified" must be checked against a real speaker or the Sonos docs when the task starts.

**Licence: bonob is GPL-3.0.** We follow the protocol only and copy no code (nor its WSDL file: the WSDL is Sonos's; we do not need
to serve one, see 2.1).

## 1. How SMAPI works for a local service

SMAPI (Sonos Music API) is a SOAP 1.1 service, namespace `http://www.sonos.com/Services/1.1`, that the service provider hosts. Two
kinds of client call it: the Sonos controller app (browse, search) and the speaker itself (resolve a playable URI, report played
seconds, refresh tokens). The speaker then fetches the audio itself over HTTP(S) from the URI the service gave.

```
phone app --(Sonos cloud / local control)--> speaker --SOAP POST /smapi--> ipod-web   (getMetadata, search, getMediaURI...)
speaker --GET /smapi/stream/<id> (Range)--> ipod-web                                  (the audio)
phone app / speaker --GET /smapi/art/<id>--> ipod-web                                 (covers)
```

Registration (once per household): the speaker serves a form at `http://<speaker>:1400/customsd` (also `customsd.htm`). bonob GETs
it, reads the hidden `csrfToken`, and POSTs a url-encoded form to the same URL; 200 is success. Fields (from bonob `sonos.ts`):

| Field | Value for ipod-web |
|---|---|
| `csrfToken` | read from the GET |
| `sid` | a free service id; custom services use 240..254 (bonob default 246); one id per household; unverified range limit |
| `name` | `iPod` (the label in the app; reported not honoured by the S2 app) |
| `uri`, `secureUri` | `http://<pi>:8686/smapi` and an `https://` one (see risks) |
| `pollInterval` | 1200 (seconds between `getLastUpdate` polls) |
| `authType` | `Anonymous` (also `AppLink`, `DeviceLink`, `UserId`) |
| `stringsVersion`, `stringsUri`, `presentationMapVersion`, `presentationMapUri` | optional; bonob serves both XML files; we can skip them (default browse, 100-item pages) and add the presentation map later for the search categories |
| `containerType` | `MService` |
| `caps` | `search` (add `extendedMD` only if we implement `getExtendedMetadata`) |

Removing a service: POST `csrfToken` + `sid` (bonob does the same).

**Auth choices** (bonob uses AppLink: `getAppLink` -> a login page -> `getDeviceAuthToken` polled, returning `NOT_LINKED_RETRY` until
the user logs in; tokens go in the SOAP header `credentials.loginToken.token`, the stream gets an API key via `httpHeaders` in
`getMediaURI`). That is needed for a multi-user Subsonic server, not for one iPod on a LAN.

**Recommendation: `authType=Anonymous`.** The service shows in the app with no sign-in and no `credentials` header; the daemon
implements neither `getAppLink` nor `getDeviceAuthToken`. The audio and art URLs are unauthenticated, so protect them by the LAN
(the daemon's `/smapi` is a new surface, read only, never writing). If a secret is wanted, put it in the URL path of the registered
`uri` (`/smapi/<secret>`; the speaker keeps the registered URI; art and stream URLs inherit it). That is the simplest "fixed token"
and needs no SOAP auth state. Do not use `UserId` (the app prompts for a name and sends it: more UI for nothing).

## 2. SOAP operations to implement

Transport: `POST /smapi` (any body path the daemon chooses), `Content-Type: text/xml; charset=utf-8`, header
`SOAPAction: "http://www.sonos.com/Services/1.1#getMetadata"`. The operation is the first child element of `soap:Body`; the
`SOAPAction` header is redundant, dispatch on the body element (and check the header only as a fallback). Replies are `200` with
`text/xml; charset=utf-8`; a fault is `500` with a `soap:Fault`. Namespaces: `soap` = `http://schemas.xmlsoap.org/soap/envelope/`,
default `http://www.sonos.com/Services/1.1`. No WSDL needs serving: the speaker and app never fetch it (bonob serves one for its
validation peeker only; unverified, a GET of `/smapi?wsdl` may be probed by tools, answer 404).

Minimal set for Anonymous browse and play (the rest answers a fault `Client.ItemNotFound`/`Server.ServiceUnknownError`):

| Operation | Needed | Notes |
|---|---|---|
| `getMetadata` | yes | browse |
| `getMediaMetadata` | yes | one track (queue, now playing) |
| `getMediaURI` | yes | the playable URL |
| `getLastUpdate` | yes | polling; returns `catalog` and `favorites` strings (use the library load counter); `pollInterval` 60 |
| `search` | yes | `caps=search` |
| `getSessionId` | no | only for `UserId`/session auth; not called with Anonymous (unverified: some old S1 controllers call it; return a fixed `getSessionIdResult`) |
| `getExtendedMetadata` | later | the app calls it for artist/album detail pages when `extendedMD` is in caps; omit caps first |
| `getScrollIndices` | later | alphabet scrubber (bonob builds `A,0,B,12,...`); skip |
| `getAppLink`, `getDeviceAuthToken`, `refreshAuthToken` | no | not with Anonymous |
| `reportAccountAction`, `setPlayedSeconds`, `rateItem`, container edits | no | `setPlayedSeconds`/`reportPlaySeconds` may be sent by the speaker; reply with an empty result (`<setPlayedSecondsResponse/>`) |

### 2.1 getMetadata

Request:
```xml
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
  <getMetadata xmlns="http://www.sonos.com/Services/1.1">
    <id>root</id><index>0</index><count>100</count>
  </getMetadata></soap:Body></soap:Envelope>
```
Response (a list of containers):
```xml
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
  <getMetadataResponse xmlns="http://www.sonos.com/Services/1.1"><getMetadataResult>
    <index>0</index><count>4</count><total>4</total>
    <mediaCollection><id>artists</id><title>Artists</title><itemType>container</itemType><canPlay>false</canPlay></mediaCollection>
    <mediaCollection><id>albums</id><title>Albums</title><itemType>container</itemType><canPlay>false</canPlay></mediaCollection>
    <mediaCollection><id>playlists</id><title>Playlists</title><itemType>container</itemType><canPlay>false</canPlay></mediaCollection>
    <mediaCollection><id>songs</id><title>Songs</title><itemType>container</itemType><canPlay>false</canPlay></mediaCollection>
  </getMetadataResult></getMetadataResponse></soap:Body></soap:Envelope>
```
An album's children (tracks), `id` = `album:al-3`:
```xml
<getMetadataResult><index>0</index><count>2</count><total>2</total>
  <mediaMetadata><id>track:12345</id><itemType>track</itemType><title>Alpha</title>
    <mimeType>audio/mpeg</mimeType>
    <trackMetadata><artist>Band</artist><artistId>artist:ar-1</artistId><album>First</album><albumId>album:al-3</albumId>
      <albumArtist>Band</albumArtist><albumArtURI>http://192.168.1.20:8686/smapi/art/al-3/size/200</albumArtURI>
      <duration>201</duration><trackNumber>1</trackNumber><canPlay>true</canPlay><canSkip>true</canSkip></trackMetadata>
  </mediaMetadata>...
</getMetadataResult>
```
An album or artist or playlist in a list is a `mediaCollection` with `<itemType>album</itemType>` (or `artist`, `playlist`),
`<canPlay>true</canPlay>`, `<canEnumerate>true</canEnumerate>`, `<artist>`, `<artistId>`, `<albumArtURI>`.
Artist detail: `itemType` `artist`; its children are album `mediaCollection`s (bonob also prepends "All albums"; skip).
`albumArtURI` must be an absolute URL the app and speaker can reach: build it from the request's `Host` header
(`req.headers.get('host')`), never `localhost`.

Paging: request `index` (0-based) and `count`; answer `index`, `count` (items returned) and `total` (items in the container); the
daemon slices its sorted arrays (`lib.artists`, `lib.albums`, `lib.tracks`, `lib.playlists`) with `slice(index, index + count)`. Cap
`count` at 200. Sonos asks 100 at a time and `getLastUpdate` clears its caches.

### 2.2 getMediaMetadata
Request `<getMediaMetadata><id>track:12345</id></getMediaMetadata>`; response `<getMediaMetadataResponse><getMediaMetadataResult>`
holding one `mediaMetadata` exactly as above. Unknown id: fault `Client.ItemNotFound`.

### 2.3 getMediaURI
```xml
<getMediaURI xmlns="http://www.sonos.com/Services/1.1"><id>track:12345</id></getMediaURI>
->
<getMediaURIResponse xmlns="http://www.sonos.com/Services/1.1">
  <getMediaURIResult>http://192.168.1.20:8686/smapi/stream/12345.mp3</getMediaURIResult></getMediaURIResponse>
```
bonob also returns `httpHeaders` (an Authorization header) for the speaker to send; unneeded with Anonymous. The URI's extension
matters: Sonos infers the format from the response `Content-Type` (and sometimes from the suffix), so give the file's real suffix
(`.mp3`, `.m4a`) and its type. Sonos plays MP3, AAC/M4A (not M4P: DRM from the iTunes Store will fail), WAV, FLAC and ALAC
(`audio/mp4` with ALAC works on current Sonos; unverified for all models), not AIFF reliably: for `aiff` and `m4p` return a fault
instead of a URI, or hide them. bonob maps mime types through a `sonosifyMimeType` (unverified detail): for ALAC and AAC use `audio/mp4`.

### 2.4 getLastUpdate
`<getLastUpdateResponse><getLastUpdateResult><catalog>17</catalog><favorites>0</favorites><pollInterval>60</pollInterval></getLastUpdateResult>`.
`catalog` changes whenever the library is reloaded (a counter in `state.ts`), so the app refreshes after an upload.

### 2.5 search
Request `<search><id>tracks</id><term>alp</term><index>0</index><count>20</count></search>` with `id` among `artists`, `albums`,
`tracks` (the categories come from the presentation map `Search` section; without a map the app shows no search). Response
`<searchResponse><searchResult>` with the same `index/count/total` and `mediaCollection`/`mediaMetadata`. Match case-insensitively
on title/artist/album with `indexOf` over the library (a few thousand songs: no index needed).

### 2.6 Ids (our scheme, `type:id`, split on the first colon only)
The daemon's own ids are reused: `track:<ipod track id>` (the id of `/api/file/<id>`: stable across reloads, unlike the numbered
album and artist ids), `album:al-N`, `artist:ar-N`, `playlist:<playlist id>`. Root containers `root`, `artists`, `albums`,
`playlists`, `songs`. Caveat: `al-N`/`ar-N` are renumbered when the library changes, and a Sonos queue keeps track ids only (tracks
are the only thing queued; albums are expanded by the app into `getMetadata` calls then track ids), so this is fine. If stable album
ids are wanted, hash `artist + NUL + album` (a later improvement).

### 2.7 Mapping to the library
| SMAPI | Source in `services/library.ts` |
|---|---|
| artists container | `lib.artists` (`Artist.name`, `.albums`); `albumArtURI` = first album with `coverTrack` |
| artist -> albums | `lib.artistById.get(id).albums` |
| albums container | `lib.albums` (sorted by name) |
| album -> tracks | `lib.albumById.get(id).songs` (disc/track order already) |
| songs container | `lib.tracks` (sort by title; page it) |
| playlists | `lib.playlists` (`ipod.Playlist` ids and track ids; as `subsonic.ts getPlaylist` does) |
| track fields | `ipod.Track`: `title, artist, album, trackNr, durationMs/1000, path, mediaType, artwork` |
| cover | `coverFile(trackId)` / `pngReply(file)` from `services/files.ts`; art id = track id or album's `coverTrack` |
| audio | `trackFile(t)` (`Reply.file` with Range) |
Only `mediaType === 'audio'` tracks (hide video and podcasts-as-video).

### 2.8 Art and stream endpoints
- `GET /smapi/art/<id>[/size/<n>]` -> the PNG as `/api/cover` does (`pngReply`). The app asks sizes from the presentation map's
  `ArtWorkSizeMap`; without a map it uses the URL as given. Serve the one PNG regardless of size (iPod art is small); a 404 shows a
  blank tile. Square images of at least 200 px are best (unverified).
- `GET /smapi/stream/<trackId>.<ext>` -> `trackFile(t)`: exactly what `/api/file/<id>` returns already (Range, 206, `Accept-Ranges`).
  bonob passes `content-type`, `content-length`, `accept-ranges`, `content-range` through and answers HEAD with headers only. Sonos
  does send `Range: bytes=0-` and HEAD requests; seeking relies on Range.

## 3. What zinc:net offers and what is missing

From `lib/modules.d.ts` and `src/host/http.cpp`:
- `Request { method, path (with query), body (text), rawBody, headers: Headers, remoteAddress }`: POST with a `text/xml` body works
  (body up to 64 MiB, header block 16 KiB); `req.headers.get('soapaction')` and `get('host')` (case-insensitive) are available. The
  daemon already reads `Authorization` and `content-type` this way (`query.ts`).
- `Reply { status, body, contentType, headers?, file? }`: `contentType: 'text/xml; charset=utf-8'` and status 500 for faults are
  fine. `file` gives Range/206/416 and `Accept-Ranges` (already used for songs).
- `net.fetch` (libcurl) with `RequestInit { method, body, contentType, headers }` and form posts: enough for the daemon to GET/POST
  the speaker's `/customsd` for auto-registration.
- `Connection: close` on every reply: fine for SOAP, and Sonos copes (it reconnects) -- to confirm on a speaker.
- `serve`/`serveAsync` take a `tls: { cert, key }` option: HTTPS is available if a certificate is supplied.

Gaps:
1. **HEAD.** The server hands any method to the handler (`http.cpp` reply path); `Reply.file` for a HEAD request must send the
   headers (Content-Length, Content-Type, Accept-Ranges) and no body. Not verified in `http.cpp`; test with `curl -I` against
   `/api/file/<id>` first. If it sends a body, fix the engine (HEAD in the reply and file paths), with a test, per "Fill the
   engine's gaps". Sonos uses HEAD to probe a URI before playing (reported by bonob users; unverified for all models).
2. **No XML parser** in zinc (no `zinc:xml`, no DOMParser in `lib/`). SOAP requests are small and fixed: take the first element of
   `<soap:Body>` by scanning for `<getMetadata`, `<id>`, `<index>`, `<count>`, `<term>`, with `indexOf` that tolerates a prefix
   (`<ns:id>`: strip prefixes) and decodes the five XML entities. The daemon already writes XML (`element.ts toXml`) so the
   response side is solved; the request side is ~40 lines. A vendored parser is not worth it for a four-tag grammar. Escape every
   text and attribute on output (`toXml` does; check it escapes `&`, `<`, `>`).
3. **`SOAPAction` is a quoted string**: compare after stripping quotes.
4. **Chunked / `Expect: 100-continue`**: Sonos posts small bodies with Content-Length; unverified. llhttp handles chunked.
5. No mDNS/SSDP/UDP in `lib/modules.d.ts` (grep found none): speaker discovery is not available. Give the speaker's IP with
   `--sonos <ip>`; no discovery needed.
6. **Own address for URLs.** Behind NAT or with several NICs `Host` is the right answer (the speaker called that address). Add
   `--public-url` as an override, like bonob's `BNB_URL`.

## 4. Registration

Automatic: yes for **S1**, workable only partly for **S2**.
- Flow (as bonob): `GET http://<speaker>:1400/customsd` -> parse the hidden input `csrfToken` (an `indexOf('name="csrfToken"')`
  scan) -> `POST` the url-encoded form of section 1 -> success when 200 (unverified: a Sonos S2 firmware may require the older
  `customsd.htm`; try both). Options: `--sonos-host <ip>`, `--sonos-sid 246`, run at start and every few hours (a speaker reboot
  keeps registrations; the household replicates them, so one speaker is enough).
- bonob's README: auto-registration is for S1 only and "must be false for S2"; since May 2024 an S2 app update (bonob issue #205)
  requires the service URL to be reachable from the internet (public DNS, HTTPS), and the custom service name is not shown. The
  Sonos community threads of 2024-2025 report custom (customsd) services are not visible in the new iOS and Android S2 apps at all,
  and still usable from the legacy desktop controller (macOS/Windows) when added there; a request to restore custom providers is
  open (May 2025). I could not confirm a 2026 change: **treat the phone-app goal as achievable on S1 and on the desktop
  controller, doubtful on the S2 phone app**, and check first with the owner's speakers (S1 or S2, which app version).
- Manual fallback: open `http://<speaker>:1400/customsd` in a browser on the LAN, fill the table's fields by hand, Submit. The
  daemon's page can print the exact values to type (`GET /smapi/register` prints the form values as text).
- Sid: pick 246 (bonob's) unless the user also runs bonob; else 247.

## 5. Test plan without a speaker

Extend `tests/t1/ipod_web.sh` (same fake iPod root, port 8687, the daemon started once with `--token secret ...`; no
`--allow-changes` needed, SMAPI is read only). Add a `soap()` helper:
```sh
soap() { # soap <Action> <inner xml>
  curl -s -X POST $B/smapi -H 'Content-Type: text/xml; charset=utf-8' -H "SOAPAction: \"http://www.sonos.com/Services/1.1#$1\"" \
    -d "<?xml version=\"1.0\"?><soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\"><soap:Body><$1 xmlns=\"http://www.sonos.com/Services/1.1\">$2</$1></soap:Body></soap:Envelope>"; }
want 'smapi root'  '*<total>4</total>*<id>artists</id>*' "$(soap getMetadata '<id>root</id><index>0</index><count>100</count>')"
want 'smapi artists' '*<mediaCollection>*<title>Band</title>*<itemType>artist</itemType>*' "$(soap getMetadata '<id>artists</id><index>0</index><count>10</count>')"
want 'smapi album' '*<title>Alpha</title>*<title>Beta</title>*<mimeType>audio/wav</mimeType>*' "$(soap getMetadata '<id>album:al-1</id><index>0</index><count>10</count>')"
want 'smapi paging' '*<count>1</count>*<total>2</total>*' "$(soap getMetadata '<id>album:al-1</id><index>1</index><count>1</count>')"
want 'smapi uri'   '*<getMediaURIResult>http://localhost:8687/smapi/stream/*' "$(soap getMediaURI '<id>track:<ID></id>')"
want 'smapi search' '*Alpha*' "$(soap search '<id>tracks</id><term>alp</term><index>0</index><count>5</count>')"
want 'smapi lastupdate' '*<catalog>*<pollInterval>*' "$(soap getLastUpdate '')"
want 'smapi fault' '*Client.ItemNotFound*' "$(soap getMediaMetadata '<id>track:nope</id>')"
```
Plus: the track id from `/api/tracks`; `curl -s -r 0-99 -D- <stream url>` expects `206` and `Content-Range`; `curl -I` on the stream
URL expects 200 with `Content-Length` and no body (HEAD gap); `GET /smapi/art/al-1` -> `image/png`; a body with prefixed tags
(`<s:Body><ns:getMetadata>`), XML entities in the term (`a&amp;b`), and a title with `&` in the fixture to check escaping; an
unknown operation -> a fault with status 500. Validate that every response is well formed XML with `python3 -c 'xml.dom.minidom'`
(python3 is already a requirement of the test). A schema check against the Sonos WSDL (as bonob's validation peeker) is not
possible offline without fetching it; do it once by hand when a WSDL copy is obtained from developer.sonos.com.
The registration code is tested against a tiny python `http.server` standing in for `:1400/customsd` (GET returns a form with a
`csrfToken`, POST records the fields): assert the fields and the csrf round trip.
Final proof is manual: a real speaker, one session, noted in the task.

## 6. Risks

- **S2 phone app (the main one).** Custom services were reported hidden in the new Sonos app (2024-2025 threads); bonob's S2
  path needs a public HTTPS URL. If the owner's household is S2, the goal may be impossible from the phone app regardless of how
  correct our SMAPI is; the desktop controller and S1 work. Check before building.
- **HTTPS.** S2 wants `secureUri` public with a trusted certificate (a LAN-only Pi has none; a public tunnel/DNS plus Let's Encrypt
  is exactly the exposure bonob warns about). The daemon would add `--tls-cert/--tls-key` to `net.serveAsync` (supported). Exposing
  an anonymous, unauthenticated service publicly is not acceptable: if S2 forces it, use the secret path prefix and `AppLink` auth.
- **sid ranges.** Custom ids are limited (240-254 as I remember, bonob uses 246); clash with an official service id would replace
  it. Unverified numbers.
- **Formats.** iTunes-bought M4P (DRM) and AIFF will not play on Sonos; older iPods hold such files. Filter them and say so.
- **Connection: close and HEAD** (section 3), and **no XML parser**: a request with a feature we do not scan (CDATA, entity numerics)
  fails: answer a fault rather than crash.
- **Renumbered album/artist ids** after a library change break a browse in progress (the app shows an empty page); tracks are safe.
- **Sonos limits:** page size, `getLastUpdate` polling and token errors surface as a generic "service unavailable"; keep a debug
  log of every SOAP body (`--smapi-log`) for the first real session.
- **Licence:** bonob is GPL-3.0; keep this implementation written from the protocol, not from its source.
- **Read only:** SMAPI exposes browse and play only; container edits (playlists) would need `--allow-changes`, out of scope.

## Suggested task shape (one task, size M)
`services/smapi.ts` (dispatch, tag scanner, responses, ids), routes `/smapi`, `/smapi/art`, `/smapi/stream` in `web.ts`, options
`--sonos-host`, `--sonos-sid`, `--public-url`, `--smapi` (off by default), registration helper using `net.fetch`, HEAD fix in
the engine if the test shows the gap, the t1 additions above, a line in `docs/reports/ipod-daemon.md` and the changelog.
