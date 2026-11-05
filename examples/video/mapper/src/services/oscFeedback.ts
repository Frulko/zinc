// What the mapper tells those who asked, in their words: a column launched or stopped, a film started, paused or stopped, a layer's opacity, the time of
// the films ten times a second, and how the machines it leads are doing. Compares with what it last said, so a command from anywhere is told.
import * as fs from 'zinc:fs';
import * as mapping from 'zinc:mapping';
import { Message, Osc } from 'zinc:osc/full';
import { FEEDBACK_FILE } from '../constants';
import { deviceStates } from './fleetMaster';
import { FilmState, filmState } from './layerMedia';
import { activeColumn, columnNameOf, playingColumn } from './show';

const TICK_MS = 100;
const DEVICES_EVERY: i32 = 10;   // ticks: once a second
const DIALECTS: string[] = ['mapper', 'millumin', 'resolume'];

export interface Listener { host: string; port: i32; dialect: string }
interface LayerSaid { media: string; opacity: number; paused: boolean }

let endpoint: Osc | null = null;
let listeners: Listener[] = [];
let column: i32 = -1;
let columnName = '';
let layers: LayerSaid[] = [];
let ticks: i32 = 0;

function send(to: Listener, message: Message): void { (endpoint as Osc).send(to.host, to.port, message); }

function tellColumn(to: Listener, index: i32, name: string, on: boolean): void {
  if (to.dialect === 'millumin') send(to, new Message(`/millumin/board/${on ? 'launched' : 'stopped'}Column`).int(index + 1).string(name));
  else if (to.dialect === 'resolume') send(to, new Message(`/composition/columns/${index + 1}/connect`).int(on ? 1 : 0));
  else send(to, new Message(`/column/${on ? 'launched' : 'stopped'}`).int(index).string(name));
}

function tellStarted(to: Listener, layer: i32, name: string, duration: number): void {
  if (to.dialect === 'millumin') send(to, new Message(`/millumin/index:${layer + 1}/mediaStarted`).int(playingColumn(layer) + 1).string(name).float(duration));
  else if (to.dialect === 'resolume') send(to, new Message(`/composition/layers/${layer + 1}/clips/${playingColumn(layer) + 1}/connect`).int(1));
  else send(to, new Message(`/layer/${layer}/playing`).string(name).float(duration));
}

function tellStopped(to: Listener, layer: i32, name: string): void {
  if (to.dialect === 'millumin') send(to, new Message(`/millumin/index:${layer + 1}/mediaStopped`).int(layer + 1).string(name));
  else if (to.dialect === 'resolume') send(to, new Message(`/composition/layers/${layer + 1}/clear`).int(1));
  else send(to, new Message(`/layer/${layer}/stopped`).string(name));
}

function tellPaused(to: Listener, layer: i32, name: string, paused: boolean): void {
  if (to.dialect === 'millumin') {
    if (paused) send(to, new Message(`/millumin/index:${layer + 1}/mediaPaused`).int(layer + 1).string(name));
    else send(to, new Message(`/millumin/index:${layer + 1}/mediaStarted`).int(playingColumn(layer) + 1).string(name).float(0));
  } else if (to.dialect === 'mapper') send(to, new Message(`/layer/${layer}/paused`).int(paused ? 1 : 0));
}

function tellOpacity(to: Listener, layer: i32, value: number): void {
  if (to.dialect === 'millumin') send(to, new Message(`/millumin/index:${layer + 1}/opacity`).float(value));
  else if (to.dialect === 'resolume') send(to, new Message(`/composition/layers/${layer + 1}/video/opacity`).float(value));
  else send(to, new Message(`/layer/${layer}/opacity`).float(value));
}

function tellTime(to: Listener, layer: i32, film: FilmState): void {
  if (to.dialect === 'millumin') {
    send(to, new Message(`/millumin/index:${layer + 1}/media/time`).float(film.time).float(film.duration));
    if (JSON.parse(mapping.info()).selected === layer) send(to, new Message('/millumin/selectedLayer/media/time').float(film.time).float(film.duration));
  } else if (to.dialect === 'resolume') send(to, new Message(`/composition/layers/${layer + 1}/clips/${playingColumn(layer) + 1}/transport/position`).float(film.duration > 0 ? film.time / film.duration : 0));
  else send(to, new Message(`/layer/${layer}/time`).float(film.time).float(film.duration));
}

function layerNow(layer: i32): LayerSaid {
  const state: any = JSON.parse(mapping.layerJson(layer));
  const film = filmState(layer);
  return { media: (state.media as string[])[0], opacity: (state.opacity as number[])[0], paused: film !== null && (film as FilmState).paused };
}

function durationOf(film: FilmState | null): number { return film === null ? 0 : (film as FilmState).duration; }

function tick(): void {
  if (listeners.length === 0) return;
  const active = activeColumn();
  if (active !== column) {
    for (const to of listeners) {
      if (column >= 0) tellColumn(to, column, columnName, false);
      if (active >= 0) tellColumn(to, active, columnNameOf(active), true);
    }
    column = active;
    columnName = columnNameOf(active);
  }
  const count = mapping.layerCount();
  for (let layer: i32 = 0; layer < count; layer++) {
    if (layer >= layers.length) layers.push({ media: '', opacity: -1, paused: false });
    const said = layers[layer], now = layerNow(layer), film = filmState(layer);
    for (const to of listeners) {
      if (said.media !== now.media && said.media !== '') tellStopped(to, layer, said.media);
      if (said.media !== now.media && now.media !== '') tellStarted(to, layer, now.media, durationOf(film));
      if (said.paused !== now.paused) tellPaused(to, layer, now.media, now.paused);
      if (said.opacity !== now.opacity) tellOpacity(to, layer, now.opacity);
      if (film !== null && !now.paused) tellTime(to, layer, film as FilmState);
    }
    layers[layer] = now;
  }
  if (layers.length > count) layers.length = count;
  if (++ticks % DEVICES_EVERY !== 0) return;
  for (const to of listeners) {
    if (to.dialect !== 'mapper') continue;
    for (const device of deviceStates()) send(to, new Message(`/fleet/device/${device.id}/state`).int(device.online ? 1 : 0).float(device.fps).float(device.videoMs).string(device.name));
  }
}

/** Everything at once: for a new listener, or one that asks with ?. */
export function tellAll(to: Listener): void {
  if (endpoint === null) return;
  const active = activeColumn();
  if (active >= 0) tellColumn(to, active, columnNameOf(active), true);
  for (let layer: i32 = 0; layer < mapping.layerCount(); layer++) {
    const now = layerNow(layer), film = filmState(layer);
    tellOpacity(to, layer, now.opacity);
    if (now.media !== '') tellStarted(to, layer, now.media, durationOf(film));
    if (film !== null) tellTime(to, layer, film as FilmState);
  }
}

function save(): void {
  const coming = `${FEEDBACK_FILE}.new`;
  fs.writeText(coming, JSON.stringify(listeners));
  fs.rename(coming, FEEDBACK_FILE);
}

/** False for a dialect there is none of or a port that cannot be. Someone already told is told again with their new words, once. */
export function subscribe(host: string, port: i32, dialect: string): boolean {
  if (host === '' || port <= 0 || port > 65535 || !DIALECTS.includes(dialect)) return false;
  listeners = listeners.filter((other: Listener): boolean => other.host !== host || other.port !== port);
  const listener = { host, port, dialect };
  listeners.push(listener);
  save();
  tellAll(listener);
  return true;
}

export function unsubscribe(host: string, port: i32): void {
  listeners = listeners.filter((other: Listener): boolean => other.host !== host || other.port !== port);
  save();
}

/** `also`: host:port[:dialect] from the command line, '' for none. Those who asked before a restart are told again. */
export function startFeedback(osc: Osc, also: string): void {
  endpoint = osc;
  if (fs.exists(FEEDBACK_FILE)) {
    try {
      listeners = JSON.parse(fs.readText(FEEDBACK_FILE)) as Listener[];
    } catch (e) {
      console.error(`mapper: ${FEEDBACK_FILE} ignored: ${e}`);
    }
  }
  if (also !== '') {
    const parts = also.split(':');
    if (parts.length < 2 || !subscribe(parts[0], parseInt(parts[1]), parts.length > 2 ? parts[2] : 'mapper')) console.error(`mapper: --feedback wants host:port[:mapper|millumin|resolume], not ${also}`);
  }
  setInterval(tick, TICK_MS);
}
