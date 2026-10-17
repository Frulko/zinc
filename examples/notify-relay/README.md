# Zinc Relay

Your Mac's notifications on your tablet. Zinc Relay lives in the menu bar (no Dock icon). It reads each notification as Notification
Center delivers it: the app and its icon, the title, subtitle, body, date and thread, the site of a web notification, and the sender's
picture for a message. It sends them to the tablet you paired, except the apps, the sites and the Focus modes you hold back. The tablet's
side is [examples/music](../music), with the overlay and the notifications slide. The protocol is in
[the design](../../docs/reports/notification-relay-design.md).

```sh
zinc --background run examples/notify-relay        # a dev bundle: ~/.zinc/cache/macos/devapp/dev.zinc.notify-relay.app
zinc run examples/notify-relay -- --inspect 20     # the shape of the 20 newest records: keys, types, sizes, never a value
zinc build --bundle examples/notify-relay/main.tsx -o "Zinc Relay.app"
```

The owner allows private APIs for this app (2026-10-17): it is not meant for the App Store. None is used so far, because the record's own
property list holds what the relay needs. Each call that a macOS update could change is guarded, and the relay falls back to the next
source. Everything below was checked on macOS 15.7 (24G).

## The menu bar

A click on the icon opens the menu:

- the tablet's state: "Tablette : Nexus 7 (connectée)", "absente", or "Non appairé";
- "Concentration : Travail" while a Focus is on;
- "Retenues : N en pause, M par la concentration";
- "Accès complet au disque requis…" while the permission is missing;
- "Appairer <tablette>…" for each tablet on the network that shows a pairing code;
- "Entrer l'adresse de la tablette…" while none is paired;
- **Ouvrir Zinc Relay…** (the window, hidden until asked for), **Réglages…**, **Assistant de configuration…**;
- **Envoyer une notification de test**, with two choices:
  - **Directement à la tablette**: a made-up notification sent straight over the channel; the tablet acknowledges it with `ack`;
  - **Via macOS (de bout en bout)**: a real macOS notification that the capture reads back and relays (see "The assistant", step 7);
- **Mettre en pause**, then **Quitter**.

For scripts, `kill -USR1 <pid>` toggles the pause and `kill -USR2 <pid>` sends the direct test.

## The assistant

It opens on the first launch, and again whenever Full Disk Access is missing or an optional step was neither granted nor passed. A login
start (`--hidden`) opens it only when Full Disk Access is missing. Every step polls once a second and ticks itself the moment the
permission is granted, with no restart.

| Step | Why | How | Proven on this Mac |
|---|---|---|---|
| 1. Accès complet au disque (required) | the notification database, Messages' `chat.db`, the Focus files | opens `x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles`, shows the app's path, and "Montrer dans le Finder" so the app can be dragged into the list | the probe: `open()` fails with EPERM (not granted here) |
| 2. Contacts (optional) | the sender's photo | `CNContactStore requestAccessForEntityType`; once denied, the `Privacy_Contacts` pane; `NSContactsUsageDescription` comes from the `contacts` permission of zinc.json | status read (`undetermined`); the prompt was not shown |
| 3. Réseau local | macOS 15 asks before an app reaches the LAN, and zinc:link's discovery needs it | the browse triggers the prompt; the step sends mDNS's question for `_zinclink._tcp` and reads `EHOSTUNREACH` as a denial (the fallback is the `Privacy_LocalNetwork` pane) | `ok` |
| 4. Notifications (optional) | to post the end-to-end test | `UNUserNotificationCenter requestAuthorization`; without it the test posts through `osascript` | status read (`undetermined`) |
| 5. Appairer la tablette | the code that the tablet's assistant shows | the Tablette page | with the test tablet |
| 6. Lancer à l'ouverture de session | start with the Mac, in the menu bar only | `SMAppService.mainApp`; when the system refuses it for an ad-hoc signed bundle, a LaunchAgent (zinc:system/autostart, `--hidden`) | status read (`not found` for the dev bundle) |
| 7. Test de bout en bout | the whole chain at once | posts a real notification carrying a marker; the capture recognises the marker, relays it, and the tablet's `ack` ticks the step ("envoyée", "lue", "reçue par la tablette") | needs step 1 (see "What the owner does once") |

The banner-capture avatar source (Accessibility plus Screen Recording) is not built. Its optional step would come with it.

## How it reads the notifications

macOS has no public API that lets an app read other apps' notifications. Notification Center, the `usernoted` daemon, keeps them in a
SQLite database, and Zinc Relay reads it:

- **Where.** `~/Library/Group Containers/group.com.apple.usernoted/db2/db` on macOS 15 and later. On macOS 10.13 to 14 it is `$(getconf DARWIN_USER_DIR)/com.apple.notificationcenter/db2/db`.
- **Schema.** The `CREATE TABLE` statements in macOS 15.7's `/usr/sbin/usernoted`:
  - `app (app_id INTEGER PRIMARY KEY, identifier VARCHAR, badge INTEGER NULL)`;
  - `record (rec_id INTEGER PRIMARY KEY, app_id INTEGER, uuid BLOB, data BLOB, request_date REAL, request_last_date REAL, delivered_date REAL, presented Bool, style INTEGER, snooze_fire_date REAL)`;
  - `dbinfo`, `requests`, `delivered`, `displayed`, `snoozed` and `categories`.

  The journal mode is WAL.
- **A record.** `data` is a binary property list:
  - `app` (the bundle id), `date`, `req`;
  - inside `req`: `titl`, `subt`, `body`, `thre` (the thread), `iden`, `cate`, `durl` (the default action URL), and keys such as `atta`, `cnta`, `peop`, `srce`, `icon`. The key names come from the strings of usernoted.

  `delivered_date` is in seconds since 2001 (Core Foundation time). `presented` says whether the Mac showed the notification. Foundation's own parser decodes the record (`NSPropertyListSerialization`, in plugins/notifymac); data that is itself a property list, keyed archives included, is decoded too.
- **How.** The relay opens the database read-only, in place, through zinc:sqlite, and never copies it. Once a second it asks for the records whose `delivered_date` is newer than the last one seen. What is there when the relay starts is history and is not sent. Only `record` and `app` are read.
- **Permission.** Full Disk Access. The database is in another app's group container, which macOS protects; without the permission, opening it fails with `EPERM`. The relay probes with a real `open()`, because only an open meets the privacy check.

The alternative is reading the banners through the Accessibility API. It needs the Accessibility permission too, sees only the banners on
screen (not the ones that arrive during a Focus), gives no bundle id, and depends on the banner's view tree, which Apple changes between
releases. The database gives every field and the sender's id.

**Web notifications.** Browsers post them as themselves, so the site is in the text:

- Chrome and the Chromium browsers (Edge, Brave, Arc, Vivaldi, Opera) put the origin in the subtitle (`github.com`). They post alerts through a helper app (`com.google.Chrome.framework.AlertNotificationService`) that Zinc Relay counts as Chrome.
- Firefox puts `via github.com` in the subtitle.
- Safari makes each site an app of its own: an id that starts with `web.` and holds the reversed host, or a push bundle named after the site.

These placements come from the browsers' sources and from the forensic tools that read this database. They were not checked against
real records on this Mac, because the relay could not open its database here, so the relay also looks in the body. It takes the first
host name and drops `www.`.

**Icons.** NSWorkspace gives the icon of the app's bundle, found by its id. The relay draws it into a 128 px PNG and hashes it with
SHA-256. The hash travels with each notification; the PNG goes once per hash and connection, and `need-icon` asks for it again.

## Avatars

A notification from a messaging app (Messages, WhatsApp, Telegram, Signal, Slack, Discord, Messenger, Teams, LINE, Viber, Skype,
FaceTime), or a record that carries an image of someone, has `kind: "message"`, a `sender` (its title, as these apps post them), and an
`avatar`. The avatar is the hash of a 128 px square PNG, ready to be cropped round, sent and cached like the icons. The relay tries these
sources in order and stops at the first that gives an image:

1. **The record.** The relay walks the property list, keyed archives inside it included, for image data (PNG, JPEG, GIF, TIFF, HEIF). It ranks them: a communication context's identity image first (`identity`, `avatar` or `contentImage` in the key path); then the people, the context and the attachments (`cnta`, `peop`, `srce`, `atta`, `image`); then any other image; the `icon` last. It also takes image file paths, and the attachment uuids under `atta`, found in Notification Center's attachment store (`.../usernoted/attachments`, `com.apple.notificationcenter/attachments`).
2. **Messages.** The handle (phone or email) of the incoming message nearest the notification's time, within a minute, in `~/Library/Messages/chat.db` (`message.date` is in nanoseconds since 2001). Then that contact's photo from Contacts.
3. **Contacts by name.** The contact whose full name is exactly the sender's, else the only contact the name matches.
4. **A monogram.** The initials ("AM", "#" for a number) on one of eight iOS-like gradients, picked by a hash of the name. The tablet never shows an empty avatar.

A picture found for a sender is kept for the run. Source 1 is proven with a made-up record (an identity image in `cnta`) and source 4
by the tests. Sources 2 and 3 run only once Contacts is granted, which is not the case here, so they are not proven yet. Real records
of Messages or WhatsApp were not read: where macOS 15 puts their pictures is to be learnt with `--inspect` (see below). WhatsApp's own
cache and the banner capture are not built (`later.md`).

## Focus

The relay reads the active mode from the DoNotDisturb daemon's files, which Full Disk Access makes readable:

- `~/Library/DoNotDisturb/DB/Assertions.json` lists the modes turned on (`storeAssertionRecords[].assertionDetails.assertionDetailsModeIdentifier`);
- `ModeConfigurations.json` lists every mode with its name.

It reads them every three seconds. `INFocusStatusCenter` was not used: it says only "focused or not", and only to an app with the
Communication Notifications entitlement. Scheduled modes are counted only if they write an assertion, which was not checked here.

The setting **Pendant un mode Concentration** has three choices:

- **Relayer quand même**, the default: the tablet is often where one looks while the Mac is quiet;
- **Ne pas relayer**;
- **Suivre le mode**: relay what the Mac showed despite the mode, meaning `presented` is 1 in the record. That covers the apps and people the mode allows and time-sensitive notifications.

Each mode can override the choice, for example Sommeil: Ne pas relayer, Travail: Relayer. The menu counts what the Focus held back.

## The settings

- **Applications.** Every app that sent a notification, with its icon, name, bundle id, count and when it was last seen, each relayed or blocked. "Bloquer une app…" picks an app in /Applications to block before it sends anything.
- **Sites.** The sites of web notifications, relayed or blocked. A blocked site blocks its subdomains. A field blocks a site ahead of time.
- **Concentration.** The Focus choices above.
- **Tablette.** The paired tablet and its state, the counts, the tablets that discovery finds, the 6-digit code the tablet shows, the address to type when discovery finds nothing, and "Oublier cette tablette".

The tablet can send back:

- **mute** (`{ t: "mute", app }` or `{ t: "mute", domain }`): blocks that app or site here.
- **open** (`{ t: "open", id }`): opens the app as a click on the notification would. NSWorkspace opens the record's `durl` with its app, else activates the app. The last 50 relayed ids are kept for this. A run with `ZINC_BACKGROUND=1` (tests) only reports the open, so it never takes the focus.

Everything is kept in `~/Library/Application Support/Zinc Relay/settings.json`, and the tablet's key in `~/.zinc/link/Zinc Relay.keys`.
While the tablet is away, the last 100 notifications wait and go when it is back.

## Privacy

The notifications are read, filtered and sent over zinc:link's encrypted channel to the paired tablet only. Nothing of their text,
their senders or their pictures is logged or written to disk. The settings keep only the apps' ids and names, the sites, the Focus
choices and counts. `--inspect` prints the records' key paths, types and sizes, never a value.

## What the owner does once

1. Run `zinc run examples/notify-relay`. The assistant opens.
2. Step 1: **Ouvrir les Réglages** opens System Settings > Privacy & Security > Full Disk Access. Turn on **Zinc Relay**, or press **+**, then press Cmd+Shift+G and type `~/.zinc/cache/macos/devapp/dev.zinc.notify-relay.app`. macOS may ask to quit and reopen the app.
3. Steps 2 and 4: **Autoriser** (Contacts, Notifications). Step 3 asks by itself the first time the app looks for a tablet.
4. Step 6: tick it to start at login.
5. Pair the tablet (step 5), then press **Envoyer la notification de test** (step 7). It must end on "reçue par la tablette".
6. To learn where macOS 15 keeps the avatars, run `zinc run examples/notify-relay -- --inspect 30` after a few messages arrive, and keep the output. It holds key paths, types and sizes, no content.

## Scripts and tests

| Variable or flag | Effect |
|---|---|
| `RELAY_DB` | reads another notification database (the test's fixture) |
| `RELAY_FOCUS_DIR` | reads another directory of Focus files |
| `RELAY_MESSAGES_DB` | reads another `chat.db` |
| `RELAY_ATTACHMENTS` | reads another attachment store |
| `RELAY_DIR` | keeps the settings elsewhere |
| `RELAY_OPEN=Applications` | opens the window on that page |
| `RELAY_CODE` | pairs without the window: with `RELAY_ADDR=host:port`, or else with the first tablet found that has a pairing open |
| `LINK_SERVICE`, `LINK_STORE` | as in zinc:link |

The tests:

- `next/tests/t0/notify_relay_unit.sh` runs `tests/unit.ts`: the image sources of a record, the monogram, the sites, the filters with the Focus policies, and the Focus files.
- `next/tests/t1/notify_relay.sh` drives the whole app against a fixture of the real schema and a test tablet on this machine.
