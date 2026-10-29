# zinc:sonos vs SoCo: parity map and plan

Date 2026-10-29. Research only; no code changed. Sources: SoCo master (`soco/core.py`, `groups.py`, `discovery.py`, `events_base.py`, `events.py`, `music_library.py`, `data_structures.py`, `alarms.py`, `snapshot.py`, `plugins/sharelink.py`, `music_services/music_service.py`, `ms_data_structures.py`, `zonegroupstate.py`, `services.py`), read from GitHub. Current zinc:sonos: `plugins/sonos/index.ts` (380 lines), `xml.ts` (35 lines, string search by tag name), `docs/plugins/sonos.md`.

Legend: has / partial / missing / WIP / done (batch N: implemented 2026-10-29, tested by `tests/t1/sonos_plugin.sh`). WIP = another agent is adding `playUri`, `addUriToQueue`, `clearQueue`, `playFromQueue` right now; counted as in progress, not as present.

Naming: SoCo's snake_case becomes camelCase (`play_uri` -> `playUri`). SoCo hangs everything on a `SoCo` speaker object; zinc:sonos has `System` (household) with `Group` and `Speaker` arguments (`sys.play(g)`, `sys.setVolume(s, v)`). Proposal: keep that style (commands that go to the coordinator take a `Group`, per-room ones take a `Speaker`). New properties become `getX(s)` / `setX(s, v)` pairs; do not invent getters on the data classes, since awaits cannot sit in a property.

## 1. Feature table

Services: AVT = AVTransport, RC = RenderingControl, GRC = GroupRenderingControl, CD = ContentDirectory, ZGT = ZoneGroupTopology, DP = DeviceProperties, AC = AlarmClock, AI = AudioIn, MS = MusicServices, SP = SystemProperties. SoCo passes `EQType` names to `RC.GetEQ/SetEQ`.

### 1.1 Discovery (`discovery.py`)

| SoCo feature | UPnP / transport | today | proposed name | notes |
|---|---|---|---|---|
| `discover(timeout, include_invisible, interface_addr, allow_network_scan, ...)` | SSDP M-SEARCH 239.255.255.250:1900, ST `urn:schemas-upnp-org:device:ZonePlayer:1`, then `ZGT.GetZoneGroupState` | partial | `discover` (has) | zinc takes the first reply, then reads topology from it (enough, topology lists all rooms). Missing: `includeInvisible`, bounded wait collecting all replies, multi-interface sockets (SoCo sends from each local IPv4), IPv4 multicast TTL |
| `any_soco()` | same | has | `discover` | |
| `by_name(name)` | discover + filter on `player_name` | done (batch 1) | `System.speakerByName(name)` | pure lookup on `sys.speakers`, trivial |
| `scan_network(...)`, `scan_network_by_household_id`, `scan_network_get_household_ids`, `scan_network_get_by_name`, `scan_network_any_soco`, `contactable` | HTTP GET `/xml/device_description.xml` on every host of the subnets, threadpool | missing | `scanNetwork(opts)` | fallback when multicast is blocked (VLANs, Wi-Fi isolation, webOS firewall). A bounded concurrent loop of `fetch` with 300 ms timeouts over the /24 of each `networkInterfaces()` entry. Low priority |
| (zinc extra) `known` seed address | direct `GetZoneGroupState` | has | `discover(known)` | keep |

### 1.2 Topology and groups (`core.py`, `groups.py`, `zonegroupstate.py`)

| SoCo | UPnP | today | proposed | notes |
|---|---|---|---|---|
| `all_groups`, `all_zones`, `visible_zones`, `group` (property) | ZGT.GetZoneGroupState | has | `sys.groups`, `sys.speakers`, `groupOf` | |
| `zone_group_state` (cached, event-updated) | ZGT subscription | partial | `sys.refresh()` | poll only; with events (batch 6) refresh on `ZoneGroupState` |
| `ZoneGroup.members/coordinator/uid/label/short_label` | ZGT | has | `Group.name()` | `Group.id` kept |
| `ZoneGroup.volume` (get/set) | GRC.GetGroupVolume / SetGroupVolume (after SnapshotGroupVolume) | has | `setGroupVolume`; read in `update` | |
| `ZoneGroup.mute` (get/set) | GRC.GetGroupMute / SetGroupMute | done (batch 1) | `getGroupMute(g)`, `setGroupMute(g, m)` | |
| `ZoneGroup.set_relative_volume(n)` | GRC.SetRelativeGroupVolume | done (batch 1) | `setRelativeGroupVolume(g, n)` | returns new volume |
| (not in SoCo) GRC.GetGroupVolume only; | | | | `GRC.SnapshotGroupVolume` already used |
| `join(master)` | AVT.SetAVTransportURI `x-rincon:<uid>` | has | `join` | |
| `unjoin()` | AVT.BecomeCoordinatorOfStandaloneGroup | done (batch 1) | `leave` | SoCo name `unjoin`: add alias `unjoin` |
| `partymode()` | join all visible zones to this one | done (batch 1) | `partyMode(s)` | loop of `join` |
| `is_coordinator`, `is_visible`, `is_bridge`, `is_satellite`, `has_satellites`, `is_subwoofer`, `has_subwoofer`, `channel` | ZGT member attributes (`Invisible`, `IsZoneBridge`, `ChannelMapSet`, `HTSatChanMapSet`, `Satellites`) | partial (batch 1: `visible`, `bridge`, `sys.allSpeakers`) | `Speaker.visible`, `.bridge`, `.channelMap`, `.satellites[]`, `.isSub` | the zinc topology parser keeps only visible members; keep invisible ones in `sys.allSpeakers` |
| `create_stereo_pair(slave)` | DP.AddBondedZones (`ChannelMapSet` `uidL:LF,LF;uidR:RF,RF`) | missing | `createStereoPair(left, right)` | |
| `separate_stereo_pair()` | DP.RemoveBondedZones | missing | `separateStereoPair(s)` | |
| `add_satellite_speakers`, `separate_satellite_speakers` (`_set_satellite_mapping`) | DP.AddHTSatellite / RemoveHTSatellite (`HTSatChanMapSet`) | missing | `addSatellites(s, ...)`, `removeSatellites` | needs `ChannelMapSet`/`HTSatChanMapSet` parsing |
| `uid`, `household_id` | ZGT / DP.GetHouseholdID | partial | `Speaker.uuid`; `getHouseholdId(s)` | |
| `boot_seqnum` | `/xml/device_description.xml` `<bootseq>` or DP.GetZoneInfo | missing | skip | only used by SoCo's event resubscribe |

### 1.3 Transport (`core.py`)

| SoCo | UPnP | today | proposed | notes |
|---|---|---|---|---|
| `play()` | AVT.Play Speed 1 | has | `play` | |
| `pause()` | AVT.Pause | has | `pause` | zinc falls back to Stop for radios |
| `stop()` | AVT.Stop | done (batch 1) | `stop(g)` | |
| `next()` / `previous()` | AVT.Next/Previous | has | `next`, `previous` | |
| `seek(timestamp=, track=)` | AVT.Seek REL_TIME / TRACK_NR | has | `seek`, `seekTrack` | SoCo has no ABS_TIME; fine |
| `play_from_queue(index, start)` | SetAVTransportURI `x-rincon-queue:<uid>#0`, Seek TRACK_NR, Play | done (batch 1) | `playFromQueue(g, index, start=true)` | |
| `play_uri(uri, meta, title, start, force_radio)` | SetAVTransportURI; `x-rincon-mp3radio` rewrite; builds DIDL for radio | done (batch 1) | `playUri(g, uri, meta, title, start, forceRadio)` | |
| `end_direct_control_session()` | AVT.EndDirectControlSession | done (batch 1) | `endDirectControlSession(g)` | |
| `get_current_track_info()` | AVT.GetPositionInfo (track, title, artist, album, album_art, position, duration, uri, metadata, playlist_position) | done (batch 1) | `update(g)` -> `g.track` | has all but raw `metadata`, playlist_position naming (`track.number`); add `track.metadata` |
| `get_current_media_info()` | AVT.GetMediaInfo | done (batch 1) | `update` reads it | expose `g.media` {uri, meta, nrTracks, duration} |
| `get_current_transport_info()` | AVT.GetTransportInfo | done (batch 1) | `g.state` | missing `CurrentTransportStatus` (ERROR_OK) and speed |
| `available_actions` | AVT.GetCurrentTransportActions | has | `g.actions` | |
| `play_mode`, `shuffle`, `repeat` (`one`, `all`, `True`/`False`) | AVT.GetTransportSettings / SetPlayMode | done (batch 1) | `setPlayMode` | add `setShuffle(g, b)`, `setRepeat(g, 'none'|'all'|'one')` helpers reading `g.playMode` |
| `cross_fade` | AVT.GetCrossfadeMode / SetCrossfadeMode | done (batch 1) | `getCrossFade(g)`, `setCrossFade(g, b)` | |
| `get_speaker_info()` | `/xml/device_description.xml` | missing | `getSpeakerInfo(s)` | see 1.14 |
| `music_source` / `is_playing_radio/line_in/tv` / `music_source_from_uri` | URI regex | done (batch 1) | `sourceOf(uri)` | zinc kinds: spotify/radio/queue/line-in/tv/airplay/stream/none; SoCo: RADIO, LINE_IN, TV, LIBRARY, SPOTIFY, ... Add `isPlayingRadio/LineIn/Tv(g)` helpers (one-liners on `g.track.source`) |

### 1.4 Queue (`core.py`, `data_structures.py` `Queue`)

| SoCo | UPnP | today | proposed | notes |
|---|---|---|---|---|
| `get_queue(start, max_items, full_album_art_uri)` | CD.Browse `Q:0` (+ DIDL parse) | partial | `getQueue(g, start, max)` | zinc has `queueEntry`, `queueIndex` (URI only). Needs DIDL item parser -> `QueueItem` {title, creator, album, art, uri, meta, class} |
| `queue_size` | CD.Browse `Q:0` count (`TotalMatches`) | missing | `queueSize(g)` | |
| `add_uri_to_queue(uri, position, as_next)` | AVT.AddURIToQueue | done (batch 1) | `addUriToQueue(g, uri, position, asNext)` | returns first new track number |
| `add_to_queue(queueable_item, position, as_next)` | AVT.AddURIToQueue with item DIDL | partial (`enqueue(g, favorite)`) | `addToQueue(g, item, position, asNext)` | `enqueue` covers Favorite only |
| `add_multiple_to_queue(items, container)` | AVT.AddMultipleURIsToQueue | missing | `addMultipleToQueue(g, items, container?)` | batch of up to 16 URIs per call; faster than loops |
| `remove_from_queue(index)` | AVT.RemoveTrackFromQueue `Q:0/n` | has | `removeFromQueue` | SoCo index is 0-based, zinc 1-based; document |
| `remove_range_from_queue(start, num)` | AVT.RemoveTrackRangeFromQueue | missing | `removeRangeFromQueue(g, start, count)` | |
| `clear_queue()` | AVT.RemoveAllTracksFromQueue | done (batch 1) | `clearQueue(g)` | used internally by `playFavorite` |
| `reorder_queue`, `move_in_queue(from, to)` | AVT.ReorderTracksInQueue | missing | `moveInQueue(g, from, to)`, `reorderQueue(g, start, count, before)` | |
| `Queue` class (ListOfMusicInfoItems with update_id) | | missing | `QueueItem[]` + `updateId` | |

### 1.5 Sonos playlists (saved queues)

| SoCo | UPnP | today | proposed | notes |
|---|---|---|---|---|
| `get_sonos_playlists()` | CD.Browse `SQ:` | missing | `getSonosPlaylists()` | |
| `get_sonos_playlist_by_attr(attr, match)` | same + filter | missing | `getSonosPlaylistByTitle(title)` | |
| `create_sonos_playlist(title)` | AVT.CreateSavedQueue | missing | `createSonosPlaylist(title)` | returns `SQ:n` object |
| `create_sonos_playlist_from_queue(title)` | AVT.SaveQueue | missing | `createSonosPlaylistFromQueue(g, title)` | |
| `remove_sonos_playlist(playlist)` | CD.DestroyObject `SQ:n` | missing | `removeSonosPlaylist(p)` | |
| `add_item_to_sonos_playlist(item, playlist)` | AVT.AddURIToSavedQueue (needs UpdateID from Browse) | missing | `addItemToSonosPlaylist(p, item)` | |
| `reorder_sonos_playlist`, `move_in_sonos_playlist` | AVT.ReorderTracksInSavedQueue | missing | `moveInSonosPlaylist(p, from, to)` | |
| `remove_from_sonos_playlist(playlist, track_index)` | AVT.ReorderTracksInSavedQueue (SoCo moves the track out; no direct remove action) | missing | `removeFromSonosPlaylist(p, index)` | |
| `clear_sonos_playlist(playlist, update_id)` | AVT.ReorderTracksInSavedQueue (loop) | missing | `clearSonosPlaylist(p)` | |
| play a saved playlist | SetAVTransportURI `file:///jffs/settings/savedqueues.rsq#n` + queue | missing | `playSonosPlaylist(g, p)` | via `addUriToQueue` (SoCo: `add_to_queue(playlist)`) |

### 1.6 Volume, EQ, home theatre (`RenderingControl`, addressed per room)

| SoCo property | UPnP | today | proposed | notes |
|---|---|---|---|---|
| `volume` | RC.GetVolume/SetVolume Master | has | `setVolume`, `readVolumes` | |
| `mute` | RC.GetMute/SetMute | has | `setMute` | |
| `ramp_to_volume(v, ramp_type)` | RC.RampToVolume (`SLEEP_TIMER_RAMP_TYPE`, `ALARM_RAMP_TYPE`, `AUTOPLAY_RAMP_TYPE`) | missing | `rampToVolume(s, v, type)` | |
| `set_relative_volume(n)` | RC.SetRelativeVolume | missing | `setRelativeVolume(s, n)` | |
| `balance` ((l, r) 0..100) | RC.GetVolume/SetVolume Channel LF and RF | missing | `getBalance(s)`, `setBalance(s, l, r)` | |
| `bass`, `treble` | RC.GetBass/SetBass, GetTreble/SetTreble (-10..10) | missing | `getBass/setBass`, `getTreble/setTreble` | |
| `loudness` | RC.GetLoudness/SetLoudness Channel Master | missing | `getLoudness/setLoudness` | |
| `night_mode` | RC.GetEQ/SetEQ `NightMode` | missing | `getNightMode/setNightMode` | soundbars only (`only_on_soundbars`) |
| `dialog_mode` | EQ `DialogLevel` | missing | `getDialogMode/setDialogMode` | soundbars |
| `dialog_level`, `speech_enhance_enabled` | EQ `DialogLevel` (Arc/Ultra levels), `SpeechEnhanceEnabled` | missing | `getDialogLevel/...`, `getSpeechEnhance/...` | new soundbars |
| `surround_enabled` | EQ `SurroundEnable` | missing | `get/setSurroundEnabled` | |
| `surround_full_volume_enabled` | EQ `SurroundMode` | missing | `get/setSurroundFullVolume` | |
| `surround_volume_tv` / `surround_level`, `surround_volume_music` / `music_surround_level` | EQ `SurroundLevel`, `MusicSurroundLevel` (-15..15) | missing | `get/setSurroundLevel`, `get/setMusicSurroundLevel` | |
| `sub_enabled`, `sub_gain`, `sub_crossover` | EQ `SubEnable`, `SubGain`, `SubCrossover` | missing | `get/setSubEnabled`, `...SubGain`, `...SubCrossover` | |
| `audio_delay` | EQ `AudioDelay` (lip-sync, 0..5) | missing | `get/setAudioDelay` | |
| `trueplay` | RC.GetRoomCalibrationStatus/SetRoomCalibrationStatus (enable only; tuning is done by the phone app) | missing | `get/setTrueplay` | |
| `fixed_volume`, `supports_fixed_volume` | RC.GetOutputFixed/SetOutputFixed, GetSupportsOutputFixed | missing | `get/setFixedVolume`, `supportsFixedVolume` | Port/Connect |
| `soundbar_audio_input_format(_code)` | EQ `HTAudioIn` | missing | `getSoundbarInputFormat(s)` | code table |
| `is_soundbar`, `is_arc_ultra_soundbar`, `is_ultra_soundbar` | model from device description / `GetZoneInfo` | missing | `isSoundbar(s)` | `Speaker.model` from device description |

All of these are one SOAP call each; one table-driven helper `getEq(s, name)` / `setEq(s, name, v)` covers about 15 properties.

### 1.7 Sleep timer

| SoCo | UPnP | today | proposed | notes |
|---|---|---|---|---|
| `set_sleep_timer(seconds or None)` | AVT.ConfigureSleepTimer (`NewSleepTimerDuration` `HH:MM:SS`, '' cancels) | missing | `setSleepTimer(g, seconds)` | |
| `get_sleep_timer()` | AVT.GetRemainingSleepTimerDuration | missing | `getSleepTimer(g)` | seconds or 0 |

### 1.8 Alarms (`alarms.py`)

| SoCo | UPnP | today | proposed | notes |
|---|---|---|---|---|
| `get_alarms(zone)` / `Alarms.update` / `Alarms.get(id)` | AC.ListAlarms (`CurrentAlarmList` XML + `CurrentAlarmListVersion`) | missing | `getAlarms(): Alarm[]` | one call on any speaker |
| `Alarm(zone, start_time, duration, recurrence, enabled, program_uri, program_metadata, play_mode, volume, include_linked_zones)` + `save()` | AC.CreateAlarm / UpdateAlarm | missing | `createAlarm(a)`, `updateAlarm(a)` | fields: StartLocalTime, Duration, Recurrence (`DAILY`, `ONCE`, `WEEKDAYS`, `WEEKENDS`, `ON_0123456`), Enabled, RoomUUID, ProgramURI (`x-rincon-buzzer:0` default chime), ProgramMetaData, PlayMode, Volume, IncludeLinkedZones |
| `Alarm.remove()`, `remove_alarm_by_id` | AC.DestroyAlarm | missing | `removeAlarm(id)` | |
| `is_valid_recurrence` | | missing | `isValidRecurrence` | |
| `Alarm.get_next_alarm_datetime`, `Alarms.get_next_alarm_datetime` | local compute | missing | `nextAlarmTime(a)` | needs the speaker's time zone/date: AC.GetTimeNow, GetTimeZone |
| `Alarms.update_skipped` / `last_alarm_list_version` | AlarmClock events (`AlarmListVersion`) | missing | with events | |
| (extras not in SoCo) | AC.GetTimeNow, GetTimeZone, SetTimeNow, GetDailyIndexRefreshTime | missing | `getTimeNow(s)` | needed to compute next alarm |

### 1.9 Music library, local shares (`music_library.py`, `ContentDirectory`)

| SoCo | UPnP | today | proposed | notes |
|---|---|---|---|---|
| `get_music_library_information(search_type, start, max_items, full_album_art_uri, search_term, subcategories, complete_result)` | CD.Browse (ObjectID `A:ARTIST`, `A:ALBUMARTIST`, `A:ALBUM`, `A:GENRE`, `A:COMPOSER`, `A:TRACKS`, `A:PLAYLISTS`, `S:`, `FV:2`, `R:0/0`, `R:0/1`) | missing | `libraryBrowse(type, start, count, term)` | core generic call |
| `get_artists/album_artists/albums/genres/composers/tracks/playlists` | same | missing | `getArtists()`, ... or `libraryBrowse` + type | thin wrappers |
| `browse(ml_item, start, max_items)`, `browse_by_idstring(search_type, idstring, ...)` | CD.Browse | missing | `browse(objectId, start, count)` | |
| `search_track(artist, album, track)`, `get_albums_for_artist`, `get_tracks_for_album` | CD.Browse with `A:ARTIST/<name>/...` | missing | same names | |
| `library_updating`, `start_library_update(album_artist_display_option)` | CD.GetShareIndexInProgress, RefreshShareIndex | missing | `libraryUpdating()`, `startLibraryUpdate()` | |
| `album_artist_display_option` | CD.GetAlbumArtistDisplayOption | missing | `getAlbumArtistDisplayOption()` | |
| `list_library_shares()`, `delete_library_share(name)` | CD.Browse `S:`, CD.DestroyObject `S://host/share` | missing | `listLibraryShares()`, `deleteLibraryShare()` | |
| `build_album_art_full_uri(url)` | prefix `http://ip:1400` | partial | in `update` and `favorites` | factor into `artUri(ip, path)` |
| (not in SoCo) CD.Search, GetSearchCapabilities, GetSortCapabilities, GetSystemUpdateID, CreateObject, UpdateObject | | missing | `search` | optional |

### 1.10 Favorites and radio

| SoCo | UPnP | today | proposed | notes |
|---|---|---|---|---|
| `get_sonos_favorites(start, max_items)` | CD.Browse `FV:2` | has | `favorites()` | `Favorite` lacks `class`, `resMD` parsed; paging fixed to 200, add `start/max` |
| `get_favorite_radio_stations(start, max)` (My Radio Stations) | CD.Browse `R:0/0` | missing | `getRadioStations()` | |
| `get_favorite_radio_shows(start, max)` | CD.Browse `R:0/1` | missing | `getRadioShows()` | |
| play a favorite | SetAVTransportURI / queue | has | `playFavorite`, `enqueue` | |
| Sonos Favorites add/remove | CD.CreateObject / DestroyObject `FV:2` | missing (SoCo itself lacks it) | `addFavorite`, `removeFavorite` | beyond SoCo; later |

### 1.11 Music services (`music_services/*`, client-side SMAPI)

| SoCo | UPnP / SOAP | today | proposed | notes |
|---|---|---|---|---|
| `MusicService.get_all_music_services_names()`, `get_data_for_name`, class setup | MS.ListAvailableServices (XML of Id, Name, Uri, SecureUri, Capabilities, Auth policy, Presentation map `PresentationMapUri`), MS.GetSessionId (`ServiceId`, `Username`) | partial | `listMusicServices()`, `MusicService` | `serviceId(sys, name)` reads the list already but only the id |
| `MusicService(name, account)` and `Account.get_accounts()` | SP.GetString `/Accounts` account list (`Type`, `SerialNum`, `Username`, `Credentials`) | partial | `getAccounts()` | `accountOf` approximates it from favorites |
| `begin_authentication()`, `complete_authentication(link_code)` | SMAPI `getDeviceLinkCode`, `getDeviceAuthToken`; store token | missing | `beginAuth(svc)`, `completeAuth(svc, code)` | OAuth-like device link flow; credentials in the speaker's own store (SoCo keeps a token store in a file); anonymous services (TuneIn, Sonos Radio) need no auth |
| `get_metadata(item='root', index, count, recursive)` | SMAPI `getMetadata` (SOAP 1.1 to the service's `SecureUri`, with `Credentials` header) | missing | `smapiGetMetadata` | HTTPS to third-party servers; needs an XML parser for response trees |
| `search(category, term)`, `available_search_categories` | SMAPI `search` | missing | `smapiSearch` | |
| `get_media_metadata(item_id)`, `get_media_uri(item_id)`, `get_extended_metadata(_text)`, `get_last_update()` | SMAPI `getMediaMetadata`, `getMediaURI`, `getExtendedMetadata(Text)`, `getLastUpdate` | missing | `smapiMediaMetadata` ... | |
| `sonos_uri_from_id(item_id)` | builds `soco://<id>?sid=<sid>&sn=<n>` or `x-sonos-http`/`x-sonosapi-*` URI | partial | `spotifyItem()` does it for Spotify | generalise to `sonosUriFromId(svc, id)` per service type |
| `ms_data_structures`: `MSTrack`, `MSAlbum`, `MSAlbumList`, `MSPlaylist`, `MSArtist`, `MSArtistTracklist`, `MSFavorites`, `MSCollection`, `MusicServiceItem` (`from_dict`, `to_dict`, `didl_metadata`, `desc`) | DIDL built from SMAPI answers | missing | `MsItem` class + `didl()` | the DIDL builder is required to queue anything from a service |

Note: SMAPI is a third-party SOAP API. It is only needed to browse/search a service from our UI without the Sonos app; queueing items by id (share links, Spotify) needs only the DIDL builder, no SMAPI call.

### 1.12 Share links (`plugins/sharelink.py`)

| SoCo | action | today | proposed | notes |
|---|---|---|---|---|
| `ShareLinkPlugin.is_share_link(uri)` | regex per service | missing | `isShareLink(uri)` | |
| `add_share_link_to_queue(uri, position, as_next)` | `ShareClass.canonical_uri/extract` -> `MusicService.sonos_uri_from_id`-style URI + DIDL with `SA_RINCON<svc>_` desc -> AVT.AddURIToQueue | partial | `addShareLinkToQueue(g, uri, position, asNext)` | zinc has `playSpotify`/`queueSpotify`/`spotifyItem` for `spotify:` URIs only |
| `SpotifyShare`, `SpotifyUSShare` (service 2311 / 3079), `TIDALShare` (service 44551), `DeezerShare` (2311 ids), `AppleMusicShare` (52231) | `open.spotify.com/{track,album,playlist}/<id>`, `spotify:` URIs, `tidal.com/...`, `deezer.com/...`, `music.apple.com/...` | partial (Spotify only) | `ShareClass` table | each entry = {regexes, prefix `x-sonos-spotify:` / `x-sonosapi-hls-static:`..., key `0004206c`/`10032020`..., DIDL class, service number}. Pure string work |

### 1.13 Snapshot and restore (`snapshot.py`)

| SoCo | action | today | proposed | notes |
|---|---|---|---|---|
| `Snapshot(device, snapshot_queue).snapshot()` | records volume, mute, bass, treble, loudness, play mode, cross fade, transport URI/meta/state, position (`GetPositionInfo`), queue (via CD.Browse), `is_playing_queue`, group state; stops a coordinator that has radio | missing | `snapshot(s, withQueue=false): Snapshot` | composition of getters in 1.3/1.6 |
| `restore(fade)` | rejoins group, resets queue, restores URI, Seek, volume ramp, state | missing | `restore(snap, fade=false)` | composition; needs rows 1.3 (cross fade, stop), 1.4 (queue), 1.6 getters. Used by TTS/doorbell/notification features |

### 1.14 Device info, buttons, light, battery, line-in/TV

| SoCo | UPnP / HTTP | today | proposed | notes |
|---|---|---|---|---|
| `player_name` get/set | DP.GetZoneAttributes / SetZoneAttributes (`DesiredZoneName`, `DesiredIcon`, `DesiredConfiguration`) | partial (name read from topology) | `getPlayerName`, `setPlayerName(s, name)` | |
| `get_speaker_info(refresh)` | HTTP `/xml/device_description.xml` (zone_name, model_name, model_number, display_version, hardware_version, software_version, mac_address, serial_number, `uid`) and `GetZoneInfo` | missing | `getSpeakerInfo(s)` | XML parse; also yields model (soundbar detection) |
| `status_light` | DP.GetLEDState / SetLEDState (`On`/`Off`) | missing | `getStatusLight/setStatusLight` | |
| `buttons_enabled` | DP.GetButtonLockState / SetButtonLockState | missing | `getButtonsEnabled/setButtonsEnabled` | |
| `voice_service_configured`, `mic_enabled` | DP.GetZoneInfo / GetMicEnabled? (SoCo: `GetZoneInfo` fields `VoiceConfigState`, `MicEnabled`) | missing | `getZoneInfo(s)` | read-only fields |
| `get_battery_info()` | HTTP GET `/status/batterystatus` (`LocalBatteryStatus`: Health, Level, Temperature, PowerSource) | missing | `getBatteryInfo(s)` | plain `fetch` GET |
| `switch_to_line_in(source)` | AVT.SetAVTransportURI `x-rincon-stream:<uid>` | missing | `switchToLineIn(g, source?)` | uri exists in `sourceOf` |
| `switch_to_tv()` | SetAVTransportURI `x-sonos-htastream:<uid>:spdif` | missing | `switchToTv(g)` | |
| AudioIn service (SoCo declares `AudioIn`, no property: `GetAudioInputAttributes`, `SetLineInLevel`, `SelectAudio`) | AI | missing | `getLineInLevel`, `setLineInLevel` | beyond SoCo |
| `Speaker.model`, `Speaker.version` | device description | missing | with `getSpeakerInfo` | |
| `get_current_track_info` for TV / line-in | | partial | | |

### 1.15 Events (`events_base.py`, `events.py`, `events_asyncio.py`, `zonegroupstate.py`, `services.py`)

| SoCo | protocol | today | proposed | notes |
|---|---|---|---|---|
| `service.subscribe(requested_timeout, auto_renew, event_queue)` | HTTP `SUBSCRIBE /<service>/Event` with headers `CALLBACK: <http://ip:port>`, `NT: upnp:event`, `TIMEOUT: Second-N`; answer header `SID`, `TIMEOUT` | missing | `subscribe(s, service, handler, timeoutSec)` | |
| `Subscription.renew()` (auto-renew at 85% of timeout) | `SUBSCRIBE` with `SID` and `TIMEOUT` headers, no CALLBACK/NT | missing | internal timer | |
| `Subscription.unsubscribe()` | `UNSUBSCRIBE` with `SID` | missing | `unsubscribe(sub)` | |
| `Subscription.send_event`, `events` queue, `time_left`, `is_subscribed` | NOTIFY dispatch by `SID`, `SEQ` | missing | handler callback | |
| `EventNotifyHandler`, `EventListener` (HTTP server on 1400+, `get_listen_ip(ip)` = UDP-connect trick to find the interface that reaches the speaker) | `NOTIFY` with `SID`, `NT: upnp:event`, `NTS: upnp:propchange`, body `e:propertyset` | missing | `serveAsync` handler | |
| `parse_event_xml` (LastChange nested XML: `AVTransport` `<Event><InstanceID><TransportState val=.../>`; `RenderingControl` volume per channel; `ZoneGroupTopology` `ZoneGroupState`; `AlarmClock`; `ContentDirectory` `ContainerUpdateIDs`/`FavoritesUpdateID`/`SavedQueuesUpdateID`; `DeviceProperties`; `GroupRenderingControl` `GroupVolume`, `GroupMute`) | | missing | `parseEvent(service, xml)` -> typed event | `Event` has `sid`, `seq`, `service`, `timestamp`, `variables` |
| `ZoneGroupState` event-driven cache | ZGT subscription | missing | `sys.watch()` | replaces polling `update`/`refresh` |
| Services used for events | AVTransport, RenderingControl, GroupRenderingControl, ZoneGroupTopology, ContentDirectory, AlarmClock, DeviceProperties, SystemProperties, AudioIn, MusicServices, GroupManagement, ConnectionManager, Queue, QPlay | | | iPod needs: AVT, RC, GRC, ZGT, CD (queue/favorites changed), AC |
| `Service.iter_actions`, `actions`, `event_vars` (SCPD introspection from `/xml/<service>1.xml`) | HTTP GET SCPD | missing | skip | not needed with hard-coded actions |

Also in `services.py` (generic `Service.send_command`): `SoCoUPnPException` with `error_code`, `error_xml`, `error_description` (table 701, 711, 712, 714, 718, 800, 801, 802, 803, ...). zinc has a bare `Error('Action: UPnP 701')`; proposal: `UpnpError` class with `code` and `description`. Also `Service` retry logic and `cache` (`Cache(default_timeout)`) are not worth porting.

## 2. What the engine needs

Checked in `lib/modules.d.ts`, `src/host/http.cpp`.

| Need | State | Verdict |
|---|---|---|
| SUBSCRIBE / UNSUBSCRIBE / NOTIFY verbs | `RequestInit.method` is a free string; `http.cpp:215` writes `k->method + " " + k->path + " HTTP/1.1"` verbatim, headers array is passed through (`Content-Length` only added for POST/PUT/PATCH, correct for SUBSCRIBE which has no body). Server side: `http.cpp:422` pushes `llhttp_method_name(...)`, and llhttp knows `NOTIFY`, `SUBSCRIBE`, `UNSUBSCRIBE`, so `Request.method` will be `'NOTIFY'`. | Probably works with no engine change; prove it in the batch-6 test (stub speaker accepting SUBSCRIBE). Note `modules.d.ts` says "libcurl on hosts"; if a libcurl path serves some hosts, check it passes a custom method with no body. Likely fine (customrequest), unverified. |
| Response headers (`SID`, `TIMEOUT`) | `Response.headers.get('sid')` exists (case-insensitive lowercase keys) | OK |
| HTTP server for NOTIFY | `zinc:net serveAsync(port, handler)`; `Request.headers` (SID, SEQ, NT, NTS), `Request.body`, `remoteAddress`. Handler must answer `200` with empty body quickly | OK. Gap: `serve*` has a single global server (`stop()` takes no argument). If the iPod daemon (`examples/ipod-web`) already serves its own HTTP, the NOTIFY listener must share it: either the plugin exposes `handleNotify(req): Reply` for the app's own handler to call (recommended: no second port, no conflict), or a second port needs multi-server support. Check `ipod-web` before batch 6. |
| Local LAN address as the speaker sees it | `zinc:os networkInterfaces()` returns `address`, `netmask`, `internal`, `family`. | OK: choose the IPv4 non-internal interface whose subnet (address & netmask) contains the speaker IP; this is exactly what SoCo's `get_listen_ip` does with a UDP connect. Add helper `localAddressFor(ip)`. Fallback: UDP connect trick via `zinc:socket udp` if it exposes the bound local address (not checked). Multi-homed or VPN hosts: allow override `Events.listenIp`. |
| Timers for renew (every 85% of 1800 s) | `setTimeout` presumably in the runtime | OK |
| XML parsing | `xml.ts` is a name search: `tag(xml, name, from)`, `attr`, `unescape`, `escape`. Enough for flat answers; sloppy for repeated/nested elements and for DIDL lists (`index.ts` does `split('<item ')`). Needed for alarms (`<Alarm .../>` attributes), LastChange events (`<Event xmlns=...><InstanceID val="0"><Volume channel="Master" val="25"/>...`), device description, SMAPI trees, ZoneGroupState members. | Add to `xml.ts` (or a tiny `zinc:xml` in `lib/std`, which would also serve other plugins) a minimal element tree parser: `parse(xml): Node {name, attrs, children, text}` plus `all(node, name)`. Never write a general XML engine: ~80 lines, no namespaces beyond prefix stripping, entities limited to the five predefined + numeric. Vendored libs (`third_party/README.md`) have no XML parser listed; per `RULES.md` a proven library rule applies to regex/TLS/codec/JSON, not to this Sonos subset; decision to record in the batch. Double-unescape caveat: events nest `LastChange` as escaped XML inside the property set; parse twice. |
| TLS for SMAPI | `fetch` supports https (mbedTLS) | OK. SMAPI endpoints use SOAP 1.1 with `SOAPACTION: "http://www.sonos.com/Services/1.1#getMetadata"` and a `Credentials` SOAP header. |
| SSDP | `zinc:socket udp` | OK (has). Needs to collect many replies in one window, and bind to specific interfaces for scan; check `udp` API for multicast join (not required for M-SEARCH send). |
| Binary / big bodies | `maxBytes` default big; library browse of thousands of items uses paged Browse (100 per call) | OK |
| Long Browse timing | `QUEUE_MS` 20 s already used | OK |
| Event loop concurrency | calls are `async` | note existing Z0108 compiler limit (`for ... of` with await and field write): batches should use index loops until the engine fix lands (engine gaps rule: report, do not work around if reproduced; the existing plugin carries a `ponytail:` note) |

No new native code is required. Possible engine fixes surfaced: a multi-server `serveAsync`, if `ipod-web` cannot route NOTIFY.

## 3. Implementation batches (one session each, in order)

Every batch ships with a T0/T1 test `tests/t1/sonos_*.sh` running a stub speaker. The stub is a Zinc (or Node-free) program using `serveAsync` on a loopback port that answers `POST /<service>/Control` by `SOAPACTION`, returns canned XML per action, and records each request body so the test asserts the exact arguments sent (and the parsed result). Speaker address is passed as `ip:port`: the plugin hard-codes `:1400` in `soap()`, so batch 1 adds a `port` field on `Speaker` / `System` (default 1400), also needed for the stub. Never a real speaker. One shared stub file `tests/sonos/stub-speaker.ts` grows by batch.

1. **Foundations and transport remainder.** `Speaker.port`, `UpnpError {code, description}`, element-tree XML parser in `xml.ts`, `artUri`; `stop`, `endDirectControlSession`, `getCrossFade/setCrossFade`, `setShuffle/setRepeat`, `speakerByName`, `getGroupMute/setGroupMute`, `setRelativeGroupVolume`, `unjoin` alias, `partyMode`, keep invisible members; fold in the WIP four (`playUri`, `addUriToQueue`, `clearQueue`, `playFromQueue`) once they land with their own test. Test: stub answers the 8 or so actions; assert SOAP bodies, fault 701 -> `UpnpError.code`, parser on a nested sample.
2. **Queue and Sonos playlists.** DIDL item parser (`QueueItem`, `DidlItem` with `class`, `res`, `resMD`), `getQueue`, `queueSize`, `addToQueue`, `addMultipleToQueue`, `removeRangeFromQueue`, `moveInQueue`, `reorderQueue`, `getSonosPlaylists(+ByTitle)`, `createSonosPlaylist(+FromQueue)`, `removeSonosPlaylist`, `addItemToSonosPlaylist`, `moveInSonosPlaylist`, `removeFromSonosPlaylist`, `clearSonosPlaylist`, `playSonosPlaylist`. Test: stub keeps a 5-track queue and a saved queue with UpdateID; drive reorder/remove and assert the final order and the UpdateID handling.
3. **Volume, EQ, sleep timer, device info.** Table-driven `getEq/setEq`; bass, treble, loudness, balance, relative volume, ramp, night/dialog/surround/sub/audio delay/speech enhance/trueplay/fixed volume; `setSleepTimer/getSleepTimer`; status light, buttons, player name, zone info, `getSpeakerInfo` (device description), `getBattery`, `switchToLineIn`, `switchToTv`, `getLineInLevel`. Test: stub with an EQ store (Get/Set round trip, range clamps), a device_description.xml and a /status/batterystatus fixture copied from SoCo's tests.
4. **Alarms.** `getAlarms`, `createAlarm`, `updateAlarm`, `removeAlarm`, `isValidRecurrence`, time/zone getters, `nextAlarmTime`. Test: stub AlarmClock with `ListAlarms` fixture (2 alarms), create assigns an ID, update/destroy asserted; next-time computed against a fixed `GetTimeNow`.
5. **Library, radio, favorites, shares.** `libraryBrowse` and wrappers, `browse(objectId)`, track/album search, library update/shares, `getRadioStations/Shows`, favorites paging and `resMD`, `addFavorite/removeFavorite` (optional). Test: stub CD with a tiny A:ARTIST/A:ALBUM tree and `R:0/0`; assert object ids requested and paging over 100.
6. **Events (GENA).** `localAddressFor`, `Events` (subscribe, renew timer at 85%, unsubscribe, SID table, handler `handleNotify(req): Reply` plus optional `listen(port)`), `parseEvent` for AVT/RC/GRC/ZGT/CD/AC, `sys.watch()` replacing polling with fallback to poll when SUBSCRIBE fails (412/ firewall). Test: stub accepts SUBSCRIBE (checks CALLBACK/NT/TIMEOUT headers, returns SID), then the test POSTs canned NOTIFY bodies (copy SoCo's `tests/` fixtures: AVTransport LastChange, ZoneGroupState) to the plugin's listener and asserts events and that a renew with SID and an UNSUBSCRIBE happen. This batch also proves the engine verbs (section 2).
7. **Snapshot/restore and stereo/satellite grouping.** `snapshot`, `restore(fade)`, `createStereoPair`, `separateStereoPair`, `addSatellites`, `removeSatellites`, channel-map parsing. Test: stub with state; snapshot, mutate (volume, URI, mode), restore, compare to the recorded request sequence.
8. **Share links.** `isShareLink`, `addShareLinkToQueue` for Spotify (open.spotify.com and `spotify:`), Spotify US, Tidal, Deezer, Apple Music, with DIDL builder from `ms_data_structures` (`MsItem.didl()`); generalise `spotifyItem` into it. Test: pure string tests (SoCo's `tests/plugins/test_sharelink.py` vectors) plus stub asserting the queued URI/metadata.
9. **Music services (SMAPI).** `listMusicServices`, `getAccounts`, `MusicService`, anonymous browse/search (TuneIn, Sonos Radio), then authenticated flow (`beginAuth/completeAuth`, token store), `getMediaUri`, `sonosUriFromId`. Test: stub SMAPI HTTP server answering `getMetadata`/`search` for a fake service listed by the stub MusicServices. Largest and least valuable for the iPod; last.
10. **Discovery extras and docs.** `scanNetwork` family, multi-reply `discover` with `includeInvisible`, doc `docs/plugins/sonos.md` rewrite to table form, `tests/affected.json` mapping, CHANGELOG lines (each batch adds its own CHANGELOG line and docs rows; this one closes the list).

The iPod app and `ipod-web` get value in this order: batches 1, 6 (live state without polling), 2, 3, 4, 5, then the rest.

## 4. Open points for the owner's information (decided here)

- Style stays `System`-centred, not a `SoCo` object per speaker (decided: it matches existing callers in `examples/music`, `music-tree`, `ipod`).
- Index base for queue calls: zinc 1-based (as today), SoCo 0-based; documented in the doc table, no silent change.
- No SCPD introspection, no SoCo cache layers, no multi-process singleton handling.
- Alias names (`unjoin`, SoCo spellings) are cheap; add only where the iPod code wants them.
