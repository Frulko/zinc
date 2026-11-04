// ============================================================================
// services/airplay-bridge.ts — The AirPlay bridge (airplay2-sonos-bridge) whose stream a group plays
// ============================================================================
// Its address is in the URI the speakers play: no setting. Read only while a group plays its stream.

import { Headers, fetch } from 'zinc:net';
import { Group, airplayBridge } from 'zinc:sonos';

export class BridgeSession {
  room: string = '';
  rooms: string[] = [];
  title: string = '';
  artist: string = '';
  album: string = '';
  source: string = '';
  duration: number = 0;
  position: number = 0;
  art: string = '';
}

export class BridgeStatus {
  version: string = '';
  mode: string = '';
  sessions: BridgeSession[] = [];
}

export const BRIDGE_MODES: string[] = ['gapless', 'text', 'reload', 'source'];

/** What the last reading said, and where: the settings keep showing the bridge once its stream has stopped. */
export const bridge = { host: '', status: null as BridgeStatus | null, token: '' };

const textOf = (value: any): string => (typeof value === 'string' ? String(value) : '');
const secondsOf = (value: any): number => (typeof value === 'number' && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0);

/** null when this is not the bridge's answer: it comes from the network. */
export function parseBridgeStatus(text: string): BridgeStatus | null {
  try {
    return statusFromJson(JSON.parse(text));
  } catch (error) {
    return null;
  }
}

function statusFromJson(parsed: any): BridgeStatus | null {
  if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.sessions)) return null;
  const status = new BridgeStatus();
  status.version = textOf(parsed.version);
  status.mode = textOf(parsed.mode);
  for (const raw of parsed.sessions) {
    if (raw === null || typeof raw !== 'object') continue;
    const session = new BridgeSession();
    session.room = textOf(raw.room);
    if (Array.isArray(raw.rooms)) for (const room of raw.rooms) session.rooms.push(textOf(room));
    session.title = textOf(raw.title);
    session.artist = textOf(raw.artist);
    session.album = textOf(raw.album);
    session.source = textOf(raw.source);
    session.duration = secondsOf(raw.duration);
    session.position = secondsOf(raw.position);
    session.art = textOf(raw.art);
    status.sessions.push(session);
  }
  return status;
}

export function bridgeSessionOfRoom(status: BridgeStatus | null, room: string): BridgeSession | null {
  if (status === null) return null;
  for (const session of status.sessions) {
    if (session.room === room || session.rooms.indexOf(room) >= 0) return session;
  }
  return null;
}

export function bridgeHostOf(group: Group): string {
  return airplayBridge(group.media.uri !== '' ? group.media.uri : group.track.uri);
}

/** Whether a group plays the bridge's stream: skipping and seeking mean nothing there, pause would disconnect the sender. */
export function isBridgeStream(group: Group): boolean {
  return bridgeHostOf(group) !== '';
}

/** Shows on the group's track what the speakers can't tell (Sonos says 0:00:00 for a live stream). */
function showBridgeSession(group: Group, host: string): void {
  const session = bridgeSessionOfRoom(bridge.status, group.coordinator.name);
  if (session === null || session.title === '') return;
  const track = group.track;
  track.title = session.title;
  track.artist = session.artist;
  track.album = session.album;
  track.duration = session.duration;
  track.position = session.position;
  if (session.art.startsWith('/')) track.art = `http://${host}${session.art}`;
}

/** After a group's update: the last answer at once (a frame must not show Sonos's own title), then a fresh one. */
export async function readBridgeIntoGroup(group: Group): Promise<void> {
  const host = bridgeHostOf(group);
  if (host === '') return;
  bridge.host = host;
  const track = group.track;
  const title = track.title, artist = track.artist, album = track.album, art = track.art, duration = track.duration, position = track.position;
  showBridgeSession(group, host);
  try {
    const response = await fetch(`http://${host}/api/status`, { timeoutMs: 3000, maxBytes: 64 * 1024 });
    const body = await response.text();
    bridge.status = response.ok ? parseBridgeStatus(body) : null;
  } catch (error) {
    bridge.status = null;
  }
  track.title = title;   // what Sonos said, unless the fresh answer knows better
  track.artist = artist;
  track.album = album;
  track.art = art;
  track.duration = duration;
  track.position = position;
  showBridgeSession(group, host);
}

/** A command for the bridge (`/api/stop?room=…`, `/api/mode?set=…`). Throws when it is refused. */
export async function sendBridgeCommand(path: string): Promise<void> {
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${bridge.token}`);
  const response = await fetch(`http://${bridge.host}${path}`, { method: 'POST', body: '', timeoutMs: 4000, headers });
  if (!response.ok) throw new Error(`le pont répond ${response.status}`);
}
