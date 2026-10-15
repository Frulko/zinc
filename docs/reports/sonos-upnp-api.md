# Sonos LAN control (UPnP/SOAP, port 1400): implementer's reference

Scope: a client with UDP send/receive and HTTP POST/GET with custom headers. No cloud API, no eventing server.
Verification status (2026-10-15): action lists, argument names, error codes and SoCo behaviour were read from
sonos.svrooij.io and SoCo `soco/core.py` during this write-up. The rest (ZoneGroupState layout, Browse FV:2 layout,
source URI shapes, `x-rincon-mp3radio` details) is from SoCo/node-sonos-http-api/node-sonos-ts knowledge and was NOT re-run
against a live S2 speaker. Items marked **[TEST]** must be confirmed on a device. The UPnP interface on port 1400 is unchanged on S2.

Sources: https://sonos.svrooij.io/ (per-service pages: /services/av-transport, /services/rendering-control, /services/group-rendering-control,
/services/zone-group-topology, /services/content-directory), https://github.com/SoCo/SoCo (soco/core.py, soco/music_library.py,
soco/data_structures.py, soco/zonegroupstate.py), https://github.com/jishi/node-sonos-http-api (lib/actions/*.js, lib/helpers/),
https://github.com/svrooij/node-sonos-ts.

## 0. Common SOAP call (all services)

```
POST <control path> HTTP/1.1
Host: <ip>:1400
Content-Type: text/xml; charset="utf-8"
SOAPACTION: "<service type>#<Action>"        (quotes are part of the value)
Content-Length: <bytes>
Connection: close

<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
 <s:Body><u:Action xmlns:u="<service type>"> ...args in order... </u:Action></s:Body>
</s:Envelope>
```
Response: HTTP 200, `<u:ActionResponse>` with child elements (the "fields to read" below). Failure: HTTP 500 with
`<s:Fault>...<UPnPError><errorCode>701</errorCode>` (read `errorCode`). Argument order matters; send every listed argument.

| Service | Control path | Service type |
|---|---|---|
| AVTransport | /MediaRenderer/AVTransport/Control | urn:schemas-upnp-org:service:AVTransport:1 |
| RenderingControl | /MediaRenderer/RenderingControl/Control | urn:schemas-upnp-org:service:RenderingControl:1 |
| GroupRenderingControl | /MediaRenderer/GroupRenderingControl/Control | urn:schemas-upnp-org:service:GroupRenderingControl:1 |
| ZoneGroupTopology | /ZoneGroupTopology/Control | urn:schemas-upnp-org:service:ZoneGroupTopology:1 |
| ContentDirectory | /MediaServer/ContentDirectory/Control | urn:schemas-upnp-org:service:ContentDirectory:1 |

Examples below show only the `<u:...>` element; wrap in the envelope above. `InstanceID` is always `0`.

## 1. Discovery
Source: SoCo `soco/discovery.py`, https://sonos.svrooij.io/ (device description), UPnP SSDP.

UDP datagram (CRLF line endings, blank line at end) to 239.255.255.250:1900, from an ephemeral port; replies come unicast to that port.
No multicast join needed for replies. Send 2-3 times 200 ms apart, listen 2-3 s.
```
M-SEARCH * HTTP/1.1
HOST: 239.255.255.250:1900
MAN: "ssdp:discover"
MX: 1
ST: urn:schemas-upnp-org:device:ZonePlayer:1

```
Each speaker answers: `LOCATION: http://192.168.1.20:1400/xml/device_description.xml`, `USN: uuid:RINCON_000E58xxxxxx01400::urn:schemas-upnp-org:device:ZonePlayer:1`,
`X-RINCON-HOUSEHOLD: Sonos_...`. IP = host of LOCATION. UUID = `RINCON_<12 hex>01400`. Bonded/hidden members answer too: do not list from SSDP alone.
Robustness: one reply is enough, because any speaker returns the whole household topology (below). Cache IPs; fallback if UDP multicast is blocked: probe
`GET http://<ip>:1400/xml/device_description.xml` across the /24.

`GET /xml/device_description.xml`: read `device/roomName`, `modelName` (e.g. "Sonos One"), `modelNumber`, `softwareVersion`, `UDN` (uuid:RINCON_...), `serialNum`.

### GetZoneGroupState (any speaker)
```
POST /ZoneGroupTopology/Control   SOAPACTION: "urn:schemas-upnp-org:service:ZoneGroupTopology:1#GetZoneGroupState"
<u:GetZoneGroupState xmlns:u="urn:schemas-upnp-org:service:ZoneGroupTopology:1"></u:GetZoneGroupState>
```
Read `ZoneGroupState`: an XML document escaped as text (unescape once, then parse):
```
<ZoneGroups>
 <ZoneGroup Coordinator="RINCON_AAA01400" ID="RINCON_AAA01400:123">
  <ZoneGroupMember UUID="RINCON_AAA01400" Location="http://192.168.1.20:1400/xml/device_description.xml" ZoneName="Living Room" Icon="" Configuration="1" SoftwareVersion="..." >
    <Satellite UUID="RINCON_SAT01400" Invisible="1" .../>   (home theatre surrounds: child elements, newer firmware writes them as nested ZoneGroupMember)
  </ZoneGroupMember>
  <ZoneGroupMember UUID="RINCON_BBB01400" Location="http://192.168.1.21:1400/..." ZoneName="Kitchen"/>
  <ZoneGroupMember UUID="RINCON_CCC01400" ZoneName="Living Room" Invisible="1" ChannelMapSet="RINCON_AAA01400:LF,LF;RINCON_CCC01400:RF,RF"/>
 </ZoneGroup>
</ZoneGroups>
```
Rules (SoCo `zonegroupstate.py` / node-sonos-ts):
- Group = `ZoneGroup`; coordinator = its `Coordinator` UUID; members = its `ZoneGroupMember`s. Send transport and GroupRenderingControl calls to the coordinator's IP (from that member's `Location`).
- Hide any member with `Invisible="1"` (stereo-pair secondary, subs, home-theatre satellites, bonded). Also hide `IsZoneBridge="1"` (Boost/Bridge). A Sub has `:SW` in ChannelMapSet/HTSatChanMapSet. For a stereo pair both halves have the same `ZoneName`; the non-invisible one is the room.
- Room name = `ZoneName`. A group's display name = names of visible members (coordinator first).
- `VanishedDevices` element (offline) ignore.
- Single-IP lookup: IP = `Location` host.

## 2. Transport (send to the group coordinator; non-coordinators return 701/800)
Source: https://sonos.svrooij.io/services/av-transport. SOAPACTION `"urn:schemas-upnp-org:service:AVTransport:1#<Action>"`.

```
Play     <u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><Speed>1</Speed></u:Play>
Pause    <u:Pause ...><InstanceID>0</InstanceID></u:Pause>
Stop     <u:Stop ...><InstanceID>0</InstanceID></u:Stop>
Next     <u:Next ...><InstanceID>0</InstanceID></u:Next>
Previous <u:Previous ...><InstanceID>0</InstanceID></u:Previous>
Seek time  <u:Seek ...><InstanceID>0</InstanceID><Unit>REL_TIME</Unit><Target>0:01:23</Target></u:Seek>
Seek track <u:Seek ...><InstanceID>0</InstanceID><Unit>TRACK_NR</Unit><Target>3</Target></u:Seek>    (1-based queue position)
```
Seek returns 701 for streams/unsupported content, 711 illegal target. Next/Previous fail with 701 when the source does not allow it.

GetTransportInfo -> `CurrentTransportState` (PLAYING | PAUSED_PLAYBACK | STOPPED | TRANSITIONING), `CurrentTransportStatus` (OK), `CurrentSpeed`.

GetPositionInfo -> `Track` (1-based queue index, 0 for streams), `TrackDuration` (H:MM:SS, "0:00:00" or NOT_IMPLEMENTED for radio),
`TrackMetaData` (escaped DIDL), `TrackURI`, `RelTime` (position), `AbsTime`.
Parse TrackMetaData (unescape once, then XML): `<item>` with `dc:title`, `dc:creator` (artist), `upnp:album`, `upnp:albumArtURI`, `upnp:class`,
and for radio `r:streamContent` (ICY "Artist - Title" line; prefer it for "now playing" on radio). Empty string or `NOT_IMPLEMENTED` is possible: guard.
`albumArtURI` is either relative (`/getaa?s=1&u=x-sonos-spotify%3aspotify%253atrack...`: prefix `http://<speaker ip>:1400`) or absolute (`https://i.scdn.co/...`). The XML parser decodes `&amp;` for you.
Interpolate RelTime locally between polls.

GetMediaInfo -> `NrTracks`, `CurrentURI`, `CurrentURIMetaData` (escaped DIDL; for a radio station `dc:title` is the station name), `NextURI`, `PlayMedium`.
For queue playback `CurrentURI` is `x-rincon-queue:RINCON_...#0`; the track itself is in GetPositionInfo.

SetPlayMode: `<InstanceID>0</InstanceID><NewPlayMode>X</NewPlayMode>`, X in NORMAL | REPEAT_ALL | REPEAT_ONE | SHUFFLE_NOREPEAT | SHUFFLE (shuffle + repeat all) | SHUFFLE_REPEAT_ONE. 712 on a non-coordinator.
GetTransportSettings -> `PlayMode` (same values), `RecQualityMode`. shuffle = starts with SHUFFLE; repeat = ends REPEAT_ALL / is SHUFFLE; repeat-one = REPEAT_ONE / SHUFFLE_REPEAT_ONE.
GetCurrentTransportActions -> `Actions` (see section 7).

## 3. Volume
Source: https://sonos.svrooij.io/services/rendering-control, /services/group-rendering-control.

Per speaker (send to that member's own IP, any member incl. followers):
```
GetVolume /MediaRenderer/RenderingControl/Control  "urn:schemas-upnp-org:service:RenderingControl:1#GetVolume"
 <u:GetVolume xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1"><InstanceID>0</InstanceID><Channel>Master</Channel></u:GetVolume>   -> CurrentVolume 0..100
SetVolume ... <InstanceID>0</InstanceID><Channel>Master</Channel><DesiredVolume>30</DesiredVolume>
GetMute   ... <InstanceID>0</InstanceID><Channel>Master</Channel>  -> CurrentMute 0|1
SetMute   ... <InstanceID>0</InstanceID><Channel>Master</Channel><DesiredMute>1</DesiredMute>
```
Group (send to the coordinator, `/MediaRenderer/GroupRenderingControl/Control`, type `urn:schemas-upnp-org:service:GroupRenderingControl:1`):
```
GetGroupVolume          <InstanceID>0</InstanceID>                         -> CurrentVolume
SetGroupVolume          <InstanceID>0</InstanceID><DesiredVolume>35</DesiredVolume>
SetRelativeGroupVolume  <InstanceID>0</InstanceID><Adjustment>5</Adjustment>   (-100..100) -> NewVolume
SnapshotGroupVolume     <InstanceID>0</InstanceID>
GetGroupMute / SetGroupMute (<DesiredMute>)
```
SnapshotGroupVolume records each member's volume ratio; Sonos apps call it when a slider drag starts so group changes scale members proportionally.
Without a snapshot the group call may use a stale or no ratio: call Snapshot before a SetGroupVolume/SetRelativeGroupVolume burst **[TEST]**. Group volume is rounded-average of members; reading it per poll is cheap.
If the user only needs one slider, SetGroupVolume after a Snapshot is the simplest.

## 4. Grouping
Source: SoCo `core.py` `join`/`unjoin`/`partymode`; https://sonos.svrooij.io/services/av-transport.

- Join speaker J to the group of coordinator C: send to **J**:
```
<u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><CurrentURI>x-rincon:RINCON_CCC01400</CurrentURI><CurrentURIMetaData></CurrentURIMetaData></u:SetAVTransportURI>
```
  J drops its own queue/playback and follows C (J's own volume is kept). Target C must be a coordinator (use the group's coordinator UUID, not a follower's).
- Leave: send to the member `<u:BecomeCoordinatorOfStandaloneGroup xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:BecomeCoordinatorOfStandaloneGroup>` (response has `DelegatedGroupCoordinatorID`, `NewGroupID`). If the leaver is the coordinator, Sonos hands coordination to another member and playback continues there.
- Party mode: every other visible speaker joins one chosen coordinator (SoCo loops `join`). Re-fetch ZoneGroupState afterwards (takes ~1 s to settle).

## 5. Favorites
Source: SoCo `music_library.get_sonos_favorites` / `core.py` `__get_favorites` (Browse `FV:2`), node-sonos-http-api `lib/actions/favourite.js`, `lib/helpers/`.

```
Browse  POST /MediaServer/ContentDirectory/Control  "urn:schemas-upnp-org:service:ContentDirectory:1#Browse"
<u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1"><ObjectID>FV:2</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>dc:title,res,dc:creator,upnp:artist,upnp:album,upnp:albumArtURI,r:resMD</Filter><StartingIndex>0</StartingIndex><RequestedCount>100</RequestedCount><SortCriteria></SortCriteria></u:Browse>
```
Response: `Result` (escaped DIDL), `NumberReturned`, `TotalMatches`, `UpdateID`. Page with StartingIndex until TotalMatches reached. Any speaker answers.
Each `<item id="FV:2/NN">` has: `dc:title`; `res` (the playable URI; `protocolInfo` varies); `upnp:albumArtURI` (relative `/getaa?...` or absolute); `upnp:class` (`object.itemobject.item.sonos-favorite`); `r:type` (instantPlay / shortcut); `r:description` (service name); and **`r:resMD`**: an escaped DIDL-Lite document for the real object. After your XML parser reads the text node of `r:resMD` you hold a DIDL string; that string is the metadata to send back verbatim (it is escaped once more automatically when placed into the SOAP body). Real class is in resMD's `upnp:class`.

Play decision (jishi: URI prefix test; SoCo/ts: class test):
1. Single stream (`res` starts with `x-sonosapi-stream:`, `x-sonosapi-radio:`, `x-sonosapi-hls:`, `x-sonosapi-hls-static:`, `x-rincon-mp3radio:`, `aac:`; resMD class `object.item.audioItem.audioBroadcast`): to the coordinator
   `SetAVTransportURI(CurrentURI=res, CurrentURIMetaData=resMD)` then `Play`.
2. Container (playlist/album/artist-radio: `res` like `x-rincon-cpcontainer:1006206c...spotify%3aplaylist%3a...`; resMD class `object.container.*`): needs the queue:
```
RemoveAllTracksFromQueue   <InstanceID>0</InstanceID>      (error 804 if already empty: ignore)
AddURIToQueue   <InstanceID>0</InstanceID><EnqueuedURI>{res}</EnqueuedURI><EnqueuedURIMetaData>{resMD}</EnqueuedURIMetaData><DesiredFirstTrackNumberEnqueued>0</DesiredFirstTrackNumberEnqueued><EnqueueAsNext>1</EnqueueAsNext>
SetAVTransportURI  <InstanceID>0</InstanceID><CurrentURI>x-rincon-queue:RINCON_COORD01400#0</CurrentURI><CurrentURIMetaData></CurrentURIMetaData>
Play  (Speed 1)
```
   AddURIToQueue returns `FirstTrackNumberEnqueued`, `NumTracksAdded`, `NewQueueLength`. Optionally `Seek TRACK_NR 1` before Play. Shuffle: SetPlayMode before Play.
3. Single track favorite (`x-sonos-spotify:`, `x-sonos-http:`, `x-file-cifs:`): queue path as in 2 (enqueue, then x-rincon-queue).
Spotify/Apple/Amazon favorites only play if the account is linked in the Sonos household; otherwise 800/714 or silent fail.

`R:0/0` (radio favorites "My Radio Stations"): same Browse call with `ObjectID R:0/0`; items id `R:0/0/N`, `res` = `x-sonosapi-stream:sNNNN?sid=254&flags=8224&sn=0`, class `object.item.audioItem.audioBroadcast`; play like case 1 using the item itself as metadata
(build DIDL from the item). On S2 it is often empty or stale because the app now stores stations as favorites: treat FV:2 as authoritative, R:0/0 as optional. Other roots: `Q:0` queue, `SQ:` Sonos playlists, `R:0/1` radio shows.

## 6. Arbitrary internet radio stream (radio-browser.info)
Source: SoCo `core.py` `play_uri(force_radio=True)` (replaces everything before the first `:` with `x-rincon-mp3radio`), docstring: newer firmware rejects plain `http:`/`https:` URIs for radio.

```
CurrentURI:  x-rincon-mp3radio://stream.example.com:8000/live.mp3       (the http URL with "http" replaced; keep host:port/path/query)
CurrentURIMetaData: the DIDL below (escaped once in the SOAP body)
then Play
```
- Use radio-browser `url_resolved` (already de-referenced from .pls/.m3u). Playlist files (.pls/.m3u/.asx) must be resolved by you.
- Formats: MP3 and AAC/AAC+ in ADTS (plain HTTP/ICY streams) work through `x-rincon-mp3radio://` despite the name. Some AAC stations are known to need `aac://http://host/path` instead **[TEST]**. HLS (.m3u8) is NOT reliably playable with this scheme; Sonos plays HLS only through its service URIs (`x-sonosapi-hls*`). Treat m3u8 as unsupported, prefer another stream of the same station (radio-browser `hls=0` filter). Ogg/Opus streams: unsupported or flaky; prefer `codec=MP3|AAC`.
- https: the scheme swap drops the "https", so Sonos would connect with plain HTTP on the given port. For https-only stations the working form is unverified: try (a) an http alternative from radio-browser, (b) `x-rincon-mp3radio://https://...` is NOT known to work, (c) `x-rincon-mp3radio://host/path` and see whether the speaker negotiates TLS **[TEST]**. Plan: prefer http URLs, fall back to a relay on a LAN HTTP server if only https exists.
- Wrong/unsupported -> SetAVTransportURI succeeds but `Play` fails 714 (illegal MIME/scheme) or state goes STOPPED; re-check GetTransportInfo ~2 s after Play.
- Metadata so the station name shows (SoCo template, id `R:0/0/0`, TuneIn service tag):
```
<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"><item id="R:0/0/0" parentID="R:0/0" restricted="true"><dc:title>Station Name</dc:title><upnp:class>object.item.audioItem.audioBroadcast</upnp:class><desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">SA_RINCON65031_</desc></item></DIDL-Lite>
```
Escape `Station Name` for XML first. Empty metadata also plays but the app shows the URL. Stream-title updates (ICY) appear in `r:streamContent` of GetPositionInfo.

## 7. Recognising the source (use GetMediaInfo.CurrentURI, plus GetPositionInfo.TrackURI)
Source: SoCo `soco/core.py` (`is_playing_radio/line_in/tv`), node-sonos-http-api.

| CurrentURI prefix | Source | Notes |
|---|---|---|
| (empty) and STOPPED, NrTracks 0 | Idle | nothing to resume |
| `x-rincon-queue:RINCON_X#0` | Queue (Spotify via Sonos, library, playlists) | TrackURI shows the item: `x-sonos-spotify:spotify%3atrack%3a...`, `x-sonos-http:`, `x-file-cifs:` |
| `x-sonos-vli:RINCON_X:N,spotify:<hash>` | Spotify Connect | controlled by the Spotify app; Next/Previous/Seek often absent; GetPositionInfo metadata works |
| `x-sonos-spotify:` (as CurrentURI) | Spotify single item via Sonos | |
| `x-rincon-mp3radio://`, `aac://`, `x-sonosapi-stream:`, `x-sonosapi-radio:`, `x-sonosapi-hls:` | Radio / stream | no duration, no seek; name from CurrentURIMetaData `dc:title` |
| `x-rincon-stream:RINCON_X` | Line-in | |
| `x-sonos-htastream:RINCON_X:spdif` (or `:hdmi`) | TV (soundbar) | |
| `x-rincon:RINCON_COORD` | This speaker is a follower: send transport calls to the coordinator | |

Allowed actions: `GetCurrentTransportActions` -> `Actions`, comma list from `Set, Stop, Pause, Play, X_DLNA_SeekTime, Next, Previous, X_DLNA_SeekTrackNr`.
Hide/disable buttons not present (typical: radio has no Next/Previous/Seek; Pause may be absent, use Stop; TV/line-in have little). Sent to a non-coordinator it returns only `Start, Stop`.

## 8. Events vs polling
Eventing (SUBSCRIBE with CALLBACK header, NOTIFY) needs an HTTP listener on the client; mentioned only, not usable here. Subscriptions expire (renew).
Polling for a wall remote: only the visible/selected group's coordinator.
- Playing: `GetPositionInfo` every 1-2 s (gives track change, position, metadata in one call); interpolate RelTime in between.
- `GetTransportInfo` every 2 s, or every 1 s when the screen shows play/pause (cheap, ~400 bytes). When PAUSED/STOPPED slow to 3-5 s.
- `GetZoneGroupState` every 10-30 s and after every group/volume action. `GetGroupVolume` ~every 2-5 s (or after your own write). `GetMediaInfo` only when TrackURI/source changes.
- Cost: each call is one small HTTP/1.1 POST, a few ms on a LAN, ~1 KB. 1-2 calls per second to one speaker is negligible. Do not poll hidden rooms; keep one request in flight per device; timeout 3-5 s (speakers sometimes take >2 s while TRANSITIONING).
- Give the UI the optimistic value after a command and reconcile on the next poll.

## 9. XML escaping
- SOAP argument values are XML text: escape `& < > "` (`&amp; &lt; &gt; &quot;`). A DIDL string (CurrentURIMetaData, EnqueuedURIMetaData) is therefore sent escaped as a whole: `&lt;DIDL-Lite xmlns:dc=&quot;...&quot;&gt;...`.
- URIs in `CurrentURI` containing `&` (x-sonosapi-stream ... `?sid=254&flags=8224&sn=0`) must be `&amp;` in the body.
- Responses: `Result`, `TrackMetaData`, `CurrentURIMetaData`, `ZoneGroupState` are text nodes containing escaped XML: parse the SOAP, take the text, parse that again. `r:resMD` is escaped inside the already-parsed DIDL: one more text read, and you get a DIDL string to forward unchanged.
- Never double-escape a resMD you re-send: take the parsed text, put it in the argument, escape once.
- Titles with `&`/non-ASCII: send UTF-8, declare `charset="utf-8"`.

## 10. Pitfalls
- Header must be `Content-Type: text/xml; charset="utf-8"` and `SOAPACTION: "type#Action"` including the double quotes. Wrong/missing -> 400/500.
- HTTP 500 is the normal error carrier; parse `errorCode`. 401 = invalid action, 402 = invalid args, 701 = transition not available (non-coordinator, or action not allowed in this state/source), 702 no content, 711 illegal seek target, 712 play mode not supported (non-coordinator), 714 illegal MIME type / unsupported URI scheme (typical for `http://` radio on new firmware), 715 content busy, 716 not found, 718 invalid InstanceID, 737-739 DNS/server error on the stream, 800 not supported / not coordinator, 804 RemoveAllTracksFromQueue on empty queue (ignore).
- Always resolve the current coordinator from fresh ZoneGroupState before transport/grouping/GroupRenderingControl calls; after join/leave the cache is stale.
- Followers still answer RenderingControl (their own volume) but not AVTransport.
- Queue favorites: forgetting `x-rincon-queue:...#0` after AddURIToQueue leaves the speaker on the old source.
- `SetAVTransportURI` + `Play` immediately can return 701 on slow streams; retry Play after ~500 ms.
- Not every speaker is reachable on UDP multicast (VLAN, Wi-Fi isolation): keep a manual IP fallback.
- S2: UPnP on 1400 is still served (checked against documentation, not a live device in this write-up); the Sonos Radio/TuneIn favorites live under FV:2; legacy S1-only music services (service ids) are gone; do not rely on `R:0/0`.
- Connections: send `Connection: close` or reuse carefully; Sonos closes idle sockets. Limit concurrent requests per speaker.
