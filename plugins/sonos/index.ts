// zinc:sonos — Sonos speakers on the local network, through their UPnP API on port 1400 (docs/plugins/sonos.md,
// docs/reports/sonos-upnp-api.md): discovery, rooms and groups, what plays, transport, volume, grouping, favorites and radio streams.
// Written in Zinc on zinc:socket (SSDP) and fetch. No Sonos account, no cloud.
import { udp } from 'zinc:socket';
import { utf8Decode } from 'zinc:sys';
import { tag, attr, escape } from './xml';

const TIMEOUT_MS = 4000;

/** One room as the Sonos app shows it (a stereo pair or a home theatre with its satellites is one speaker). */
export class Speaker {
  uuid: string = '';
  name: string = '';
  ip: string = '';
  /** The uuid of the coordinator of its group. */
  coordinator: string = '';
  /** 0..100, -1 until read with System.readVolumes. */
  volume: i32 = -1;
  muted: boolean = false;
}

/** What a group plays. `source`: 'spotify' (Spotify Connect), 'radio', 'queue' (music queued by a Sonos app), 'line-in', 'tv',
 *  'airplay', 'stream' (another service) or 'none'. */
export class Track {
  title: string = '';
  artist: string = '';
  album: string = '';
  /** An absolute URL of the cover ('' when none). */
  art: string = '';
  /** Seconds; 0 when unknown (a radio). */
  duration: number = 0;
  position: number = 0;
  source: string = 'none';
  /** The station's or the service's name for a stream. */
  station: string = '';
  uri: string = '';
}

/** Speakers that play together; commands go to the coordinator. */
export class Group {
  id: string = '';
  coordinator: Speaker = new Speaker();
  members: Speaker[] = [];
  /** PLAYING, PAUSED_PLAYBACK, STOPPED or TRANSITIONING. */
  state: string = 'STOPPED';
  track: Track = new Track();
  /** 0..100, -1 until read with System.update. */
  volume: i32 = -1;
  /** NORMAL, SHUFFLE, REPEAT_ALL, SHUFFLE_NOREPEAT, REPEAT_ONE, SHUFFLE_REPEAT_ONE. */
  playMode: string = 'NORMAL';
  /** Actions the speaker accepts now (Play, Pause, Next, Previous, Seek...), from CurrentTransportActions. */
  actions: string = '';
  /** The rooms' names, the coordinator first: 'Salon + Bureau'. */
  name(): string { return this.members.map((m: Speaker) => m.name).join(' + '); }
  playing(): boolean { return this.state === 'PLAYING' || this.state === 'TRANSITIONING'; }
  can(action: string): boolean { return this.actions === '' || this.actions.indexOf(action) >= 0; }
}

/** An entry of the Sonos favorites (FV:2): a station, a playlist of a service, an album... */
export class Favorite {
  title: string = '';
  art: string = '';
  uri: string = '';
  /** The DIDL of the item, sent back as is to play it. */
  meta: string = '';
  /** True for a container (a playlist, an album): it is queued; a stream is played directly. */
  container: boolean = false;
}

/** Envelope of one UPnP action, sent to a speaker; the answer's text. @throws Error('Action: UPnP 701') on a fault */
export async function soap(ip: string, service: string, path: string, action: string, args: string): Promise<string> {
  const body = '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">'
    + `<s:Body><u:${action} xmlns:u="urn:schemas-upnp-org:service:${service}:1">${args}</u:${action}></s:Body></s:Envelope>`;
  const r = await fetch(`http://${ip}:1400${path}`, {
    method: 'POST', body, timeoutMs: TIMEOUT_MS,
    headers: [['Content-Type', 'text/xml; charset="utf-8"'], ['SOAPACTION', `"urn:schemas-upnp-org:service:${service}:1#${action}"`]],
  });
  const text = await r.text();
  if (r.status !== 200) {
    const code = tag(text, 'errorCode');
    throw new Error(`${action}: UPnP ${code !== '' ? code : '' + r.status}`);
  }
  return text;
}

const AVT = '/MediaRenderer/AVTransport/Control', RC = '/MediaRenderer/RenderingControl/Control', GRC = '/MediaRenderer/GroupRenderingControl/Control';
const CD = '/MediaServer/ContentDirectory/Control', ZGT = '/ZoneGroupTopology/Control';
const I0 = '<InstanceID>0</InstanceID>';

function avt(g: Group, action: string, args: string = ''): Promise<string> { return soap(g.coordinator.ip, 'AVTransport', AVT, action, I0 + args); }
function seconds(hms: string): number {
  const p = hms.split(':');
  return p.length === 3 ? parseInt(p[0]) * 3600 + parseInt(p[1]) * 60 + parseInt(p[2]) : 0;
}
function hms(s: number): string {
  const t = Math.max(0, Math.floor(s)) as i32;
  const two = (n: i32): string => (n < 10 ? '0' : '') + n;
  return `${Math.floor(t / 3600)}:${two((Math.floor(t / 60) as i32) % 60)}:${two(t % 60)}`;
}

/** The kind of source a transport URI names. */
export function sourceOf(uri: string): string {
  if (uri === '') return 'none';
  if (uri.indexOf('spotify') >= 0 && (uri.startsWith('x-sonos-vli:') || uri.startsWith('x-sonos-spotify:'))) return 'spotify';
  if (uri.startsWith('x-rincon-queue:')) return 'queue';
  if (uri.startsWith('x-sonos-htastream:')) return 'tv';
  if (uri.startsWith('x-rincon-stream:')) return 'line-in';
  if (uri.startsWith('x-sonos-vli:') && uri.indexOf('airplay') >= 0) return 'airplay';
  if (uri.startsWith('x-rincon-mp3radio:') || uri.startsWith('x-sonosapi-stream:') || uri.startsWith('x-sonosapi-radio:') || uri.startsWith('aac:') || uri.startsWith('x-sonosapi-hls:')) return 'radio';
  return 'stream';
}

/** The household: every room and group, refreshed with refresh(). */
export class System {
  speakers: Speaker[] = [];
  groups: Group[] = [];
  /** The address of a speaker that answered last: the next refresh asks it. */
  seed: string = '';

  constructor(seed: string) { this.seed = seed; }

  speaker(uuid: string): Speaker | null { for (const s of this.speakers) if (s.uuid === uuid) return s; return null; }
  group(id: string): Group | null { for (const g of this.groups) if (g.id === id) return g; return null; }
  /** The group a room belongs to. */
  groupOf(s: Speaker): Group | null { for (const g of this.groups) if (g.coordinator.uuid === s.coordinator) return g; return null; }

  /** Reads the rooms and groups again (ZoneGroupTopology). Volumes and tracks already read are kept for the groups that remain.
   *  @throws when no speaker answers */
  async refresh(): Promise<void> {
    const text = await soap(this.seed, 'ZoneGroupTopology', ZGT, 'GetZoneGroupState', '');
    const state = tag(text, 'ZoneGroupState');
    const old = this.groups;
    const speakers: Speaker[] = [], groups: Group[] = [];
    for (const chunk of state.split('<ZoneGroup ').slice(1)) {
      const coord = attr(chunk.slice(0, chunk.indexOf('>')), 'Coordinator');
      const g = new Group();
      g.id = attr(chunk.slice(0, chunk.indexOf('>')), 'ID');
      for (const m of chunk.split('<ZoneGroupMember ').slice(1)) {
        const head = m.slice(0, m.indexOf('>'));
        if (attr(head, 'Invisible') === '1' || attr(head, 'IsZoneBridge') === '1') continue;
        const s = new Speaker();
        s.uuid = attr(head, 'UUID'); s.name = attr(head, 'ZoneName'); s.coordinator = coord;
        const loc = attr(head, 'Location');   // http://192.168.2.134:1400/xml/device_description.xml
        s.ip = loc.slice(7, loc.indexOf(':', 7));
        const before = this.speaker(s.uuid);
        if (before !== null) { s.volume = before.volume; s.muted = before.muted; }
        speakers.push(s);
        if (s.uuid === coord) { g.coordinator = s; g.members.unshift(s); } else g.members.push(s);
      }
      if (g.members.length === 0 || g.coordinator.uuid === '') continue;
      let same: Group | null = null;   // the same group as before keeps its object: what plays, its volume, and the program's references
      for (const o of old) if (o.coordinator.uuid === g.coordinator.uuid) same = o;
      if (same !== null) { const o = same as Group; o.id = g.id; o.coordinator = g.coordinator; o.members = g.members; groups.push(o); }
      else groups.push(g);
    }
    groups.sort((a: Group, b: Group) => a.name() < b.name() ? -1 : 1);
    this.speakers = speakers; this.groups = groups;
  }

  /** Reads what a group plays: transport state, track, position, source, group volume. */
  async update(g: Group): Promise<void> {
    const info = await avt(g, 'GetTransportInfo');
    g.state = tag(info, 'CurrentTransportState');
    const pos = await avt(g, 'GetPositionInfo');
    const t = new Track();
    t.uri = tag(pos, 'TrackURI');
    t.duration = seconds(tag(pos, 'TrackDuration'));
    t.position = seconds(tag(pos, 'RelTime'));
    const meta = tag(pos, 'TrackMetaData');
    if (meta !== '' && meta !== 'NOT_IMPLEMENTED') {
      t.title = tag(meta, 'dc:title'); t.artist = tag(meta, 'dc:creator'); t.album = tag(meta, 'upnp:album');
      t.art = tag(meta, 'upnp:albumArtURI');
      const now = tag(meta, 'r:streamContent');   // a radio's current song, 'Artist - Title' or a show
      if (now !== '') { const d = now.indexOf(' - '); if (d > 0) { t.artist = now.slice(0, d); t.title = now.slice(d + 3); } else t.title = now; }
    }
    const media = await avt(g, 'GetMediaInfo');
    const current = tag(media, 'CurrentURI');
    t.source = sourceOf(current !== '' ? current : t.uri);
    const cmeta = tag(media, 'CurrentURIMetaData');
    if (cmeta !== '' && cmeta !== 'NOT_IMPLEMENTED') t.station = tag(cmeta, 'dc:title');
    if (t.source === 'radio' || t.source === 'stream') {
      if (t.title === '' || t.title === t.uri || t.title.startsWith('x-')) { t.title = t.station; t.artist = ''; }
      if (t.art === '') t.art = tag(cmeta, 'upnp:albumArtURI');
    }
    if (t.art.startsWith('/')) t.art = `http://${g.coordinator.ip}:1400${t.art}`;
    g.track = t;
    const actions = await avt(g, 'GetCurrentTransportActions');
    g.actions = tag(actions, 'Actions');
    const settings = await avt(g, 'GetTransportSettings');
    g.playMode = tag(settings, 'PlayMode');
    const vol = await soap(g.coordinator.ip, 'GroupRenderingControl', GRC, 'GetGroupVolume', I0);
    g.volume = parseInt(tag(vol, 'CurrentVolume')) as i32;
  }

  /** Reads the volume and mute of every room of a group. */
  async readVolumes(g: Group): Promise<void> {
    for (let i = 0; i < g.members.length; i++) {   // ponytail: an index loop, `for (const s of ...)` with an await and a field write fails to compile (Z0108)
      const s = g.members[i];
      const v = await soap(s.ip, 'RenderingControl', RC, 'GetVolume', I0 + '<Channel>Master</Channel>');
      const m = await soap(s.ip, 'RenderingControl', RC, 'GetMute', I0 + '<Channel>Master</Channel>');
      s.volume = parseInt(tag(v, 'CurrentVolume')) as i32;
      s.muted = tag(m, 'CurrentMute') === '1';
    }
  }

  async play(g: Group): Promise<void> { await avt(g, 'Play', '<Speed>1</Speed>'); g.state = 'PLAYING'; }
  async pause(g: Group): Promise<void> { await avt(g, g.can('Pause') ? 'Pause' : 'Stop'); g.state = 'PAUSED_PLAYBACK'; }
  async next(g: Group): Promise<void> { await avt(g, 'Next'); }
  async previous(g: Group): Promise<void> { await avt(g, 'Previous'); }
  /** Where a track is in the group's queue, 1 for the first, 0 when it is not in its first `max` entries: `part` is a piece of its URI (a
   *  Spotify track's id, which the queue's x-sonos-spotify URIs carry). */
  async queueIndex(g: Group, part: string, max: i32 = 500): Promise<i32> {
    for (let start: i32 = 0; start < max; start += 100) {
      const text = await soap(g.coordinator.ip, 'ContentDirectory', CD, 'Browse',
        `<ObjectID>Q:0</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter><StartingIndex>${start}</StartingIndex><RequestedCount>100</RequestedCount><SortCriteria></SortCriteria>`);
      const items = tag(text, 'Result').split('<item ').slice(1);
      for (let i: i32 = 0; i < items.length; i++) if (items[i].indexOf(part) >= 0) return start + i + 1;
      if (items.length < 100) return 0;
    }
    return 0;
  }
  /** Jumps to a track of the queue, 1 for the first. */
  async seekTrack(g: Group, n: i32): Promise<void> { await avt(g, 'Seek', `<Unit>TRACK_NR</Unit><Target>${n}</Target>`); }
  async seek(g: Group, s: number): Promise<void> { await avt(g, 'Seek', `<Unit>REL_TIME</Unit><Target>${hms(s)}</Target>`); g.track.position = s; }
  /** NORMAL, SHUFFLE_NOREPEAT, REPEAT_ALL, SHUFFLE (shuffle and repeat all), REPEAT_ONE, SHUFFLE_REPEAT_ONE. */
  async setPlayMode(g: Group, mode: string): Promise<void> { await avt(g, 'SetPlayMode', `<NewPlayMode>${mode}</NewPlayMode>`); g.playMode = mode; }

  /** The whole group's volume, the rooms keeping their balance. */
  async setGroupVolume(g: Group, v: i32): Promise<void> {
    await soap(g.coordinator.ip, 'GroupRenderingControl', GRC, 'SnapshotGroupVolume', I0);
    await soap(g.coordinator.ip, 'GroupRenderingControl', GRC, 'SetGroupVolume', I0 + `<DesiredVolume>${v}</DesiredVolume>`);
    g.volume = v;
  }
  async setVolume(s: Speaker, v: i32): Promise<void> {
    await soap(s.ip, 'RenderingControl', RC, 'SetVolume', I0 + `<Channel>Master</Channel><DesiredVolume>${v}</DesiredVolume>`);
    s.volume = v;
  }
  async setMute(s: Speaker, muted: boolean): Promise<void> {
    await soap(s.ip, 'RenderingControl', RC, 'SetMute', I0 + `<Channel>Master</Channel><DesiredMute>${muted ? 1 : 0}</DesiredMute>`);
    s.muted = muted;
  }

  /** Makes a room play with a group (it leaves its own). */
  async join(s: Speaker, g: Group): Promise<void> {
    await soap(s.ip, 'AVTransport', AVT, 'SetAVTransportURI', I0 + `<CurrentURI>x-rincon:${g.coordinator.uuid}</CurrentURI><CurrentURIMetaData></CurrentURIMetaData>`);
  }
  /** Takes a room out of its group: it plays alone (and stops). */
  async leave(s: Speaker): Promise<void> { await soap(s.ip, 'AVTransport', AVT, 'BecomeCoordinatorOfStandaloneGroup', I0); }

  /** Plays an internet radio stream (MP3 or AAC over HTTP) on a group, with the station's name shown by every Sonos app. */
  async playStream(g: Group, url: string, name: string, art: string = ''): Promise<void> {
    const scheme = url.indexOf('://');
    const uri = 'x-rincon-mp3radio://' + (scheme >= 0 ? url.slice(scheme + 3) : url);
    const didl = '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">'
      + `<item id="R:0/0/0" parentID="R:0/0" restricted="true"><dc:title>${escape(name)}</dc:title>`
      + (art !== '' ? `<upnp:albumArtURI>${escape(art)}</upnp:albumArtURI>` : '')
      + '<upnp:class>object.item.audioItem.audioBroadcast</upnp:class><desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">SA_RINCON65031_</desc></item></DIDL-Lite>';
    await avt(g, 'SetAVTransportURI', `<CurrentURI>${escape(uri)}</CurrentURI><CurrentURIMetaData>${escape(didl)}</CurrentURIMetaData>`);
    await this.play(g);
  }

  /** The Sonos favorites (as saved in the Sonos app). */
  async favorites(): Promise<Favorite[]> {
    const text = await soap(this.seed, 'ContentDirectory', CD, 'Browse',
      '<ObjectID>FV:2</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter><StartingIndex>0</StartingIndex><RequestedCount>200</RequestedCount><SortCriteria></SortCriteria>');
    const didl = tag(text, 'Result');
    const out: Favorite[] = [];
    for (const item of didl.split('<item ').slice(1)) {
      const f = new Favorite();
      f.title = tag(item, 'dc:title'); f.uri = tag(item, 'res'); f.meta = tag(item, 'r:resMD'); f.art = tag(item, 'upnp:albumArtURI');
      if (f.art.startsWith('/')) f.art = `http://${this.seed}:1400${f.art}`;
      f.container = f.meta.indexOf('object.container') >= 0 || f.uri.startsWith('x-rincon-cpcontainer:');
      out.push(f);
    }
    return out;
  }

  async playFavorite(g: Group, f: Favorite): Promise<void> {
    if (!f.container) {
      await avt(g, 'SetAVTransportURI', `<CurrentURI>${escape(f.uri)}</CurrentURI><CurrentURIMetaData>${escape(f.meta)}</CurrentURIMetaData>`);
    } else {
      await avt(g, 'RemoveAllTracksFromQueue');
      await avt(g, 'AddURIToQueue', `<EnqueuedURI>${escape(f.uri)}</EnqueuedURI><EnqueuedURIMetaData>${escape(f.meta)}</EnqueuedURIMetaData><DesiredFirstTrackNumberEnqueued>0</DesiredFirstTrackNumberEnqueued><EnqueueAsNext>0</EnqueueAsNext>`);
      await avt(g, 'SetAVTransportURI', `<CurrentURI>x-rincon-queue:${g.coordinator.uuid}#0</CurrentURI><CurrentURIMetaData></CurrentURIMetaData>`);
    }
    await this.play(g);
  }
}

/** The id of a music service in this household ('Spotify': 9 or 12 depending on the region), -1 when it is not offered. */
export async function serviceId(sys: System, name: string): Promise<i32> {
  const text = await soap(sys.seed, 'MusicServices', '/MusicServices/Control', 'ListAvailableServices', '');
  const list = tag(text, 'AvailableServiceDescriptorList');
  for (const svc of list.split('<Service ').slice(1)) {
    const head = svc.slice(0, svc.indexOf('>'));
    if (attr(head, 'Name') === name) return parseInt(attr(head, 'Id')) as i32;
  }
  return -1;
}

/** The account number (sn) of a service in the Sonos favorites, or -1: a favorite saved from that service carries it. */
export async function accountOf(sys: System, sid: i32): Promise<i32> {
  for (const f of await sys.favorites()) {
    const i = f.uri.indexOf(`sid=${sid}&`);
    const n = f.uri.indexOf('sn=');
    if (i >= 0 && n >= 0) return parseInt(f.uri.slice(n + 3)) as i32;
  }
  return -1;
}

/** Plays a Spotify URI (spotify:playlist:..., :album:, :track:, :artist: its top tracks, :user:<id>:collection the liked songs) through the
 *  Spotify service of the speakers, the way the Sonos app does. It works when Spotify Connect sees the speakers as restricted.
 *  `sid`: serviceId(sys, 'Spotify'); `sn`: the account number in the household (accountOf, else 1 for the first account). */
export async function playSpotify(sys: System, g: Group, uri: string, title: string, sid: i32, sn: i32): Promise<void> {
  const parts = uri.split(':');
  const kind = parts.length > 2 && parts[1] === 'user' ? 'collection' : parts.length > 1 ? parts[1] : '';
  const target = kind === 'artist' ? `spotify:artistTopTracks:${parts[2]}` : uri;
  const enc = encodeURIComponent(target).split('%3A').join('%3a');
  const prefix = kind === 'track' ? '00032020' : kind === 'album' ? '1004206c' : kind === 'artist' ? '100e206c' : '1006206c';
  const cls = kind === 'track' ? 'object.item.audioItem.musicTrack' : kind === 'album' ? 'object.container.album.musicAlbum' : 'object.container.playlistContainer';
  const res = kind === 'track' ? `x-sonos-spotify:${enc}?sid=${sid}&flags=8224&sn=${sn}` : `x-rincon-cpcontainer:${prefix}${enc}?sid=${sid}&flags=8300&sn=${sn}`;
  const type = sid * 256 + 7;
  const didl = '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">'
    + `<item id="${prefix}${enc}" parentID="" restricted="true"><dc:title>${escape(title)}</dc:title><upnp:class>${cls}</upnp:class>`
    + `<desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">SA_RINCON${type}_X_#Svc${type}-0-Token</desc></item></DIDL-Lite>`;
  const f = new Favorite();
  f.title = title; f.uri = res; f.meta = didl; f.container = true;   // queued, even a track: the queue is what the Sonos app shows
  await sys.playFavorite(g, f);
}

/** Finds the household: an SSDP search on the network (or `known`, the address of a speaker that answered before), then its
 *  rooms and groups. `port`: the local UDP port of the search, for a device whose firewall must be opened for the answers (0: any).
 *  @throws Error('no Sonos speaker found') when nothing answers within `waitMs` */
export async function discover(known: string = '', waitMs: i32 = 2000, port: i32 = 0): Promise<System> {
  if (known !== '') {
    const sys = new System(known);
    try { await sys.refresh(); return sys; } catch (e) { /* moved or off: search */ }
  }
  const sock = await udp(port);
  let found = '';
  sock.onMessage((m) => { if (found === '' && utf8Decode(m.bytes).indexOf('Sonos') >= 0) found = m.address; });
  const search = 'M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 1\r\nST: urn:schemas-upnp-org:device:ZonePlayer:1\r\n\r\n';
  for (let waited = 0; waited < waitMs && found === ''; waited += 250) {
    if (waited % 1000 === 0) sock.send('239.255.255.250', 1900, search);
    await new Promise<boolean>((done) => { setTimeout(() => done(true), 250); });
  }
  sock.close();
  if (found === '') throw new Error('no Sonos speaker found');
  const sys = new System(found);
  await sys.refresh();
  return sys;
}
