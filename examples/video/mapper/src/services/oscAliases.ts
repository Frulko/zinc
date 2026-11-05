// What Millumin and Resolume call things, in the mapper's words, so a project or desk made for them drives this one. Their addresses never clash with the
// mapper's, so nothing has to be chosen. Both count from 1, the mapper from 0. Their pages: docs/reports/mapper-multi-device.md, B1 and B2.
// ponytail: no relative values (/+, /-), no effects and no master brightness: add them when a project asks for them.
import * as mapping from 'zinc:mapping';
import { LayerCommand } from './layerCommands';
import { columnNamed } from './show';

const CORNERS: string[] = ['topleft', 'topright', 'bottomright', 'bottomleft'];
const SAME_NAME: string[] = ['opacity', 'rotation', 'scale'];

function say(address: string, numbers: number[] = [], strings: string[] = []): LayerCommand[] { return [{ address, numbers, strings }]; }

/** A button sends 1 when pressed and often 0 when let go. */
function pressed(numbers: number[]): boolean { return numbers.length === 0 || numbers[0] > 0; }

function onPress(numbers: number[], address: string, args: number[] = []): LayerCommand[] { return pressed(numbers) ? say(address, args) : []; }

function resolume(parts: string[], v: number[]): LayerCommand[] | null {
  if (parts[0] === 'disconnectall') return onPress(v, '/stop');
  if (parts[0] === 'columns' && parts[2] === 'connect') return onPress(v, '/column', [parseInt(parts[1]) - 1]);
  if (parts[0] !== 'layers' || parts.length < 3) return null;
  const layer: i32 = parseInt(parts[1]) - 1;
  const rest = parts.slice(2).join('/');
  if (rest === 'clear') return onPress(v, '/stop', [layer]);
  if (rest === 'video/opacity' || rest === 'master') return say(`/layer/${layer}/opacity`, v);
  if (parts[2] === 'clips' && parts[4] === 'connect') return onPress(v, '/cell', [parseInt(parts[3]) - 1, layer]);
  if (parts[2] === 'clips' && parts.slice(4).join('/') === 'transport/position') return say(`/layer/${layer}/normalizedTime`, v);
  return null;
}

function action(name: string, v: number[], s: string[]): LayerCommand[] | null {
  if (name === 'launchcolumn') {
    const column: i32 = s.length > 0 ? columnNamed(s[0]) : v.length > 0 ? v[0] as i32 - 1 : -1;
    return say('/column', [column]);
  }
  if (name === 'stopcolumn' || name === 'launchorstopcolumn' && v.length === 0) return say('/stop');
  if (name === 'launchorstopcolumn') return say('/column', [v[0] - 1]);
  if (name === 'launchnextcolumn') return say('/step', [1]);
  if (name === 'launchpreviouscolumn') return say('/step', [-1]);
  if (name === 'displaytestcard') return say('/card', [], ['grid']);
  if (name === 'hidetestcard') return say('/card', [], ['off']);
  if (name === 'play' || name === 'pause') return say('/transport', [], [name]);
  if (name === 'playorpause') return say('/transport', [], ['toggle']);
  if (name === 'selectlayer') return say('/select', [s.length > 0 ? layerNamed(s[0]) : v[0] - 1]);
  return null;
}

function layerNamed(name: string): i32 {
  const wanted = name.toLowerCase();
  for (let layer: i32 = 0; layer < mapping.layerCount(); layer++) {
    if ((JSON.parse(mapping.layerJson(layer)).name as string[])[0].toLowerCase() === wanted) return layer;
  }
  return -1;
}

/** selectedLayer, layer:name or index:n; -1 when it is none of them or no such layer. */
function targetOf(part: string): i32 {
  if (part === 'selectedlayer') return JSON.parse(mapping.info()).selected as i32;
  if (part.startsWith('layer:')) return layerNamed(part.slice(6));
  if (part.startsWith('index:')) return parseInt(part.slice(6)) - 1;
  return -1;
}

/** A number of seconds, or a time as hh:mm:ss.mmm. */
function secondsOf(v: number[], s: string[]): number {
  if (v.length > 0) return v[0];
  let seconds = 0;
  if (s.length > 0) for (const part of s[0].split(':')) seconds = seconds * 60 + parseFloat(part);
  return seconds;
}

function layerProperty(layer: i32, parts: string[], v: number[], s: string[]): LayerCommand[] | null {
  const rest = parts.join('/');
  const here = `/layer/${layer}`;
  if (SAME_NAME.includes(rest)) return say(`${here}/${rest}`, v);
  if (rest === 'position/xy') return say(`${here}/position`, v);
  if (parts[0] === 'mapping' && parts.length === 2 && CORNERS.includes(parts[1])) return say(`${here}/corner`, [CORNERS.indexOf(parts[1]) as number].concat(v));
  if (rest === 'startmedia') {
    if (v.length > 0) return say('/cell', [v[0] - 1, layer]);
    if (s.length > 0) return say(`${here}/media`, [], s);
    return say(`${here}/time`, [0]).concat(say(`${here}/pause`, [0]));
  }
  if (rest === 'pausemedia') return say(`${here}/pause`, [1]);
  if (rest === 'startorpausemedia') return say(`${here}/pause`, [-1]);
  if (rest === 'stopmedia') return say('/stop', [layer]);
  if (rest === 'media/time') return say(`${here}/time`, [secondsOf(v, s)]);
  if (rest === 'media/speed') return say(`${here}/speed`, v);
  if (rest === 'media/normalizedtime') return say(`${here}/normalizedTime`, v);
  return null;
}

/** The mapper's commands for an address of Millumin or Resolume, [] for a button let go; null when the address is not theirs. */
export function translate(address: string, numbers: number[], strings: string[]): LayerCommand[] | null {
  let lower = address.toLowerCase();
  if (lower.startsWith('/millumin/')) lower = lower.slice('/millumin'.length);
  const parts = lower.split('/').slice(1);
  if (parts[0] === 'composition') return resolume(parts.slice(1), numbers);
  if (parts[0] === 'action') return action(parts[1], numbers, strings);
  const layer = targetOf(parts[0]);
  return layer >= 0 ? layerProperty(layer, parts.slice(1), numbers, strings) : null;
}

/** Whose words an address is in. */
export function dialectOf(address: string): string {
  const lower = address.toLowerCase();
  if (lower.startsWith('/composition/')) return 'resolume';
  return lower.startsWith('/millumin/') || lower.startsWith('/action/') || lower.startsWith('/selectedlayer/') || lower.startsWith('/layer:') || lower.startsWith('/index:') ? 'millumin' : 'mapper';
}
