# Notification relay: the Mac's notifications on the music tablet

Date: 2026-10-17. Asked by the owner for examples/music on the Nexus 7 ("je te laisse gérer"). Coordinator's design; the agents of
ZN-755 to ZN-758 refine it and record what they change in their task notes.

## What the owner wants

- The tablet (examples/music, kiosk) shows the Mac's notifications as they arrive, with the app's icon, title, body, over any view, with an
  animation, and wakes its screen to show them.
- A slide of the tablet's carousel lists the last notifications, well presented, with a button to clear the list.
- A small macOS app lives in the menu bar (tray), runs in the background, catches notifications on the fly (all their fields and the app's
  icon) and sends them to the tablet. Its settings list every app that has sent a notification so far: each can be allowed or blocked
  (an app can also be added and blocked before it sends anything). Browser notifications show the site's domain, and a domain can be
  blocked, so a notification may show on the Mac and not on the tablet.
- Discovery and pairing in the manner of `zinc agent`: the tablet announces itself, the Mac app finds it, the tablet shows a code, the user
  types it on the Mac. A step-by-step assistant on the tablet's notification slide starts the pairing and shows the code. Without
  discovery (a network that blocks multicast), the user types the tablet's address; across networks, a relay through WebRTC.
- The screen: off after a delay; on the clock slide, off after 2 minutes, then woken every 5 minutes for a moment (iOS StandBy's manner),
  plus the wakes of notifications.
- Weather: the city chosen in the settings through a search field and a list of results (a combobox).

## Shape

| Piece | Where | Task |
|---|---|---|
| `zinc:link`: discovery, pairing, an encrypted channel between two Zinc programs | plugins/link (C++ host part on the agent's code: mDNS from mjansson/mdns, TLS EC J-PAKE and later TLS with pinned keys from mbedTLS), Android through the D127 plugin model where Java is needed (NsdManager or a MulticastLock) | ZN-756 |
| The relay app for macOS | examples/notify-relay (zinc:system tray, background, settings window; capture of notifications) | ZN-757 |
| The tablet's side | examples/music: overlay, notification slide, pairing assistant, wake | ZN-758 |
| Weather city search and the screen schedule | examples/music | ZN-755 |

`zinc:link` is a plugin of its own because the same need comes back (a phone remote, a game controller on a phone, Zinc Go's dev link,
the Studio): two Zinc programs that find each other, pair once with a short code, then talk over an authenticated, encrypted channel.

## zinc:link (first version, ZN-756)

- **Announce**: `link.advertise({ service: "notify", name: "Nexus 7 · Musique" })`: mDNS / DNS-SD `_zinclink._tcp`, TXT `id` (a
  public-key hash), `svc`, `name`, `pair` (1 while a pairing is open). Android answers queries only with a WifiManager MulticastLock
  (permission CHANGE_WIFI_MULTICAST_STATE) or through NsdManager: pick one by measure on the Nexus 7.
- **Browse**: `link.browse("notify", onFound)` gives `{ id, name, host, port, pairing }` as they appear and go.
- **Pair**: the advertiser calls `link.openPairing()`, which returns a 6-digit code it shows; the other side calls
  `link.pair(peer, code)`. Same protocol as `zinc agent` (TLS 1.2 EC J-PAKE with the code as the password, three tries, five minutes, one
  peer per code); success exchanges long-term keys stored in the program's storage (zinc:sys storage), so later connections are TLS with
  pinned keys and no code.
- **Connect**: `link.connect(peer)` / `link.onConnection(cb)` give a channel: `send(obj)` (JSON) and `sendBytes(type, bytes)`,
  `onMessage`, `onClose`; reconnects by itself while both are paired.
- **No discovery**: `link.pair({ host, port }, code)` with an address typed by the user (the tablet shows its address on the assistant).
- **Across networks**: WebRTC data channel (zinc:webrtc, D131) with the pairing done the same way through a small signalling exchange;
  a later step, recorded in the task notes if not done.

## The relay protocol (over a zinc:link channel)

```text
mac -> tablet  { "t": "hello", "app": "notify-relay", "v": 1, "host": "MacBook de Guillaume" }
mac -> tablet  { "t": "notif", "id": "...", "app": { "id": "com.apple.mail", "name": "Mail", "icon": "<sha256>" },
                 "title": "...", "subtitle": "...", "body": "...", "date": 1760700000, "domain": "github.com" | null, "thread": "..." }
mac -> tablet  { "t": "icon", "hash": "<sha256>", "png": "<base64, 128 px>" }      # sent once, cached by hash on the tablet
tablet -> mac  { "t": "need-icon", "hash": "..." }                                   # after a cache miss
tablet -> mac  { "t": "mute", "app": "com.example" } | { "t": "mute", "domain": "example.com" }   # from a notification on the tablet
mac -> tablet  { "t": "clear" }                                                      # optional
```

Additions of 2026-10-17 (owner, agreed between ZN-757 and ZN-758; the tablet's side is examples/music/src/notify.ts):

```text
mac -> tablet  notif gains  "kind": "message" | "other"     # the Mac decides; a message plays with the sender's avatar
                            "sender": "..."                 # who wrote, for a message (absent otherwise)
                            "avatar": "<sha256>" | null     # an image like the icons: {t:"icon",hash,png} and {t:"need-icon",hash}
tablet -> mac  { "t": "ack", "id": "<notif id>" }           # sent once the notif is stored (the Mac's assistant proves the path with it)
tablet -> mac  { "t": "open", "id": "<notif id>" }          # the notification was touched (overlay or list): open it on the Mac
```

What the tablet does with them (ZN-758):

- Every field may be missing or null: missing strings are empty, `kind` other than `"message"` is `"other"`, a missing `date` is the time
  of arrival. `id` identifies a notification: the same id again replaces it in the list. Hashes are hex (8 to 128 characters; anything
  else is ignored, since they name files); a PNG is at most about 300 kB of base64.
- `need-icon` is sent once per hash and session for `app.icon` and for `avatar`, after the `ack`. An icon is shown as a rounded square, an
  avatar as a circle: 128 px is enough for an icon, an avatar is drawn up to 210 px wide on the StandBy overlay (256 px recommended).
- A message shows the sender and the avatar (initials on a tint when there is none) with the app's icon as a badge; another notification
  shows its title and the app's icon. `subtitle` is joined to `body` with " · " for those; a message shows `body` alone.
- The tablet sends nothing else: no hello, no `mute` yet (later.md).

Filtering happens on the Mac (the source of truth: the app list and the domain list live in the relay app's settings); a mute from the
tablet is a shortcut that adds to the Mac's list.

## Catching the Mac's notifications (ZN-757: verify first)

macOS has no public API to read other apps' notifications. The known ways: read Notification Center's database
(`~/Library/Group Containers/group.com.apple.usernoted/db2/db`, SQLite, a binary plist per record: app bundle id, title, subtitle, body,
date), which needs Full Disk Access for the relay app; or watch the notification banners through the Accessibility API (Accessibility
permission). Browser notifications: Chrome and Safari web push carry the site in the record (to verify: subtitle, a field, or a separate
"app" per site). The agent verifies on this Mac (macOS 15.7), picks the reliable way, and documents the permission the user grants once,
with the relay app's first-run assistant pointing to the right System Settings pane. Icons: NSWorkspace's icon of the app's bundle,
rendered to a 128 px PNG.

What ZN-757 found and chose (2026-10-17, macOS 15.7): the database. Its path, its WAL journal and its schema are in usernoted itself
(`strings /usr/sbin/usernoted`: `group.com.apple.usernoted`, `db2/`, `PRAGMA journal_mode = WAL;`, the `CREATE TABLE` statements of
`app`, `record`, `dbinfo`, `requests`, `delivered`, `displayed`, `snoozed`, `categories`, and the plist keys `titl`, `subt`, `body`,
`thre`, `iden`, `cate`, `date`, `req`), which agrees with mac_apt's and Plaso's parsers. Opening it from this machine's agent session
fails with EPERM: the permission is Full Disk Access. The Accessibility way was dropped: it sees only banners shown on screen, gives no
bundle id and depends on a private view tree. How it is read, the browsers' sites and the first-run assistant:
[examples/notify-relay/README.md](../../examples/notify-relay/README.md). Not checked yet: real web-notification records of Chrome,
Firefox and Safari on this Mac (the relay could not open its database here), see the task's notes.

## The tablet (ZN-758, ZN-755)

- A notification arrives (owner 2026-10-17, two looks, no setting):
  - On the clock slide, or when the screen was off (it wakes, window brightness back, D122): StandBy's overlay. The view is dimmed by a
    black veil and the notification plays as one zinc:gsap timeline: centred, the round image (the sender's avatar with the app's badge,
    or the app's icon) with the name and the app below; at 2.2 s it shrinks to the left while the time, who it is from and the excerpt
    (two lines) come in, staggered; it holds, fades at 9.4 s, and the next of the queue plays at 10 s; the overlay closes when the queue
    is empty.
  - Elsewhere, the screen on (player, settings, the list): iOS's grey cards slide in at the top over a strong dim, several stack, each
    leaves after 6 s; a touch beside them sends them away.
  - A touch on a notification (overlay, card or row of the list) opens it on the Mac (`open`). A white card was tried and dropped ("c'est
    moche en blanc").
- The notification slide of the carousel: the last N (50) notifications grouped by app, newest first, relative times, swipe to delete
  one, a button to clear all; when not paired, the pairing assistant in its place: step 1 "Install Zinc Relay on your Mac" (how), step 2
  the code and the tablet's address in large type, step 3 waiting, then done; a link "No discovery on your network?" shows the address to
  type.
- Screen schedule: the existing delay (settings) everywhere; on the clock slide, off after 2 minutes, then a wake of a few seconds every
  5 minutes, StandBy's way; notifications wake it too.
- Weather city: in the settings, a search field that queries Open-Meteo's geocoding API (free, no key) as the user types (debounced),
  a list of results (city, region, country, flag), choosing one stores lat/lon/city in config.json.
