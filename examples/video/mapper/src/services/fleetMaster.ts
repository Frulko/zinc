// This mapper leads others: it finds them, pairs with them once (the code shows on their output), sends them the setup, the show and every command,
// and receives how they run. A command that must look simultaneous carries the shared time to run it at.
import * as fs from 'zinc:fs';
import * as link from 'zinc:link';
import * as mapping from 'zinc:mapping';
import { fetch } from 'zinc:web/fetch';
import { offerRevision, releaseRevision, RevisionPhase, RevisionStatus } from './fleetRevision';
import { FLEET_FILE } from '../constants';
import { clockPort, fleetNow, fleetState, setViewport } from './fleet';
import { CopyState } from './fleetMedia';
import { LayerCommand } from './layerCommands';
import { VideoTime, videoTimes } from './layerMedia';
import { mediaFiles } from './mediaStore';
import { showJson } from './show';

const SERVICE = 'zinc-mapper';
const SYNC_MS = 500;              // how soon an edit that came another way than a command (a scene, undo) reaches the others
const VIDEO_TIME_MS = 250;        // how soon a video that started or jumped reaches the others
const LOOKAHEAD_MS = 80;          // wired needs less, Wi-Fi more: /fleet/lookahead
const TIMED: string[] = ['/column', '/cell', '/step', '/stop', '/card', '/volume', '/mute'];   // these must look simultaneous
const THIS_DEVICE: string[] = ['/hud', '/ping'];                                                        // these stay on the machine that got them

enum DeliveryPhase { Idle, Preparing, Transferring, Cancelling, Activating }
interface Device {
  id: string; name: string; host: string;
  channel: link.Channel | null;
  viewport: number[]; trimMs: number;
  fps: number; offsetMs: number; rttMs: number; synced: boolean; late: number; system: string; output: number[];
  media: CopyState; videoMs: number; live: boolean; liveRequest: i32; delivery: DeliveryPhase; deliveryEpoch: i32; ticket: string; revision: RevisionStatus;
}

const devices: Device[] = [];
const found = new Map<string, link.Peer>();
let lookaheadMs = LOOKAHEAD_MS;
let selfTrimMs = 0;
let selfName = '';
let webPort: i32 = 0, webToken = '';
let lastMapping = '';
let lastShow = '';
let lastMedia = '';
let problem = '';

function deviceOf(id: string): Device | null {
  for (const device of devices) if (device.id === id) return device;
  return null;
}

function connected(): Device[] { return devices.filter((device: Device): boolean => device.channel !== null && (device.channel as link.Channel).connected); }

function save(): void {
  const list = devices.map((d: Device): any => ({ id: d.id, name: d.name, viewport: d.viewport, trimMs: d.trimMs, live: d.live }));
  const coming = `${FLEET_FILE}.new`;
  fs.writeText(coming, JSON.stringify({ lookaheadMs, selfTrimMs, viewport: fleetState().viewport, devices: list }));
  fs.rename(coming, FLEET_FILE);
}

function connect(device: Device, peer: link.Peer): void {
  const channel = link.connect(peer);
  device.channel = channel;
  channel.onOpen(() => {
    channel.send({ t: 'master', live: device.live, liveRequest: device.liveRequest, name: selfName, clockPort: clockPort(), viewport: device.viewport, mapping: mapping.toJson(), show: showJson(), web: webPort, token: webToken, media: mediaFiles() });
  });
  channel.onClose((why: string) => {
    if (device.channel !== channel) return;
    device.deliveryEpoch++;
    releaseRevision(device.ticket);
    device.ticket = '';
    transitionDelivery(device, DeliveryPhase.Idle);
    device.revision = { phase: RevisionPhase.Idle, done: 0, total: 0, problem: '', path: '', ticket: '', activePath: '' };
    device.channel = null;
  });
  channel.onMessage((message: any) => {
    if (device.channel !== channel) return;
    if (message.t === 'revision-activated') {
      if (device.delivery !== DeliveryPhase.Activating || message.ticket !== device.ticket) return;
      device.revision = message.revision as RevisionStatus;
      device.ticket = '';
      transitionDelivery(device, DeliveryPhase.Idle);
      return;
    }
    if (message.t !== 'status') return;
    if (typeof message.live === 'boolean' && message.liveRequest === device.liveRequest && device.live !== message.live as boolean) {
      device.live = message.live as boolean;
      save();
    }
    if (message.revision !== undefined && device.delivery !== DeliveryPhase.Preparing && device.delivery !== DeliveryPhase.Cancelling && device.delivery !== DeliveryPhase.Activating) {
      const next = message.revision as RevisionStatus;
      if (device.delivery !== DeliveryPhase.Transferring || next.ticket === device.ticket) device.revision = next;
      if (device.revision.ticket === device.ticket && (device.revision.phase === RevisionPhase.Ready || device.revision.phase === RevisionPhase.Failed || device.revision.phase === RevisionPhase.Idle)) {
        releaseRevision(device.ticket);
        device.ticket = '';
        transitionDelivery(device, DeliveryPhase.Idle);
      }
    }
    device.fps = message.fps as number;
    device.offsetMs = message.offsetMs as number;
    device.rttMs = message.rttMs as number;
    device.synced = message.synced as boolean;
    device.late = message.late as number;
    device.system = message.system as string;
    device.output = message.output as number[];
    device.media = message.media as CopyState;
    device.videoMs = message.videoMs as number;
  });
}

function addDevice(peer: link.Peer): void {
  problem = '';
  let device = deviceOf(peer.id);
  if (device === null) {
    device = { id: peer.id, name: peer.name, host: peer.host, channel: null, viewport: [0, 0, 1, 1], trimMs: 0, fps: 0, offsetMs: 0, rttMs: 0, synced: false, late: 0, system: '', output: [0, 0], media: { left: 0, name: '', done: 0, total: 0, problem: '' }, videoMs: 0, live: false, liveRequest: 0, delivery: DeliveryPhase.Idle, deliveryEpoch: 0, ticket: '', revision: { phase: RevisionPhase.Idle, done: 0, total: 0, problem: '', path: '', ticket: '', activePath: '' } };
    devices.push(device as Device);
    save();
  }
  if ((device as Device).channel === null) connect(device as Device, peer);
}

function forget(id: string): void {
  const device = deviceOf(id);
  if (device === null) return;
  if ((device as Device).channel !== null) ((device as Device).channel as link.Channel).close();
  devices.splice(devices.indexOf(device as Device), 1);
  link.forget(id);
  save();
}

/** Picks up the changes no command carried. The others compare, so what a command already did costs them nothing. */
function sendChanges(): void {
  const players = connected().filter((device: Device): boolean => device.live);
  if (players.length === 0) return;
  const setup = mapping.toJson(), show = showJson();
  if (setup === lastMapping && show === lastShow) return;
  lastMapping = setup;
  lastShow = show;
  for (const device of players) (device.channel as link.Channel).send({ t: 'state', mapping: setup, show });
}

function sendMedia(): void {
  const players = connected().filter((device: Device): boolean => device.live);
  if (players.length === 0) return;
  const files = mediaFiles(), now = JSON.stringify(files);
  if (now === lastMedia) return;
  lastMedia = now;
  for (const device of players) (device.channel as link.Channel).send({ t: 'media', files });
}

/** A device's trim moves its videos as it moves its commands. */
function sendVideoTimes(): void {
  const players = connected().filter((device: Device): boolean => device.live);
  if (players.length === 0) return;
  const times = videoTimes();
  for (const device of players) {
    (device.channel as link.Channel).send({ t: 'videos', times: times.map((time: VideoTime): VideoTime => ({ layer: time.layer, media: time.media, at: time.at + device.trimMs - selfTrimMs, position: time.position, rate: time.rate })) });
  }
}

/** Sends a command to the others. When this machine should run it itself: at a shared time, or 0 for now. */
export function shareCommand(command: LayerCommand): number {
  const players = connected().filter((device: Device): boolean => device.live);
  if (players.length === 0 || THIS_DEVICE.includes(command.address)) return 0;
  const timed = TIMED.includes(command.address);
  const at = timed ? fleetNow() + lookaheadMs : 0;
  for (const device of players) {
    (device.channel as link.Channel).send({ t: 'cmd', address: command.address, numbers: command.numbers, strings: command.strings, at: timed ? at + device.trimMs : 0 });
  }
  return timed ? at + selfTrimMs : 0;
}

function placeSideBySide(): void {
  const width = 1 / (devices.length + 1);
  setViewport(0, 0, width, 1);
  devices.forEach((device: Device, index: i32) => { place(device, [(index + 1) * width, 0, width, 1]); });
  save();
}

function place(device: Device, viewport: number[]): void {
  device.viewport = viewport;
  if (device.channel !== null) (device.channel as link.Channel).send({ t: 'viewport', viewport });
}

async function askForCode(id: string): Promise<void> {
  const peer = found.get(id);
  if (peer === undefined) return;
  try {
    await fetch(`http://${(peer as link.Peer).host}:${(peer as link.Peer).info}/pair/ask`, { method: 'POST', body: '' });
  } catch (e) {
    problem = `${e}`;
  }
}

/** `to`: a device seen on the network, or host:port when discovery does not reach it. */
async function pairWith(to: string, code: string): Promise<void> {
  const seen = found.get(to);
  const colon = to.lastIndexOf(':');
  const address: link.Address | null = seen !== undefined ? { host: (seen as link.Peer).host, port: (seen as link.Peer).port } : colon > 0 ? { host: to.slice(0, colon), port: parseInt(to.slice(colon + 1)) } : null;
  if (address === null) {
    problem = `no such device: ${to}`;
    return;
  }
  try {
    addDevice(await link.pair(address as link.Address, code));
  } catch (e) {
    problem = `${e}`;
  }
}

function sendLive(device: Device, enabled: boolean): void {
  device.live = enabled;
  device.liveRequest++;
  (device.channel as link.Channel).send({ t: 'live', enabled, request: device.liveRequest, clockPort: clockPort() });
}

function transitionDelivery(device: Device, next: DeliveryPhase): void {
  const phase = device.delivery;
  if (phase === next) return;
  if (!((phase === DeliveryPhase.Idle && (next === DeliveryPhase.Preparing || next === DeliveryPhase.Activating)) ||
    (phase === DeliveryPhase.Preparing && (next === DeliveryPhase.Transferring || next === DeliveryPhase.Cancelling || next === DeliveryPhase.Idle)) ||
    ((phase === DeliveryPhase.Transferring || phase === DeliveryPhase.Cancelling || phase === DeliveryPhase.Activating) && next === DeliveryPhase.Idle))) throw new Error('Invalid sender transition');
  device.delivery = next;
}

async function prepareDevice(device: Device): Promise<void> {
  if (device.delivery !== DeliveryPhase.Idle) return;
  const channel = device.channel as link.Channel;
  const epoch = ++device.deliveryEpoch;
  transitionDelivery(device, DeliveryPhase.Preparing);
  device.revision = { phase: RevisionPhase.Preparing, done: 0, total: 0, problem: 'Preparing project snapshot', path: '', ticket: '', activePath: '' };
  try {
    if (webPort <= 0) throw new Error('The media server is off');
    problem = '';
    const manifest = await offerRevision();
    if (device.deliveryEpoch !== epoch) { releaseRevision(manifest.ticket); return; }
    if (device.channel !== channel || !channel.connected || device.delivery === DeliveryPhase.Cancelling) {
      releaseRevision(manifest.ticket);
      transitionDelivery(device, DeliveryPhase.Idle);
      device.revision = { phase: RevisionPhase.Idle, done: 0, total: 0, problem: '', path: '', ticket: '', activePath: '' };
      return;
    }
    device.ticket = manifest.ticket;
    transitionDelivery(device, DeliveryPhase.Transferring);
    device.live = false;
    channel.send({ t: 'revision-prepare', manifest });
    save();
  } catch (e) {
    if (device.deliveryEpoch !== epoch) return;
    releaseRevision(device.ticket);
    device.ticket = '';
    transitionDelivery(device, DeliveryPhase.Idle);
    device.revision = { phase: RevisionPhase.Failed, done: 0, total: 0, problem: `Preparation failed: ${e}`, path: '', ticket: '', activePath: '' };
    problem = `${e}`;
  }
}

/** The /fleet/ commands, from the Devices view or OSC. An empty id is this machine. */
export function fleetCommand(command: LayerCommand): boolean {
  const name = command.address.slice('/fleet/'.length);
  const id = command.strings.length > 0 ? command.strings[0] : '';
  const v = command.numbers;
  const device = deviceOf(id);
  const isSelf = id === '' || id === link.id();
  if (name === 'prepare' && device !== null && device.channel !== null && device.channel.connected) {
    prepareDevice(device);
    return true;
  }
  if (name === 'cancel' && device !== null && device.channel !== null && device.channel.connected) {
    if (device.delivery === DeliveryPhase.Preparing) {
      transitionDelivery(device, DeliveryPhase.Cancelling);
      device.revision.phase = RevisionPhase.Cancelling;
    }
    device.channel.send({ t: 'revision-cancel' });
    return true;
  }
  if (name === 'activate' && device !== null && device.channel !== null && device.channel.connected) {
    if (device.delivery !== DeliveryPhase.Idle || device.revision.phase !== RevisionPhase.Ready || device.revision.ticket === '') return false;
    sendLive(device, false);
    device.ticket = device.revision.ticket;
    transitionDelivery(device, DeliveryPhase.Activating);
    device.revision.phase = RevisionPhase.Verifying;
    device.channel.send({ t: 'revision-activate', ticket: device.ticket });
    save();
    return true;
  }
  if (name === 'live' && device !== null && device.channel !== null && device.channel.connected) {
    if (device.delivery === DeliveryPhase.Activating) return false;
    sendLive(device, v.length > 0 && v[0] === 1);
    if (device.live) device.channel.send({ t: 'viewport', viewport: device.viewport });
    lastMapping = ''; lastShow = ''; lastMedia = '';
    save();
    return true;
  }
  if (name === 'ask') { askForCode(id); return true; }
  if (name === 'add') {
    if (command.strings.length < 2) return false;
    pairWith(id, command.strings[1]);
    return true;
  }
  if (name === 'lookahead' && v.length > 0 && v[0] >= 0) lookaheadMs = v[0];
  else if (name === 'sidebyside') placeSideBySide();
  else if (name === 'remove' && device !== null) forget(id);
  else if (name === 'viewport' && v.length === 4 && v[2] > 0 && v[3] > 0) {
    if (isSelf) setViewport(v[0], v[1], v[2], v[3]);
    else if (device !== null) place(device as Device, v);
    else return false;
  } else if (name === 'trim' && v.length > 0) {
    if (isSelf) selfTrimMs = v[0];
    else if (device !== null) (device as Device).trimMs = v[0];
    else return false;
  } else if (name === 'identify') {
    if (device !== null && (device as Device).channel !== null) ((device as Device).channel as link.Channel).send({ t: 'identify' });
    return device !== null;
  } else return false;
  save();
  return true;
}

/** How the machines this mapper leads are doing, for OSC. */
export interface DeviceState { id: string; name: string; online: boolean; fps: number; videoMs: number }

export function deviceStates(): DeviceState[] {
  return devices.map((d: Device): DeviceState => ({ id: d.id, name: d.name, online: d.channel !== null && (d.channel as link.Channel).connected, fps: d.fps, videoMs: d.videoMs }));
}

/** What the Devices view shows. */
export function fleetJson(linkPort: i32): string {
  const known = (id: string): boolean => id === link.id() || deviceOf(id) !== null;
  const seen: any[] = [];
  found.forEach((peer: link.Peer, id: string) => { if (!known(id)) seen.push({ id, name: peer.name, host: peer.host, pairing: peer.pairing }); });
  const list = devices.map((d: Device): any => ({
    id: d.id, name: d.name, host: d.host, online: d.channel !== null && (d.channel as link.Channel).connected,
    viewport: d.viewport, trimMs: d.trimMs, fps: d.fps, offsetMs: d.offsetMs, rttMs: d.rttMs, synced: d.synced, late: d.late, system: d.system, output: d.output, media: d.media, videoMs: d.videoMs, live: d.live, revision: d.revision,
  }));
  return JSON.stringify({ self: { id: link.id(), name: selfName, linkPort, trimMs: selfTrimMs, ...fleetState() }, lookaheadMs, devices: list, found: seen, problem });
}

/** Finds the others and goes back to the ones this mapper leads. After link.init(). */
export function startFleetMaster(name: string, port: i32, token: string): void {
  selfName = name;
  webPort = port;
  webToken = token;
  link.browse(SERVICE, (peer: link.Peer, present: boolean) => {
    if (present) {
      found.set(peer.id, peer);
      const known = deviceOf(peer.id);
      if (known !== null && known.channel === null) connect(known, peer);
    }
    else found.delete(peer.id);
  });
  if (fs.exists(FLEET_FILE)) {
    try {
      const saved = JSON.parse(fs.readText(FLEET_FILE));
      lookaheadMs = saved.lookaheadMs as number;
      selfTrimMs = saved.selfTrimMs as number;
      const place = saved.viewport as number[];
      setViewport(place[0], place[1], place[2], place[3]);
      const paired = link.peers();
      for (const entry of saved.devices as any[]) {
        const peer = paired.find((p: link.Peer): boolean => p.id === (entry.id as string));
        if (peer === undefined) continue;
        addDevice(peer as link.Peer);
        const device = deviceOf(entry.id as string) as Device;
        device.viewport = entry.viewport as number[];
        device.trimMs = entry.trimMs as number;
        device.live = entry.live === true;
      }
    } catch (e) {
      console.error(`mapper: ${FLEET_FILE} ignored: ${e}`);
    }
  }
  setInterval(() => {
    sendChanges();
    sendMedia();
  }, SYNC_MS);
  setInterval(sendVideoTimes, VIDEO_TIME_MS);
}
