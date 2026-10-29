// zinc:sonos — Sonos speakers on the local network, through their UPnP API on port 1400 (docs/plugins/sonos.md,
// docs/reports/sonos-upnp-api.md): discovery, rooms and groups, what plays, transport, volume, grouping, favorites and radio streams.
// Written in Zinc on zinc:socket (SSDP), fetch and zinc:xml. No Sonos account, no cloud. The names follow SoCo
// (github.com/SoCo/SoCo) in camelCase; docs/reports/sonos-soco-parity.md maps the two.
import { udp } from 'zinc:socket';
import { utf8Decode } from 'zinc:sys';
import { El, parse, escapeXml as escape } from 'zinc:xml';

const TIMEOUT_MS = 4000;
const QUEUE_MS = 20000;   // AddURIToQueue of a list: the speaker fetches all its songs from the service first (a playlist of Spotify: over 4 s)

/** One room as the Sonos app shows it (a stereo pair or a home theatre with its satellites is one speaker). */
export class Speaker {
  uuid: string = '';
  name: string = '';
  ip: string = '';
  /** The UPnP port, 1400 on every Sonos speaker (another one for a stand-in speaker of a test). */
  port: i32 = 1400;
  /** The uuid of the coordinator of its group. */
  coordinator: string = '';
  /** 0..100, -1 until read with System.readVolumes. */
  volume: i32 = -1;
  muted: boolean = false;
  /** False for the hidden parts of a room (the right speaker of a stereo pair, a sub, a satellite) and for a bridge. */
  visible: boolean = true;
  /** A Sonos Bridge or Boost: no sound. */
  bridge: boolean = false;
  /** 'ip:port', what the plugin's calls go to. */
  address(): string { return `${this.ip}:${this.port}`; }
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
  /** In the queue: the song's number (1 for the first) and how many the queue holds; 0 when the group plays no queue. */
  number: i32 = 0;
  count: i32 = 0;
  /** The track's DIDL as the speaker sent it ('' when none). */
  metadata: string = '';
}

/** What a group's transport is set to (GetMediaInfo): the URI (a queue, a stream, a line-in) and its DIDL, the queue's length. */
export class Media {
  uri: string = '';
  meta: string = '';
  nrTracks: i32 = 0;
}

/** A UPnP fault: `code` is the speaker's UPnP error code (701 transition not available, 714 illegal MIME type, 800 command only for the
 *  coordinator...), 0 when the answer carried none (then `status` tells what happened). */
export class UpnpError extends Error {
  code: i32;
  status: i32;
  action: string;
  description: string;
  constructor(action: string, code: i32, status: i32, description: string) {
    super(`${action}: UPnP ${code !== 0 ? code : status}${description !== '' ? ' (' + description + ')' : ''}`);
    this.action = action; this.code = code; this.status = status; this.description = description;
  }
}

// SoCo's table of the UPnP and Sonos error codes (services.py), for an answer that carries no errorDescription.
const ERRORS: string[] = ['400', 'Bad Request', '401', 'Invalid Action', '402', 'Invalid Args', '404', 'Invalid Var', '412', 'Precondition Failed',
  '501', 'Action Failed', '600', 'Argument Value Invalid', '601', 'Argument Value Out of Range', '602', 'Optional Action Not Implemented',
  '603', 'Out Of Memory', '604', 'Human Intervention Required', '605', 'String Argument Too Long', '606', 'Action Not Authorized',
  '607', 'Signature Failure', '608', 'Signature Missing', '609', 'Not Encrypted', '610', 'Invalid Sequence', '611', 'Invalid Control URL',
  '612', 'No Such Session', '701', 'Transition not available', '702', 'No contents', '703', 'Read error', '704', 'Format not supported for playback',
  '705', 'Transport is locked', '706', 'Write error', '707', 'Media is protected or not writeable', '708', 'Format not supported for recording',
  '709', 'Media is full', '710', 'Seek mode not supported', '711', 'Illegal seek target', '712', 'Play mode not supported',
  '713', 'Record quality not supported', '714', 'Illegal MIME-Type', '715', 'Content BUSY', '716', 'Resource Not found', '717', 'Play speed not supported',
  '718', 'Invalid InstanceID', '737', 'No DNS Server', '738', 'Bad Domain Name', '739', 'Server Error', '800', 'Command only for the group coordinator'];
function errorText(code: i32): string { const i = ERRORS.indexOf('' + code); return i >= 0 && i % 2 === 0 ? ERRORS[i + 1] : ''; }

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
  /** OK or ERROR_OCCURRED (CurrentTransportStatus). */
  status: string = 'OK';
  media: Media = new Media();
  /** The group's mute (GroupRenderingControl), read by update. */
  muted: boolean = false;
  /** The rooms' names, the coordinator first: 'Salon + Bureau'. */
  name(): string { return this.members.map((m: Speaker) => m.name).join(' + '); }
  playing(): boolean { return this.state === 'PLAYING' || this.state === 'TRANSITIONING'; }
  can(action: string): boolean { return this.actions === '' || this.actions.indexOf(action) >= 0; }
  isPlayingRadio(): boolean { return this.track.source === 'radio'; }
  isPlayingLineIn(): boolean { return this.track.source === 'line-in'; }
  isPlayingTv(): boolean { return this.track.source === 'tv'; }
  /** From the play mode: shuffled, and 'none', 'all' or 'one' for the repeat. */
  shuffle(): boolean { return this.playMode.startsWith('SHUFFLE'); }
  repeat(): string { return this.playMode === 'REPEAT_ALL' || this.playMode === 'SHUFFLE' ? 'all' : this.playMode.endsWith('REPEAT_ONE') ? 'one' : 'none'; }
}

/** The play mode for a shuffle and a repeat ('none', 'all', 'one'), as SoCo's PLAY_MODES table. */
export function playModeOf(shuffle: boolean, repeat: string): string {
  if (repeat === 'all') return shuffle ? 'SHUFFLE' : 'REPEAT_ALL';
  if (repeat === 'one') return shuffle ? 'SHUFFLE_REPEAT_ONE' : 'REPEAT_ONE';
  return shuffle ? 'SHUFFLE_NOREPEAT' : 'NORMAL';
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

/** A song file a group plays from a plain http:// URL (a computer's own server on the LAN, an iPod daemon): MP3, AAC or ALAC in
 *  MP4 (.m4a), FLAC, WAV. The server should answer byte ranges: the speaker seeks with them. */
export class Song {
  url: string = '';
  title: string = '';
  artist: string = '';
  album: string = '';
  /** An absolute http:// URL of the cover, '' when none. */
  art: string = '';
  /** The file's MIME type ('audio/mpeg', 'audio/mp4'...), '*' when unknown. */
  mime: string = '*';
  /** Seconds, 0 when unknown. */
  duration: number = 0;
}

/** The DIDL of a song, an object.item.audioItem.musicTrack as SoCo writes it (DidlMusicTrack), for playUri and addUriToQueue: every
 *  Sonos app then shows its title, artist, album and cover. */
export function musicTrackMeta(s: Song): string {
  return '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">'
    + `<item id="-1" parentID="-1" restricted="true"><res protocolInfo="http-get:*:${escape(s.mime)}:*"${s.duration > 0 ? ` duration="${hms(s.duration)}"` : ''}>${escape(s.url)}</res>`
    + `<dc:title>${escape(s.title)}</dc:title><upnp:class>object.item.audioItem.musicTrack</upnp:class>`
    + (s.artist !== '' ? `<dc:creator>${escape(s.artist)}</dc:creator>` : '') + (s.album !== '' ? `<upnp:album>${escape(s.album)}</upnp:album>` : '')
    + (s.art !== '' ? `<upnp:albumArtURI>${escape(s.art)}</upnp:albumArtURI>` : '')
    + '<desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">RINCON_AssociatedZPUDN</desc></item></DIDL-Lite>';
}

/** 'ip:port' for an address given with or without its port (1400). */
export function hostPort(address: string): string { return address.indexOf(':') >= 0 ? address : address + ':1400'; }

/** Envelope of one UPnP action, sent to a speaker (`address`: 'ip' or 'ip:port'); the answer's element (u:<action>Response), whose
 *  children are the out arguments. @throws UpnpError on a fault */
export async function soap(address: string, service: string, path: string, action: string, args: string, timeoutMs: i32 = TIMEOUT_MS): Promise<El> {
  const body = '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">'
    + `<s:Body><u:${action} xmlns:u="urn:schemas-upnp-org:service:${service}:1">${args}</u:${action}></s:Body></s:Envelope>`;
  const r = await fetch(`http://${hostPort(address)}${path}`, {
    method: 'POST', body, timeoutMs,
    headers: [['Content-Type', 'text/xml; charset="utf-8"'], ['SOAPACTION', `"urn:schemas-upnp-org:service:${service}:1#${action}"`]],
  });
  const doc = parse(await r.text());
  if (r.status !== 200) {
    const code = (parseInt(doc.textOf('errorCode')) || 0) as i32;
    const said = doc.textOf('errorDescription');
    throw new UpnpError(action, code, r.status, said !== '' ? said : errorText(code));
  }
  const answer = doc.find(action + 'Response');
  return answer !== null ? answer : new El('');
}

/** An absolute URL of a cover: a speaker's own path ('/getaa?...') gets its address. */
export function artUri(address: string, art: string): string { return art.startsWith('/') ? `http://${hostPort(address)}${art}` : art; }

const AVT = '/MediaRenderer/AVTransport/Control', RC = '/MediaRenderer/RenderingControl/Control', GRC = '/MediaRenderer/GroupRenderingControl/Control';
const CD = '/MediaServer/ContentDirectory/Control', ZGT = '/ZoneGroupTopology/Control';
const I0 = '<InstanceID>0</InstanceID>';

function avt(g: Group, action: string, args: string = '', timeoutMs: i32 = TIMEOUT_MS): Promise<El> { return soap(g.coordinator.address(), 'AVTransport', AVT, action, I0 + args, timeoutMs); }
function grc(g: Group, action: string, args: string = ''): Promise<El> { return soap(g.coordinator.address(), 'GroupRenderingControl', GRC, action, I0 + args); }
function rc(s: Speaker, action: string, args: string = ''): Promise<El> { return soap(s.address(), 'RenderingControl', RC, action, I0 + args); }
/** The DIDL a SOAP text field holds ('' and NOT_IMPLEMENTED read as no element). */
function didl(text: string): El { return text === '' || text === 'NOT_IMPLEMENTED' ? new El('') : parse(text); }
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
  /** The visible rooms. */
  speakers: Speaker[] = [];
  /** Every member of the topology, the hidden ones too (a stereo pair's right speaker, a sub, satellites, bridges). */
  allSpeakers: Speaker[] = [];
  groups: Group[] = [];
  /** The address of a speaker that answered last ('ip' or 'ip:port'): the next refresh asks it. */
  seed: string = '';

  constructor(seed: string) { this.seed = seed; }

  speaker(uuid: string): Speaker | null { for (const s of this.speakers) if (s.uuid === uuid) return s; return null; }
  /** A visible room by its name (SoCo's by_name), null when none. */
  speakerByName(name: string): Speaker | null { for (const s of this.speakers) if (s.name === name) return s; return null; }
  group(id: string): Group | null { for (const g of this.groups) if (g.id === id) return g; return null; }
  /** The group a room belongs to. */
  groupOf(s: Speaker): Group | null { for (const g of this.groups) if (g.coordinator.uuid === s.coordinator) return g; return null; }

  /** Reads the rooms and groups again (ZoneGroupTopology). Volumes and tracks already read are kept for the groups that remain.
   *  @throws when no speaker answers */
  async refresh(): Promise<void> {
    const r = await soap(this.seed, 'ZoneGroupTopology', ZGT, 'GetZoneGroupState', '');
    this.applyTopology(r.textOf('ZoneGroupState'));
  }

  /** Takes a ZoneGroupState document (from GetZoneGroupState or a ZoneGroupTopology event). */
  applyTopology(state: string): void {
    const old = this.groups;
    const speakers: Speaker[] = [], all: Speaker[] = [], groups: Group[] = [];
    for (const zg of parse(state).findAll('ZoneGroup')) {
      const coord = zg.attr('Coordinator');
      const g = new Group();
      g.id = zg.attr('ID');
      for (const m of zg.all('ZoneGroupMember')) {
        const s = new Speaker();
        s.uuid = m.attr('UUID'); s.name = m.attr('ZoneName'); s.coordinator = coord;
        s.visible = m.attr('Invisible') !== '1'; s.bridge = m.attr('IsZoneBridge') === '1';
        const loc = m.attr('Location');   // http://192.168.2.134:1400/xml/device_description.xml
        const host = loc.slice(7, loc.indexOf('/', 7));
        const colon = host.indexOf(':');
        s.ip = colon >= 0 ? host.slice(0, colon) : host;
        if (colon >= 0) s.port = (parseInt(host.slice(colon + 1)) || 1400) as i32;
        const before = this.speaker(s.uuid);
        if (before !== null) { s.volume = before.volume; s.muted = before.muted; }
        all.push(s);
        if (!s.visible || s.bridge) continue;
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
    this.speakers = speakers; this.allSpeakers = all; this.groups = groups;
  }

  /** Reads what a group plays: transport state, track, position, source, play mode, group volume and mute. */
  async update(g: Group): Promise<void> {
    const info = await avt(g, 'GetTransportInfo');
    g.state = info.textOf('CurrentTransportState');
    const status = info.textOf('CurrentTransportStatus');
    g.status = status !== '' ? status : 'OK';
    const pos = await avt(g, 'GetPositionInfo');
    const media = await avt(g, 'GetMediaInfo');
    g.media = new Media();
    g.media.uri = media.textOf('CurrentURI'); g.media.meta = media.textOf('CurrentURIMetaData');
    g.media.nrTracks = (parseInt(media.textOf('NrTracks')) || 0) as i32;
    g.track = this.trackOf(g, pos.textOf('TrackURI'), pos.textOf('TrackMetaData'), pos.textOf('TrackDuration'), (parseInt(pos.textOf('Track')) || 0) as i32);
    g.track.position = seconds(pos.textOf('RelTime'));
    const actions = await avt(g, 'GetCurrentTransportActions');
    g.actions = actions.textOf('Actions');
    const settings = await avt(g, 'GetTransportSettings');
    g.playMode = settings.textOf('PlayMode');
    const vol = await grc(g, 'GetGroupVolume');
    g.volume = parseInt(vol.textOf('CurrentVolume')) as i32;
    const mute = await grc(g, 'GetGroupMute');
    g.muted = mute.textOf('CurrentMute') === '1';
  }

  /** A track from what GetPositionInfo or an AVTransport event says, with g.media read before. */
  trackOf(g: Group, uri: string, metadata: string, duration: string, number: i32): Track {
    const t = new Track();
    t.uri = uri;
    t.duration = seconds(duration);
    t.metadata = metadata === 'NOT_IMPLEMENTED' ? '' : metadata;
    const meta = didl(metadata);
    t.title = meta.textOf('dc:title'); t.artist = meta.textOf('dc:creator'); t.album = meta.textOf('upnp:album');
    t.art = meta.textOf('upnp:albumArtURI');
    const now = meta.textOf('r:streamContent');   // a radio's current song, 'Artist - Title' or a show
    if (now !== '') { const d = now.indexOf(' - '); if (d > 0) { t.artist = now.slice(0, d); t.title = now.slice(d + 3); } else t.title = now; }
    const current = g.media.uri;
    if (current.startsWith('x-rincon-queue:')) { t.number = number; t.count = g.media.nrTracks; }
    t.source = sourceOf(current !== '' ? current : t.uri);
    const cmeta = didl(g.media.meta);
    t.station = cmeta.textOf('dc:title');
    if (t.source === 'radio' || t.source === 'stream') {
      if (t.title === '' || t.title === t.uri || t.title.startsWith('x-')) { t.title = t.station; t.artist = ''; }
      if (t.art === '') t.art = cmeta.textOf('upnp:albumArtURI');
    }
    t.art = artUri(g.coordinator.address(), t.art);
    return t;
  }

  /** Reads the volume and mute of every room of a group. */
  async readVolumes(g: Group): Promise<void> {
    for (let i = 0; i < g.members.length; i++) {   // ponytail: an index loop, `for (const s of ...)` with an await and a field write fails to compile (Z0108)
      const s = g.members[i];
      const v = await rc(s, 'GetVolume', '<Channel>Master</Channel>');
      const m = await rc(s, 'GetMute', '<Channel>Master</Channel>');
      s.volume = parseInt(v.textOf('CurrentVolume')) as i32;
      s.muted = m.textOf('CurrentMute') === '1';
    }
  }

  async play(g: Group): Promise<void> { await avt(g, 'Play', '<Speed>1</Speed>'); g.state = 'PLAYING'; }
  async pause(g: Group): Promise<void> { await avt(g, g.can('Pause') ? 'Pause' : 'Stop'); g.state = 'PAUSED_PLAYBACK'; }
  async stop(g: Group): Promise<void> { await avt(g, 'Stop'); g.state = 'STOPPED'; }
  async next(g: Group): Promise<void> { await avt(g, 'Next'); }
  async previous(g: Group): Promise<void> { await avt(g, 'Previous'); }
  /** Ends a session a music service app holds on the group (Spotify Connect...), so a Sonos command takes it back. */
  async endDirectControlSession(g: Group): Promise<void> { await avt(g, 'EndDirectControlSession'); }
  /** Where a track is in the group's queue, 1 for the first, 0 when it is not in its first `max` entries: `part` is a piece of its URI (a
   *  Spotify track's id, which the queue's x-sonos-spotify URIs carry). */
  async queueIndex(g: Group, part: string, max: i32 = 3000): Promise<i32> {
    for (let start: i32 = 0; start < max; start += 100) {
      const r = await soap(g.coordinator.address(), 'ContentDirectory', CD, 'Browse',
        `<ObjectID>Q:0</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter><StartingIndex>${start}</StartingIndex><RequestedCount>100</RequestedCount><SortCriteria></SortCriteria>`);
      const items = parse(r.textOf('Result')).all('item');
      for (let i: i32 = 0; i < items.length; i++) if (items[i].textOf('res').indexOf(part) >= 0) return start + i + 1;
      if (items.length < 100) return 0;
    }
    return 0;
  }
  /** The URI of the queue's entry `n` (1 for the first), '' when there is none. */
  async queueEntry(g: Group, n: i32): Promise<string> {
    const r = await soap(g.coordinator.address(), 'ContentDirectory', CD, 'Browse',
      `<ObjectID>Q:0</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter><StartingIndex>${n - 1}</StartingIndex><RequestedCount>1</RequestedCount><SortCriteria></SortCriteria>`);
    return parse(r.textOf('Result')).textOf('res');
  }
  /** Takes the queue's entry `n` (1 for the first) out. */
  async removeFromQueue(g: Group, n: i32): Promise<void> { await avt(g, 'RemoveTrackFromQueue', `<ObjectID>Q:0/${n}</ObjectID><UpdateID>0</UpdateID>`); }
  /** Jumps to a track of the queue, 1 for the first. */
  async seekTrack(g: Group, n: i32): Promise<void> { await avt(g, 'Seek', `<Unit>TRACK_NR</Unit><Target>${n}</Target>`); }
  async seek(g: Group, s: number): Promise<void> { await avt(g, 'Seek', `<Unit>REL_TIME</Unit><Target>${hms(s)}</Target>`); g.track.position = s; }
  /** NORMAL, SHUFFLE_NOREPEAT, REPEAT_ALL, SHUFFLE (shuffle and repeat all), REPEAT_ONE, SHUFFLE_REPEAT_ONE. */
  async setPlayMode(g: Group, mode: string): Promise<void> { await avt(g, 'SetPlayMode', `<NewPlayMode>${mode}</NewPlayMode>`); g.playMode = mode; }
  /** Shuffles or not, the repeat kept (from g.playMode: update first). */
  async setShuffle(g: Group, on: boolean): Promise<void> { await this.setPlayMode(g, playModeOf(on, g.repeat())); }
  /** 'none', 'all' or 'one', the shuffle kept (from g.playMode: update first). */
  async setRepeat(g: Group, repeat: string): Promise<void> { await this.setPlayMode(g, playModeOf(g.shuffle(), repeat)); }
  async getCrossFade(g: Group): Promise<boolean> { return (await avt(g, 'GetCrossfadeMode')).textOf('CrossfadeMode') === '1'; }
  async setCrossFade(g: Group, on: boolean): Promise<void> { await avt(g, 'SetCrossfadeMode', `<CrossfadeMode>${on ? 1 : 0}</CrossfadeMode>`); }

  /** The whole group's volume, the rooms keeping their balance. */
  async setGroupVolume(g: Group, v: i32): Promise<void> {
    await grc(g, 'SnapshotGroupVolume');
    await grc(g, 'SetGroupVolume', `<DesiredVolume>${v}</DesiredVolume>`);
    g.volume = v;
  }
  /** Moves the group's volume by `delta` (-100..100); returns the new volume. */
  async setRelativeGroupVolume(g: Group, delta: i32): Promise<i32> {
    await grc(g, 'SnapshotGroupVolume');
    const r = await grc(g, 'SetRelativeGroupVolume', `<Adjustment>${delta}</Adjustment>`);
    g.volume = (parseInt(r.textOf('NewVolume')) || 0) as i32;
    return g.volume;
  }
  async getGroupMute(g: Group): Promise<boolean> { g.muted = (await grc(g, 'GetGroupMute')).textOf('CurrentMute') === '1'; return g.muted; }
  async setGroupMute(g: Group, muted: boolean): Promise<void> { await grc(g, 'SetGroupMute', `<DesiredMute>${muted ? 1 : 0}</DesiredMute>`); g.muted = muted; }
  async setVolume(s: Speaker, v: i32): Promise<void> {
    await rc(s, 'SetVolume', `<Channel>Master</Channel><DesiredVolume>${v}</DesiredVolume>`);
    s.volume = v;
  }
  async setMute(s: Speaker, muted: boolean): Promise<void> {
    await rc(s, 'SetMute', `<Channel>Master</Channel><DesiredMute>${muted ? 1 : 0}</DesiredMute>`);
    s.muted = muted;
  }

  /** Makes a room play with a group (it leaves its own). */
  async join(s: Speaker, g: Group): Promise<void> {
    await soap(s.address(), 'AVTransport', AVT, 'SetAVTransportURI', I0 + `<CurrentURI>x-rincon:${g.coordinator.uuid}</CurrentURI><CurrentURIMetaData></CurrentURIMetaData>`);
  }
  /** Takes a room out of its group: it plays alone (and stops). */
  async leave(s: Speaker): Promise<void> { await soap(s.address(), 'AVTransport', AVT, 'BecomeCoordinatorOfStandaloneGroup', I0); }
  /** SoCo's name for leave. */
  async unjoin(s: Speaker): Promise<void> { await this.leave(s); }
  /** Every other visible room joins the group of `s` (SoCo's partymode). */
  async partyMode(s: Speaker): Promise<void> {
    const g = this.groupOf(s);
    if (g === null) return;
    const list = this.speakers.slice();
    for (let i = 0; i < list.length; i++) if (list[i].coordinator !== s.coordinator) await this.join(list[i], g as Group);
  }

  /** Plays an internet radio stream (MP3 or AAC over HTTP) on a group, with the station's name shown by every Sonos app. */
  async playStream(g: Group, url: string, name: string, art: string = ''): Promise<void> {
    const scheme = url.indexOf('://');
    await this.playUri(g, 'x-rincon-mp3radio://' + (scheme >= 0 ? url.slice(scheme + 3) : url), radioMeta(name, art));
  }

  // A URI and the queue, named as SoCo names them (play_uri, add_uri_to_queue, clear_queue, play_from_queue).

  /** Plays a URI on a group: a song file over http:// (with musicTrackMeta(song) as `meta`), or any URI a speaker takes. As SoCo's
   *  play_uri: with a `title` and no `meta` it is played as a radio named so; `forceRadio` rewrites its scheme to x-rincon-mp3radio;
   *  `start` false sets it without playing. */
  async playUri(g: Group, uri: string, meta: string = '', title: string = '', start: boolean = true, forceRadio: boolean = false): Promise<void> {
    let u = uri;
    if (forceRadio) { const c = u.indexOf(':'); u = 'x-rincon-mp3radio' + (c >= 0 ? u.slice(c) : '://' + u); }
    const m = meta === '' && title !== '' ? radioMeta(title, '') : meta;
    await avt(g, 'SetAVTransportURI', `<CurrentURI>${escape(u)}</CurrentURI><CurrentURIMetaData>${escape(m)}</CurrentURIMetaData>`);
    if (start) await this.play(g);
  }
  /** Adds a URI to the group's queue: at its end (`position` 0), at `position` (1 for the first), or right after the song that plays
   *  (`asNext`). Returns its number in the queue (1 for the first). */
  async addUriToQueue(g: Group, uri: string, meta: string = '', position: i32 = 0, asNext: boolean = false): Promise<i32> {
    const r = await avt(g, 'AddURIToQueue', `<EnqueuedURI>${escape(uri)}</EnqueuedURI><EnqueuedURIMetaData>${escape(meta)}</EnqueuedURIMetaData><DesiredFirstTrackNumberEnqueued>${position}</DesiredFirstTrackNumberEnqueued><EnqueueAsNext>${asNext ? 1 : 0}</EnqueueAsNext>`, QUEUE_MS);
    return (parseInt(r.textOf('FirstTrackNumberEnqueued')) || 0) as i32;
  }
  /** Empties the group's queue. */
  async clearQueue(g: Group): Promise<void> { await avt(g, 'RemoveAllTracksFromQueue'); }
  /** Plays the group's queue from its entry `index` (0 for the first, as SoCo counts): the group then goes on through the queue by itself.
   *  `start` false only selects it. */
  async playFromQueue(g: Group, index: i32, start: boolean = true): Promise<void> {
    await avt(g, 'SetAVTransportURI', `<CurrentURI>x-rincon-queue:${g.coordinator.uuid}#0</CurrentURI><CurrentURIMetaData></CurrentURIMetaData>`);
    await this.seekTrack(g, index + 1);
    if (start) await this.play(g);
  }

  /** The Sonos favorites (as saved in the Sonos app). */
  async favorites(): Promise<Favorite[]> {
    const r = await soap(this.seed, 'ContentDirectory', CD, 'Browse',
      '<ObjectID>FV:2</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter><StartingIndex>0</StartingIndex><RequestedCount>200</RequestedCount><SortCriteria></SortCriteria>');
    const out: Favorite[] = [];
    for (const item of parse(r.textOf('Result')).all('item')) {
      const f = new Favorite();
      f.title = item.textOf('dc:title'); f.uri = item.textOf('res'); f.meta = item.textOf('r:resMD');
      f.art = artUri(this.seed, item.textOf('upnp:albumArtURI'));
      f.container = f.meta.indexOf('object.container') >= 0 || f.uri.startsWith('x-rincon-cpcontainer:');
      out.push(f);
    }
    return out;
  }

  /** Adds a favorite's item at the end of the group's queue, or right after the song that plays (`next`), without touching the rest. */
  async enqueue(g: Group, f: Favorite, next: boolean = false): Promise<void> {
    await this.addUriToQueue(g, f.uri, f.meta, next && g.track.number > 0 ? g.track.number + 1 : 0, next);
  }
  async playFavorite(g: Group, f: Favorite): Promise<void> {
    if (!f.container) {
      await this.playUri(g, f.uri, f.meta, '', false);
    } else {
      await this.clearQueue(g);
      await this.addUriToQueue(g, f.uri, f.meta);
      await avt(g, 'SetAVTransportURI', `<CurrentURI>x-rincon-queue:${g.coordinator.uuid}#0</CurrentURI><CurrentURIMetaData></CurrentURIMetaData>`);
    }
    await this.play(g);
  }
}

/** The DIDL of a radio station: its name (and cover) is what every Sonos app shows. */
function radioMeta(name: string, art: string): string {
  return '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">'
    + `<item id="R:0/0/0" parentID="R:0/0" restricted="true"><dc:title>${escape(name)}</dc:title>`
    + (art !== '' ? `<upnp:albumArtURI>${escape(art)}</upnp:albumArtURI>` : '')
    + '<upnp:class>object.item.audioItem.audioBroadcast</upnp:class><desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">SA_RINCON65031_</desc></item></DIDL-Lite>';
}

/** The id of a music service in this household ('Spotify': 9 or 12 depending on the region), -1 when it is not offered. */
export async function serviceId(sys: System, name: string): Promise<i32> {
  const r = await soap(sys.seed, 'MusicServices', '/MusicServices/Control', 'ListAvailableServices', '');
  for (const svc of parse(r.textOf('AvailableServiceDescriptorList')).findAll('Service')) if (svc.attr('Name') === name) return parseInt(svc.attr('Id')) as i32;
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

/** A Spotify URI as an item of the speakers' Spotify service, the way the Sonos app sends it: spotify:playlist:..., :album:, :track:,
 *  :artist: its top tracks, :user:<id>:collection the liked songs, and Spotify's radios, :trackRadio:<track id> (the song, then songs like
 *  it: what Spotify plays after a list ends) and :artistRadio:<artist id> (proven on S2, 2026-10-19). It works when Spotify Connect sees
 *  the speakers as restricted. `sid`: serviceId(sys, 'Spotify'); `sn`: the account number in the household (accountOf, else 1 for the first). */
export function spotifyItem(uri: string, title: string, sid: i32, sn: i32): Favorite {
  const parts = uri.split(':');
  const kind = parts.length > 2 && parts[1] === 'user' ? 'collection' : parts.length > 1 ? parts[1] : '';
  const target = kind === 'artist' ? `spotify:artistTopTracks:${parts[2]}` : uri;
  const enc = encodeURIComponent(target).split('%3A').join('%3a');
  const radio = kind === 'trackRadio' || kind === 'artistRadio';
  const prefix = kind === 'track' ? '00032020' : kind === 'album' ? '1004206c' : kind === 'artist' ? '100e206c' : radio ? '0006206c' : '1006206c';
  const cls = kind === 'track' ? 'object.item.audioItem.musicTrack' : kind === 'album' ? 'object.container.album.musicAlbum' : 'object.container.playlistContainer';
  const res = kind === 'track' ? `x-sonos-spotify:${enc}?sid=${sid}&flags=8224&sn=${sn}` : radio ? `x-rincon-cpcontainer:${prefix}${enc}` : `x-rincon-cpcontainer:${prefix}${enc}?sid=${sid}&flags=8300&sn=${sn}`;
  const type = sid * 256 + 7;
  const didl = '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">'
    + `<item id="${prefix}${enc}" parentID="" restricted="true"><dc:title>${escape(title)}</dc:title><upnp:class>${cls}</upnp:class>`
    + `<desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">SA_RINCON${type}_X_#Svc${type}-0-Token</desc></item></DIDL-Lite>`;
  const f = new Favorite();
  f.title = title; f.uri = res; f.meta = didl; f.container = true;   // queued, even a track: the queue is what the Sonos app shows
  return f;
}
/** Plays a Spotify URI (spotifyItem) on a group: the queue becomes it. */
export async function playSpotify(sys: System, g: Group, uri: string, title: string, sid: i32, sn: i32): Promise<void> {
  await sys.playFavorite(g, spotifyItem(uri, title, sid, sn));
}
/** Adds a Spotify URI (spotifyItem) to the group's queue: at its end, or right after the song that plays (`next`). */
export async function queueSpotify(sys: System, g: Group, uri: string, title: string, sid: i32, sn: i32, next: boolean = false): Promise<void> {
  await sys.enqueue(g, spotifyItem(uri, title, sid, sn), next);
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
