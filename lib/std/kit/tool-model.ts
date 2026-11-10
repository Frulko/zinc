// Tool-panel value models. No UI, processes, timers or import-time work.
export function toolClamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));
}
export function snapTime(value: number, step: number): number {
  return step > 0 ? Math.round(value / step) * step : value;
}
export interface LogRecord {
  id: number;
  time: string;
  level: string;
  source: string;
  text: string;
}
export class LogBuffer {
  records: LogRecord[] = [];
  revision = 0;
  private serial = 0;
  private characters = 0;
  private cachedRevision = -1;
  private cachedQuery = '';
  private cachedLevel = '';
  private cached: LogRecord[] = [];
  private countRevision = -1;
  private counts = new Map<string, number>();
  constructor(
    public maxRecords: number = 2000,
    public maxCharacters: number = 262144,
  ) {
    this.maxRecords = Math.floor(toolClamp(maxRecords, 1, 1000000));
    this.maxCharacters = Math.floor(toolClamp(maxCharacters, 1, 4194304));
  }
  append(text: string, level: string = 'info', source: string = '', time: string = ''): number {
    const limit = Math.max(1, this.maxCharacters),
      id = ++this.serial;
    const record: LogRecord = {
      id,
      text: text.slice(-limit),
      level: level.slice(0, 32),
      source: source.slice(0, 256),
      time: time.slice(0, 64),
    };
    this.records.push(record);
    this.characters += record.text.length + record.source.length + record.time.length + record.level.length;
    while (this.records.length > Math.max(1, this.maxRecords) || this.characters > limit) {
      const first = this.records.shift();
      if (first !== undefined)
        this.characters -= first.text.length + first.source.length + first.time.length + first.level.length;
    }
    this.revision++;
    return id;
  }
  clear(): void {
    this.records = [];
    this.characters = 0;
    this.revision++;
  }
  count(level: string): number {
    if (this.countRevision !== this.revision) {
      this.counts.clear();
      for (const record of this.records) {
        const count = this.counts.get(record.level);
        this.counts.set(record.level, (count === undefined ? 0 : count) + 1);
      }
      this.countRevision = this.revision;
    }
    const count = this.counts.get(level);
    return count === undefined ? 0 : count;
  }
  filtered(query: string, level: string): LogRecord[] {
    const q = query.toLowerCase();
    if (this.cachedRevision !== this.revision || this.cachedQuery !== q || this.cachedLevel !== level) {
      this.cached = this.records.filter(
        (r: LogRecord) => (level === '' || r.level === level) && (r.text + ' ' + r.source).toLowerCase().includes(q),
      );
      this.cachedQuery = q;
      this.cachedLevel = level;
      this.cachedRevision = this.revision;
    }
    return this.cached;
  }
}
export interface TerminalCell {
  text: string;
  foreground: string;
  background: string;
  bold: boolean;
  dim: boolean;
  underline: boolean;
  inverse: boolean;
}
export interface TerminalLine {
  id: number;
  cells: TerminalCell[];
}
enum AnsiPhase {
  Text,
  Escape,
  Csi,
  Osc,
  OscEscape,
}
function ansiColor(index: number): string {
  if (index < 16) return 'ansi:' + String(Math.max(0, index));
  if (index >= 232) {
    const c = toolClamp(8 + (index - 232) * 10, 0, 255);
    return rgb(c, c, c);
  }
  const n = toolClamp(index - 16, 0, 215),
    steps = [0, 95, 135, 175, 215, 255];
  return rgb(steps[Math.floor(n / 36)], steps[Math.floor(n / 6) % 6], steps[n % 6]);
}
function rgb(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v: number) =>
        Math.round(toolClamp(v, 0, 255))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
export class TerminalBuffer {
  lines: TerminalLine[] = [];
  revision = 0;
  history: string[] = [];
  private serial = 0;
  private column = 0;
  private phase = AnsiPhase.Text;
  private sequence = '';
  private foreground = '';
  private background = '';
  private bold = false;
  private dim = false;
  private underline = false;
  private inverse = false;
  constructor(
    public maxLines: number = 2000,
    public maxCharacters: number = 262144,
    public maxHistory: number = 100,
  ) {
    this.maxLines = Math.floor(toolClamp(maxLines, 1, 1000000));
    this.maxCharacters = Math.floor(toolClamp(maxCharacters, 1, 4194304));
    this.maxHistory = Math.floor(toolClamp(maxHistory, 1, 1000));
    this.newline();
  }
  private transition(next: AnsiPhase): void {
    this.phase = next;
    if (next === AnsiPhase.Text) this.sequence = '';
  }
  private newline(): void {
    this.lines.push({ id: ++this.serial, cells: [] });
    this.column = 0;
  }
  clear(): void {
    this.lines = [];
    this.newline();
    this.revision++;
  }
  remember(command: string): void {
    if (command !== '' && (this.history.length === 0 || this.history[this.history.length - 1] !== command))
      this.history.push(command.slice(0, 4096));
    while (this.history.length > Math.max(1, this.maxHistory)) this.history.shift();
  }
  private put(text: string): void {
    const cells = this.lines[this.lines.length - 1].cells;
    if (this.column >= Math.max(1, this.maxCharacters)) return;
    while (cells.length < this.column)
      cells.push({
        text: ' ',
        foreground: '',
        background: '',
        bold: false,
        dim: false,
        underline: false,
        inverse: false,
      });
    const cell: TerminalCell = {
      text,
      foreground: this.foreground,
      background: this.background,
      bold: this.bold,
      dim: this.dim,
      underline: this.underline,
      inverse: this.inverse,
    };
    if (this.column < cells.length) cells[this.column] = cell;
    else cells.push(cell);
    this.column++;
  }
  private csi(final: string): void {
    const values = this.sequence.split(';').map((v: string) => Number(v === '' ? '0' : v));
    if (final === 'm') {
      for (let i = 0; i < values.length; i++) {
        const n = values[i];
        if (n === 0) {
          this.foreground = '';
          this.background = '';
          this.bold = false;
          this.dim = false;
          this.underline = false;
          this.inverse = false;
        } else if (n === 1) this.bold = true;
        else if (n === 2) this.dim = true;
        else if (n === 22) {
          this.bold = false;
          this.dim = false;
        } else if (n === 4 || n === 24) this.underline = n === 4;
        else if (n === 7 || n === 27) this.inverse = n === 7;
        else if (n === 39) this.foreground = '';
        else if (n === 49) this.background = '';
        else if (n >= 30 && n <= 37) this.foreground = ansiColor(n - 30);
        else if (n >= 90 && n <= 97) this.foreground = ansiColor(n - 90 + 8);
        else if (n >= 40 && n <= 47) this.background = ansiColor(n - 40);
        else if (n >= 100 && n <= 107) this.background = ansiColor(n - 100 + 8);
        else if ((n === 38 || n === 48) && i + 2 < values.length && values[i + 1] === 5) {
          const color = ansiColor(toolClamp(values[i + 2], 0, 255));
          if (n === 38) this.foreground = color;
          else this.background = color;
          i += 2;
        } else if ((n === 38 || n === 48) && i + 4 < values.length && values[i + 1] === 2) {
          const color = rgb(values[i + 2], values[i + 3], values[i + 4]);
          if (n === 38) this.foreground = color;
          else this.background = color;
          i += 4;
        }
      }
    } else if (final === 'K') {
      const cells = this.lines[this.lines.length - 1].cells;
      if (values[0] === 2) cells.splice(0, cells.length);
      else if (values[0] === 1) for (let i = 0; i <= this.column && i < cells.length; i++) cells[i].text = ' ';
      else cells.splice(this.column, cells.length - this.column);
    } else if (final === 'J' && (values[0] === 2 || values[0] === 3)) this.clear();
    else if (final === 'G') this.column = toolClamp((values[0] || 1) - 1, 0, this.maxCharacters);
    else if (final === 'C') this.column = toolClamp(this.column + (values[0] || 1), 0, this.maxCharacters);
    else if (final === 'D') this.column = Math.max(0, this.column - (values[0] || 1));
  }
  write(chunk: string): void {
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (this.phase === AnsiPhase.Osc || this.phase === AnsiPhase.OscEscape) {
        if (c === '\u0007' || (this.phase === AnsiPhase.OscEscape && c === '\\')) this.transition(AnsiPhase.Text);
        else this.transition(c === '\u001b' ? AnsiPhase.OscEscape : AnsiPhase.Osc);
      } else if (this.phase === AnsiPhase.Escape) {
        if (c === '[') this.transition(AnsiPhase.Csi);
        else if (c === ']') this.transition(AnsiPhase.Osc);
        else this.transition(AnsiPhase.Text);
      } else if (this.phase === AnsiPhase.Csi) {
        if (c >= '@' && c <= '~') {
          this.csi(c);
          this.transition(AnsiPhase.Text);
        } else if (this.sequence.length < 128) this.sequence += c;
        else this.transition(AnsiPhase.Text);
      } else if (c === '\u001b') this.transition(AnsiPhase.Escape);
      else if (c === '\n') this.newline();
      else if (c === '\r') this.column = 0;
      else if (c === '\b') this.column = Math.max(0, this.column - 1);
      else if (c === '\t') {
        const end = this.column + 8 - (this.column % 8);
        while (this.column < end && this.column < this.maxCharacters) this.put(' ');
      } else if (c >= ' ') this.put(c);
      // Bound during ingestion too: a single enormous chunk cannot allocate an enormous buffer.
      if (c === '\n') this.trim();
    }
    this.trim();
    this.revision++;
  }
  private trim(): void {
    let count = 0;
    for (const line of this.lines) count += line.cells.length;
    while (
      this.lines.length > 1 &&
      (this.lines.length > Math.max(1, this.maxLines) || count > Math.max(1, this.maxCharacters))
    )
      count -= this.lines.shift()!.cells.length;
    const last = this.lines[this.lines.length - 1];
    if (last.cells.length > Math.max(1, this.maxCharacters)) last.cells.splice(Math.max(1, this.maxCharacters));
  }
  text(first: number = 0, last: number = this.lines.length - 1): string {
    return this.lines
      .slice(Math.max(0, Math.min(first, last)), Math.min(this.lines.length, Math.max(first, last) + 1))
      .map((line: TerminalLine) => line.cells.map((cell: TerminalCell) => cell.text).join(''))
      .join('\n');
  }
}

export type CurveMode = 'linear' | 'step' | 'smooth' | 'free';
export interface CurveKey {
  id: string;
  time: number;
  value: number;
  mode: CurveMode;
  inTime?: number;
  inValue?: number;
  outTime?: number;
  outValue?: number;
}
export function orderedKeys(keys: CurveKey[]): CurveKey[] {
  return keys.slice().sort((a: CurveKey, b: CurveKey) => a.time - b.time);
}
function tangent(keys: CurveKey[], i: number): number {
  if (keys.length < 2) return 0;
  const before = keys[Math.max(0, i - 1)],
    key = keys[i],
    after = keys[Math.min(keys.length - 1, i + 1)];
  const left = key.time === before.time ? 0 : (key.value - before.value) / (key.time - before.time),
    right = key.time === after.time ? 0 : (after.value - key.value) / (after.time - key.time);
  if (i === 0 || i === keys.length - 1) return 0;
  if (left * right <= 0) return 0;
  return Math.sign(left) * Math.min(Math.abs((left + right) / 2), 3 * Math.min(Math.abs(left), Math.abs(right)));
}
export function evaluateCurve(keys: CurveKey[], time: number): number {
  if (keys.length === 0) return 0;
  if (time <= keys[0].time) return keys[0].value;
  for (let i = 0; i + 1 < keys.length; i++) {
    const a = keys[i],
      b = keys[i + 1];
    if (time > b.time) continue;
    const duration = b.time - a.time;
    if (duration <= 0) return b.value;
    const t = (time - a.time) / duration;
    if (a.mode === 'step') return time < b.time ? a.value : b.value;
    if (a.mode === 'linear') return a.value + (b.value - a.value) * t;
    if (a.mode === 'free') {
      const x1 = toolClamp(a.outTime ?? a.time + duration / 3, a.time, b.time),
        x2 = toolClamp(b.inTime ?? b.time - duration / 3, a.time, b.time);
      const y1 = a.outValue ?? a.value,
        y2 = b.inValue ?? b.value;
      let low = 0,
        high = 1;
      for (let n = 0; n < 24; n++) {
        const m = (low + high) / 2,
          u = 1 - m,
          x = u * u * u * a.time + 3 * u * u * m * x1 + 3 * u * m * m * x2 + m * m * m * b.time;
        if (x < time) low = m;
        else high = m;
      }
      const m = (low + high) / 2,
        u = 1 - m;
      return u * u * u * a.value + 3 * u * u * m * y1 + 3 * u * m * m * y2 + m * m * m * b.value;
    }
    const t2 = t * t,
      t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * a.value +
      (t3 - 2 * t2 + t) * duration * tangent(keys, i) +
      (-2 * t3 + 3 * t2) * b.value +
      (t3 - t2) * duration * tangent(keys, i + 1)
    );
  }
  return keys[keys.length - 1].value;
}
export function moveCurveKey(
  keys: CurveKey[],
  id: string,
  time: number,
  value: number,
  min: number,
  max: number,
  step: number = 0,
): CurveKey[] {
  const sorted = orderedKeys(keys),
    index = sorted.findIndex((k: CurveKey) => k.id === id);
  if (index < 0) return keys;
  const old = sorted[index],
    epsilon = 0.000001;
  const nextTime = toolClamp(
    snapTime(time, step),
    index > 0 ? sorted[index - 1].time + epsilon : min,
    index + 1 < sorted.length ? sorted[index + 1].time - epsilon : max,
  );
  const delta = nextTime - old.time,
    dy = value - old.value;
  const moved = sorted.map((k: CurveKey) =>
    k.id !== id
      ? k
      : {
          id: k.id,
          time: nextTime,
          value,
          mode: k.mode,
          inTime: k.inTime === undefined ? undefined : k.inTime + delta,
          inValue: k.inValue === undefined ? undefined : k.inValue + dy,
          outTime: k.outTime === undefined ? undefined : k.outTime + delta,
          outValue: k.outValue === undefined ? undefined : k.outValue + dy,
        },
  );
  return moved.map((key: CurveKey, i: i32) => {
    const inTime =
      key.inTime === undefined ? undefined : toolClamp(key.inTime, i > 0 ? moved[i - 1].time : key.time, key.time);
    const outTime =
      key.outTime === undefined
        ? undefined
        : toolClamp(key.outTime, key.time, i + 1 < moved.length ? moved[i + 1].time : key.time);
    if (inTime === key.inTime && outTime === key.outTime) return key;
    return {
      id: key.id,
      time: key.time,
      value: key.value,
      mode: key.mode,
      inTime,
      inValue: key.inValue,
      outTime,
      outValue: key.outValue,
    };
  });
}
export function moveCurveHandle(keys: CurveKey[], id: string, side: string, time: number, value: number): CurveKey[] {
  const sorted = orderedKeys(keys),
    index = sorted.findIndex((k: CurveKey) => k.id === id);
  if (index < 0) return keys;
  const key = sorted[index],
    min = side === 'in' && index > 0 ? sorted[index - 1].time : key.time,
    max = side === 'out' && index + 1 < sorted.length ? sorted[index + 1].time : key.time;
  const x = toolClamp(time, min, max);
  return sorted.map((k: CurveKey) =>
    k.id !== id
      ? k
      : {
          id: k.id,
          time: k.time,
          value: k.value,
          mode: k.mode,
          inTime: side === 'in' ? x : k.inTime,
          inValue: side === 'in' ? value : k.inValue,
          outTime: side === 'out' ? x : k.outTime,
          outValue: side === 'out' ? value : k.outValue,
        },
  );
}
export function insertCurveKey(
  keys: CurveKey[],
  id: string,
  time: number,
  value: number,
  low: number,
  high: number,
  step: number = 0,
): CurveKey[] {
  const x = toolClamp(snapTime(time, step), low, high);
  if (keys.some((key: CurveKey) => Math.abs(key.time - x) < 0.000001)) return keys;
  return orderedKeys(keys.concat([{ id, time: x, value, mode: 'linear' }]));
}
export function nextToolSerial(prefix: string, previous: number, ids: string[]): number {
  let serial = previous + 1;
  while (ids.indexOf(prefix + String(serial)) >= 0) serial++;
  return serial;
}
export interface GradientStop {
  id: string;
  position: number;
  color: string;
}
export function orderedStops(stops: GradientStop[]): GradientStop[] {
  return stops.slice().sort((a: GradientStop, b: GradientStop) => a.position - b.position);
}
function channels(color: string): number[] {
  return [1, 3, 5, 7].map((at: number) => (at >= color.length ? 255 : parseInt(color.slice(at, at + 2), 16)));
}
export function sampleGradient(stops: GradientStop[], position: number): string {
  if (stops.length === 0) return '#00000000';
  const ordered = orderedStops(stops);
  if (position <= ordered[0].position)
    return ordered[0].color.length === 7 ? ordered[0].color + 'ff' : ordered[0].color;
  for (let i = 0; i + 1 < ordered.length; i++) {
    const a = ordered[i],
      b = ordered[i + 1];
    if (position > b.position) continue;
    const ratio = b.position <= a.position ? 1 : (position - a.position) / (b.position - a.position),
      ac = channels(a.color),
      bc = channels(b.color);
    return (
      '#' +
      ac
        .map((v: number, c: i32) =>
          Math.round(v + (bc[c] - v) * ratio)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
    );
  }
  const color = ordered[ordered.length - 1].color;
  return color.length === 7 ? color + 'ff' : color;
}
export interface TimelineClip {
  id: string;
  start: number;
  end: number;
  offset: number;
  duration: number;
  label: string;
}
export interface TimelineTrack {
  id: string;
  label: string;
  keys: CurveKey[];
  clips: TimelineClip[];
  locked?: boolean;
}
export function trimClip(clip: TimelineClip, edge: string, time: number): TimelineClip {
  const start =
    edge === 'start' ? toolClamp(time, Math.max(0, clip.start - clip.offset), clip.end - 0.000001) : clip.start;
  const offset = clip.offset + start - clip.start;
  const end = edge === 'end' ? toolClamp(time, start + 0.000001, start + clip.duration - offset) : clip.end;
  return { id: clip.id, start, end, offset, duration: clip.duration, label: clip.label };
}
export function editTimelineClip(
  clips: TimelineClip[],
  id: string,
  edge: string,
  time: number,
  end: number,
): TimelineClip[] {
  const ordered = clips.slice().sort((a: TimelineClip, b: TimelineClip) => a.start - b.start),
    index = ordered.findIndex((clip: TimelineClip) => clip.id === id);
  if (index < 0) return clips;
  const clip = ordered[index],
    before = index === 0 ? 0 : ordered[index - 1].end,
    after = index + 1 === ordered.length ? end : Math.min(end, ordered[index + 1].start);
  let next = clip;
  if (edge === 'move') {
    const start = toolClamp(time, before, after - (clip.end - clip.start));
    next = {
      id: clip.id,
      label: clip.label,
      start,
      end: start + clip.end - clip.start,
      offset: clip.offset,
      duration: clip.duration,
    };
  } else
    next = trimClip(
      clip,
      edge,
      toolClamp(
        time,
        edge === 'start' ? before : clip.start + 0.000001,
        edge === 'start' ? clip.end - 0.000001 : after,
      ),
    );
  return ordered.map((value: TimelineClip) => (value.id === id ? next : value));
}
export interface NodePin {
  id: string;
  label: string;
  type: string;
  output: boolean;
}
export interface ToolNode {
  id: string;
  label: string;
  x: number;
  y: number;
  width?: number;
  pins: NodePin[];
  children?: () => i32;
}
export interface NodeLink {
  id: string;
  fromNode: string;
  fromPin: string;
  toNode: string;
  toPin: string;
}
export function connectNodes(
  nodes: ToolNode[],
  links: NodeLink[],
  fromNode: string,
  fromPin: string,
  toNode: string,
  toPin: string,
  id: string,
): NodeLink[] {
  const from = nodes.find((n: ToolNode) => n.id === fromNode),
    to = nodes.find((n: ToolNode) => n.id === toNode);
  if (from === undefined || to === undefined || fromNode === toNode) return links;
  const a = from.pins.find((pin: NodePin) => pin.id === fromPin),
    b = to.pins.find((pin: NodePin) => pin.id === toPin);
  if (
    a === undefined ||
    b === undefined ||
    !a.output ||
    b.output ||
    (a.type !== b.type && a.type !== '' && b.type !== '')
  )
    return links;
  return links
    .filter((link: NodeLink) => link.toNode !== toNode || link.toPin !== toPin)
    .concat([{ id, fromNode, fromPin, toNode, toPin }]);
}
export interface FlameSpan {
  id: string;
  label: string;
  start: number;
  duration: number;
  depth: number;
}
export class FlameIndex {
  levels: FlameSpan[][] = [];
  private ends: number[][] = [];
  private durationTrees: number[][] = [];
  private treeSizes: number[] = [];
  constructor(spans: FlameSpan[]) {
    for (const span of spans) {
      if (
        span.duration < 0 ||
        span.depth < 0 ||
        !Number.isFinite(span.start) ||
        !Number.isFinite(span.duration) ||
        span.depth > 1024
      )
        continue;
      const depth = Math.floor(span.depth);
      while (this.levels.length <= depth) this.levels.push([]);
      this.levels[depth].push(span);
    }
    for (const level of this.levels) {
      level.sort((a: FlameSpan, b: FlameSpan) => a.start - b.start);
      const ends: number[] = [];
      let end = -Infinity;
      for (const span of level) {
        end = Math.max(end, span.start + span.duration);
        ends.push(end);
      }
      this.ends.push(ends);
      let size = 1;
      while (size < level.length) size *= 2;
      const tree: number[] = [];
      for (let i = 0; i < size * 2; i++) tree.push(0);
      for (let i = 0; i < level.length; i++) tree[size + i] = level[i].duration;
      for (let i = size - 1; i > 0; i--) tree[i] = Math.max(tree[i * 2], tree[i * 2 + 1]);
      this.treeSizes.push(size);
      this.durationTrees.push(tree);
    }
  }
  visible(
    start: number,
    end: number,
    pixelsPerUnit: number,
    firstDepth: number = 0,
    lastDepth: number = this.levels.length,
  ): FlameSpan[] {
    const result: FlameSpan[] = [];
    for (let depth = Math.max(0, firstDepth); depth < Math.min(lastDepth, this.levels.length); depth++) {
      const level = this.levels[depth];
      // Same-depth spans may overlap; prefix maxima bound both interval searches.
      const ends = this.ends[depth];
      let first = 0,
        last = ends.length;
      while (first < last) {
        const middle = Math.floor((first + last) / 2);
        if (ends[middle] < start) first = middle + 1;
        else last = middle;
      }
      let low = first,
        high = level.length;
      while (low < high) {
        const m = Math.floor((low + high) / 2);
        if (level[m].start < end) low = m + 1;
        else high = m;
      }
      this.collect(
        depth,
        1,
        0,
        this.treeSizes[depth],
        first,
        low,
        start,
        1 / Math.max(0.000001, pixelsPerUnit),
        result,
      );
    }
    return result;
  }
  private collect(
    depth: number,
    node: number,
    low: number,
    high: number,
    first: number,
    last: number,
    start: number,
    minimum: number,
    result: FlameSpan[],
  ): void {
    if (high <= first || low >= last || this.durationTrees[depth][node] < minimum) return;
    if (high - low === 1) {
      const span = this.levels[depth][low];
      if (span.start + span.duration >= start) result.push(span);
      return;
    }
    const middle = Math.floor((low + high) / 2);
    this.collect(depth, node * 2, low, middle, first, last, start, minimum, result);
    this.collect(depth, node * 2 + 1, middle, high, first, last, start, minimum, result);
  }
  hit(time: number, depth: number): FlameSpan | undefined {
    if (depth < 0 || depth >= this.levels.length) return undefined;
    const level = this.levels[depth],
      ends = this.ends[depth];
    let low = 0,
      high = level.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (level[middle].start <= time) low = middle + 1;
      else high = middle;
    }
    for (let i = low - 1; i >= 0 && ends[i] >= time; i--)
      if (level[i].start + level[i].duration >= time) return level[i];
    return undefined;
  }
}
export enum NibblePhase {
  High,
  Low,
}
export class HexSelection {
  cursor = 0;
  anchor = 0;
  phase = NibblePhase.High;
  move(index: number, length: number, extend: boolean): void {
    this.cursor = Math.floor(toolClamp(index, 0, Math.max(0, length - 1)));
    if (!extend) this.anchor = this.cursor;
    this.transition(NibblePhase.High);
  }
  transition(next: NibblePhase): void {
    this.phase = next;
  }
  edit(bytes: number[], digit: string): number[] {
    const nibble = '0123456789abcdef'.indexOf(digit.toLowerCase());
    if (nibble < 0 || digit.length !== 1 || bytes.length === 0) return bytes;
    const result = bytes.slice(),
      value = Math.floor(toolClamp(result[this.cursor], 0, 255));
    result[this.cursor] =
      this.phase === NibblePhase.High ? nibble * 16 + (value % 16) : Math.floor(value / 16) * 16 + nibble;
    if (this.phase === NibblePhase.High) this.transition(NibblePhase.Low);
    else {
      this.move(this.cursor + 1, bytes.length, false);
    }
    return result;
  }
  copy(bytes: number[], ascii: boolean): string {
    const low = Math.max(0, Math.min(this.cursor, this.anchor));
    const high = Math.min(bytes.length, low + 4194304, Math.max(this.cursor, this.anchor) + 1);
    const chunks: string[] = [],
      chunk: string[] = [];
    for (let i = low; i < high; i++) {
      const value = Math.floor(toolClamp(bytes[i], 0, 255));
      chunk.push(
        ascii ? (value >= 32 && value < 127 ? String.fromCharCode(value) : '.') : value.toString(16).padStart(2, '0'),
      );
      if (chunk.length === 1024) {
        chunks.push(chunk.join(ascii ? '' : ' '));
        chunk.length = 0;
      }
    }
    if (chunk.length > 0) chunks.push(chunk.join(ascii ? '' : ' '));
    return chunks.join(ascii ? '' : ' ');
  }
}
export enum MeterPhase {
  Rest,
  Active,
  Suspended,
  Disposed,
}
export class LevelState {
  phase = MeterPhase.Rest;
  peaks: number[] = [];
  holds: number[] = [];
  until: number[] = [];
  clips: boolean[] = [];
  private previous = 0;
  constructor(
    public floor: number = -60,
    public ceiling: number = 6,
    public holdMs: number = 1500,
    public decayDb: number = 20,
  ) {
    this.floor = toolClamp(floor, -180, 0);
    this.ceiling = toolClamp(ceiling, this.floor + 1, 24);
    this.holdMs = toolClamp(holdMs, 0, 60000);
    this.decayDb = toolClamp(decayDb, 0.1, 180);
  }
  transition(next: MeterPhase): void {
    if (this.phase === MeterPhase.Disposed || (this.phase === MeterPhase.Suspended && next === MeterPhase.Active))
      return;
    this.phase = next;
  }
  sample(values: number[], now: number): void {
    if (this.phase === MeterPhase.Disposed || this.phase === MeterPhase.Suspended) return;
    const elapsed = Math.max(0, now - this.previous) / 1000;
    this.previous = now;
    const count = Math.min(8, values.length);
    while (this.peaks.length < count) {
      this.peaks.push(this.floor);
      this.holds.push(this.floor);
      this.until.push(0);
      this.clips.push(false);
    }
    this.peaks.length = count;
    this.holds.length = count;
    this.until.length = count;
    this.clips.length = count;
    let active = false;
    for (let i = 0; i < count; i++) {
      const db =
        values[i] > 0 && Number.isFinite(values[i])
          ? toolClamp(20 * Math.log10(values[i]), this.floor, this.ceiling)
          : this.floor;
      this.peaks[i] = Math.max(db, this.peaks[i] - elapsed * this.decayDb);
      if (db >= this.holds[i]) {
        this.holds[i] = db;
        this.until[i] = now + this.holdMs;
      } else if (now > this.until[i]) this.holds[i] = Math.max(this.peaks[i], this.holds[i] - elapsed * this.decayDb);
      this.clips[i] = this.clips[i] || db >= 0;
      if (this.peaks[i] > this.floor || this.holds[i] > this.floor) active = true;
    }
    this.transition(active ? MeterPhase.Active : MeterPhase.Rest);
  }
  reset(): void {
    for (let i = 0; i < this.clips.length; i++) {
      this.clips[i] = false;
      this.holds[i] = this.peaks[i];
      this.until[i] = this.previous + this.holdMs;
    }
  }
}

export enum MeterClockPhase {
  Idle,
  Scheduled,
  Disposed,
}
export class MeterClock {
  phase = MeterClockPhase.Idle;
  handle = 0;
  generation = 0;
  transition(next: MeterClockPhase): void {
    if (this.phase === MeterClockPhase.Disposed || next === this.phase) return;
    if (next === MeterClockPhase.Scheduled && this.phase !== MeterClockPhase.Idle) return;
    this.phase = next;
    this.generation++;
  }
}
