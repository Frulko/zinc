# music-tree parity with music

Read-only inventory, 2026-10-19. Goal: port the changes made to `examples/music` after music-tree was copied from it.

## Fork point

music-tree was written from `examples/music` at **82da1f8e** ("fade the screen out before sleep and in on wake", 2026-10-17 14:43 +0200), the last music commit of 10-17. The next music commit is 10950ed8 (10-18 09:06). music-tree's files are dated 10-17 19:25 to 10-18 00:26 (README 00:27, config.json 08:19).

Evidence (music-tree has everything up to 82da1f8e and nothing after):

| Fork-era commit | Feature | music-tree |
|---|---|---|
| 82da1f8e | screen fade out/in | `src/core/screen-power.ts:26,47,160` (FADE_DURATION_SECONDS, remainingFadeOutSeconds, veil) |
| 876bcffa | sleeping screen lit for notifications | `screen-power.ts:11,42` (peek, peeking); `main.ts:757,929` |
| 0fbd94de | Mac notifications, StandBy overlay, pairing | `services/notify-service.ts:422,552`; `components/notification-overlay.ts:60`; `pages/home/notifications-slide.ts` |
| c8ec3627 | battery in status bar | `state.ts:167`, `components/status-bar.ts:51`, `settings-page.ts:123` |
| c5b3b393 | weather town search, StandBy schedule env | `pages/settings/city-search-page.ts`, `services/weather-service.ts:61,90`, `screen-power.ts:20-26` (ZINC_MUSIC_STANDBY) |
| 101f1d80 | spotify shared login (plugin) | plugin only, nothing to port |
| e2eb12d6 | rooms/group volumes follow live | `state.ts:480,498` (pollAllRoomVolumes, pollActiveGroupMemberVolumes) |
| f0319cf2, fe495da3.. | gsap, lava lamp | `main.ts:46`, `state.ts:40,190` |

Absent from music-tree (all post-fork): `emoji`/`￼`/`attachment` (0 hits in `src/`), `wheel`/`scrollDX` (0), `glances`/`setNotificationsShown` (0), `Login`/`sharedLoginFile`/`openUrl`/`queueSpotify`/`transfer`/`trackRadio`/`spotifyWhy` (0), `startTextInput` (0). zinc.json is identical to the fork's except `name` and `app.id`/`app.name`.

music-tree is NOT in the music git history (untracked), and nothing in `tests` points at it (`music_notify.sh`, `music_city_standby.sh` use `examples/music`).

## Commits after the fork

Music-touching commits after 82da1f8e, oldest first. "Plugin" = already shared by both demos (plugins/ and examples/notify-relay are not part of either demo); only the app part is listed.

| commit | feature (user-visible) | in music-tree? | target files in music-tree | size | depends on |
|---|---|---|---|---|---|
| 10950ed8 | Mac relay sends emoji as PNGs; tablet draws them inline in notification title/body (`drawInline`, `wrapInline`, `emoji[]`, `￼`) | no | `services/notify-service.ts` (MacNotification class :31, parser :183 near avatar, `getNotificationSenderLabel/Excerpt` :351-358 must strip `￼`), `components/notification-overlay.ts` (title/body draw), `pages/home/notifications-slide.ts` (banner rows) | M | relay side (notify-relay, free) |
| cf73cdc2 | Photos carried by a message: `attachment` hash, fetched with `need-icon`, thumbnail in banners, large in StandBy; inline emoji alpha/ellipsis; name drawn with emoji | no | `notify-service.ts` (field + `need-icon` ask list ~:183-189), `notification-overlay.ts`, `notifications-slide.ts` | M | 10950ed8 |
| cdc3ccdd | Sender's emoji in StandBy name, larger photo (460 px), smaller face when a photo exists | no | `notification-overlay.ts` | S | cf73cdc2 |
| c05fd2b6 | Emoji centred on capitals (`emojiSize/emojiY`), kept and ellipsised in long names (`maxW`) | no | `notification-overlay.ts`, `notifications-slide.ts` | S | cdc3ccdd |
| 6cba4847 | Previous / next beside every small play button (clock now-card, narrow variant with 2nd row; context-sheet group rows) | no: only play button at `pages/home/clock-slide.ts:83-125` and `components/context-sheet.ts:127-129` | `clock-slide.ts`, `context-sheet.ts` (+ `executeGroupCommand` in `state.ts:533` exists) | S | none |
| aba2a4ef | Settings: "Réveil automatique sur l'horloge" (glances on/off) and "Notifications du Mac" on/off; config keys `glances`, `notify` | no | `services/config.ts` (+2 fields, load/save), `core/screen-power.ts:152` (guard `glances`), `services/notify-service.ts` (a `shown` flag around `showStandByOverlayNotification` :552), `pages/settings/settings-page.ts` (screen card is 120 high, grow it; new NOTIFICATIONS section) | S | none |
| 937d2296 | Mouse wheel / trackpad: scroll lists, one carousel step or clock face per gesture | no | `main.ts` (new `wheelInput(dt)` in the frame loop; imports `wheel, wheelX, scrollDX, scrollDY` from zinc:gfx), `core/input.ts` (`wheelScroll(x,y,dy)` over zones/`ScrollBox` :42, `scrollBox` on zones :104) | M | none |
| 40cedd98 | Spotify page logs in from the app on a Mac (browser consent, `Login`, `openUrl`); zinc.json `permissions` | no (page only shows a python3 instruction: `pages/spotify/spotify-page.ts:137,192`) | `pages/spotify/spotify-page.ts` (disconnected card :183-200), `state.ts` (login state + tick), `zinc.json` (`"permissions": ["opener","fs","net"]`) | M | plugin `Login` (present), `platform()` from zinc:sys |
| d359b4f6 | Settings Spotify card: "Vérifier" (account + Connect devices) and two-tap "Déconnecter" | no (`settings-page.ts:177-190,309-312` shows status text only) | `settings-page.ts`, `state.ts` | S | 40cedd98 (reload/logout in plugin) |
| 44129ad7, c75b5f46, e5b1f476(part) | version 1.1.0/1.1.1/1.1.2, `install.sh` reads version from zinc.json | no: `install.sh` of music-tree still hard-codes `"version": "1.0.0"` (diff of the two install.sh) | `install.sh`, `zinc.json` | S | none |
| 229d8cf7 | Login with no zinc setup: shared login file, build-time client id (`src/spotify-client.ts`, empty), "Spotify n'est pas disponible" card, `spotifyWhy` (403 hint) | no | new `src/spotify-client.ts` (copy; keep it empty), `spotify-page.ts`, `state.ts` (error mapping in `loadSpotifyTab` :804 and checks) | S | 40cedd98 |
| e5b1f476 | Long Spotify errors wrapped on 3 lines; clearer 403 text | no (no `spotifyWhy`; error rendering not wrapped, see `spotify-page.ts` state text) | `spotify-page.ts`, `state.ts` | S | 229d8cf7 |
| 7a67a32a | Sleeping screen shows the next song as a notification (cover, title, artist/album), kind `track`, never kept in the list | no | `notify-service.ts` (new `kind='track'`, `art`, `showTrack`; skip `openNotificationOnMac` :411 for tracks), `notification-overlay.ts` (cover branch), `state.ts` `pollActiveSonosGroup` :423 (trigger when track changes while `screenPower.asleep`), `main.ts` (draw covers when `peeking`: ~:757) | M | none |
| 377d7e8f | "Reprendre ici": card on the player when the account plays on another device; one tap moves it to the chosen group (Connect transfer, else Sonos queue + seek); Sonos error text improved | no | `state.ts` (`playsElsewhere`, `resumeHere`, `resumeThroughSonos`; Sonos `queueIndex`, `seekTrack` from plugin), `pages/home/player-slide.ts` (handoff card under volume, near :84) , polling in `main.ts` (spotify poll every 8 s on player slide when awake; state.ts:512 already polls) | M | plugin sonos/spotify additions (present in repo) |
| ca4aeaf1 | Covers show a quiet tile + spinner while loading (no flash of the made-up tile); Spotify Connect songs get title/cover from the account (`connectItem`, `ourSpeakers`) | no | `components/cover.ts:31` (`drawCoverArt`), `state.ts` (`getGroupArtworkUrl` :330 + title/sub in player-slide) | S | 377d7e8f (`ourSpeakers`) |
| b1f75b02 | Resume continues in the list; speakers' queue "goes on" with Spotify's song radio (`goOn`, `trackRadio`) | no | `state.ts` (extend `pollActiveSonosGroup`, `resumeThroughSonos`) | S | 377d7e8f; plugin `queueSpotify` |
| 416338bb | Spotify page rewrite: drill-down (artist/album/playlist), search with kinds filter, queue ("lire ensuite"/"ajouter"), song/artist radio, back button; computer keyboard flag `touchKeyboard`; icons `ellipsis`, `chevron-left` | partially: tree has its own 5-tab Spotify page (Playlists, Albums, Titres likés, Récents, Rechercher) with paging, equal to the pre-416338bb page | `pages/spotify/spotify-page.ts` (rewrite around a view stack), `state.ts` (`queueOnSpeakers`, `playRadio`, `playSpotifyItem` branch for tracks with context: `:714`), `main.ts`, `components/keyboard.ts` and `search-field.ts` (hide the virtual keyboard on desktop), `zinc.json` icons | L | spotify-ui.ts (387 lines) as reference; `resumeThroughSonos` (377d7e8f); plugin `find`, `artist*`, `album`, `playlist`, `queueSpotify` |
| c548da1c | Desktop keyboard types in search fields: window text input turned on while typing, Escape ends it, held Backspace repeats | partial: `main.ts:500-512` handles Text/Backspace/Enter only | `main.ts` (:500: add `startTextInput`/`stopTextInput`, Escape, `KeyKind.Repeat`) | S | 416338bb for `touchKeyboard` |
| plugins only | 101f1d80 (shared login), 40cedd98/d359b4f6/229d8cf7 plugin parts, 377d7e8f/b1f75b02 sonos, notify-relay emoji/photos | free | none | none | additive: new exports only, `soap` gained an optional param; `playSpotify` signature unchanged (checked with `git diff 82da1f8e HEAD -- plugins/sonos plugins/spotify`) |

## Regressions and drops (music-tree vs music at the fork)

Everything of the fork's main.ts is present; compared on config keys, settings rows, UDP, Spotify/Sonos actions, screen, weather, radios, keyboard:

- Config keys `sleep, group, seed, spotifySn, full, lat, lon, city, battery, batteryPct`: all read and written (`services/config.ts:49-76`). Same file name `config.json`.
- Settings rows ÉCRAN, BATTERIE, MÉTÉO, SPOTIFY, SONOS, BOUTONS PHYSIQUES: all present (`settings-page.ts:96,124,153,177,192,216`).
- UDP 7777 commands `toggle play pause next prev vol+ vol- radio <n> wake`: identical (`services/remote-udp.ts:27-47`).
- Spotify Connect first, Sonos-service fallback in `playSpotifyItem` (`state.ts:714-739`) and `accountOf` serial candidates (:762): present.
- Env hooks `ZINC_MUSIC_METEO`, `ZINC_MUSIC_RELAY`, `ZINC_MUSIC_STANDBY`: present (weather-service.ts:57, notify-service.ts:406, screen-power.ts:20).
- No fork feature found dropped. Differences worth knowing:
  - The project has no tests: `tests/t1/music_notify.sh`, `music_city_standby.sh` and `tests/golden/music/*` target `examples/music` only. Pixel parity with music is unchecked.
  - Not run: no build or visual comparison was done (read-only task).
  - `config.json` of music-tree is a development copy (`sleep:120, group:"", seed:"192.168.2.134", spotifySn:0`); music's has `group RINCON_5CAAFD445D8601400, seed 192.168.2.103, spotifySn 1, sleep 0, glances:false, notify:true`. Only the `glances`/`notify` keys matter for the port (defaults true).
  - README is in French, while the repository's rule is English documents.
  - Different `app.id` (`dev.zinc.music-tree`) and name "Musique (arbre)": the two can be installed together; keep when porting, change on promotion.
- Added by music-tree (not in music): display tree and Flexbox layout (`core/display.ts`, `components/layout-nodes.ts`), `VolumePopoverNode`, `ContextSheetNode`, `RoomsPageNode`, typed `tsconfig.json`/`env.d.ts`, `.gitignore`, `README.md`, and a `build/.zinc-web-dev` folder (a web dev build, ignored by `.gitignore`; check it is not committed).

## zinc.json and config.json differences

- `permissions`: music has `["opener","fs","net"]` (added by 40cedd98), music-tree has none. Needed once the Spotify login is ported (`openUrl`).
- `icons` list: music adds `ellipsis` and `chevron-left` (416338bb) after `trash`; music-tree stops at `trash`. Needed for the Spotify page rewrite.
- `app.version`: music `1.3.0`, music-tree `1.0.0`. `app.id`/`name`/`name` differ by design.
- zinc.json otherwise identical to the fork's (diff against `git show 82da1f8e:examples/music/zinc.json`).
- install.sh: music reads the version from zinc.json, music-tree hard-codes `1.0.0`.
- config.json: see above.

## Recommended porting order

1. Quick wins with no dependency: 6cba4847 (prev/next, S), aba2a4ef (glances and notifications settings, S), install.sh and zinc.json version/permissions (S).
2. 937d2296 wheel/trackpad (M): touches `main.ts` and `core/input.ts`, independent.
3. Notification set as one batch: 10950ed8, cf73cdc2, cdc3ccdd, c05fd2b6 (the final state of `notify.ts` at c548da1c is the thing to port, not the four steps), then 7a67a32a (track notification), all in `notify-service.ts` and `notification-overlay.ts`.
4. Spotify: 40cedd98 + d359b4f6 + 229d8cf7 + e5b1f476 together (login, check/logout, client id file, error text), with `permissions`.
5. 377d7e8f + ca4aeaf1 + b1f75b02 ("Reprendre ici", cover loading, Connect songs, song radio) in `state.ts` and `player-slide.ts`.
6. 416338bb + c548da1c last (Spotify page rewrite, queue, radio, desktop keyboard), using `spotify-ui.ts` as a model for a `SpotifyPageNode` view stack; add the two icons.

Total: about 3 S, 4 M, 1 L of real work. Everything uses plugin APIs already in the repository.
