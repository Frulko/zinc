/** @jsxHelpers zinc:ui/kit/host */
// Quiet tool panels. Callers own documents and services; unmount owns every gesture and scheduled tick.
import * as ui from 'zinc:ui';
import { rrect, stroke, drawText, font, setClipboardText } from 'zinc:gfx';
import { createNodeRef } from 'zinc:ui/solid';
import {
  componentRef,
  componentSignal,
  componentMemo,
  componentEffect,
  onCleanup,
  renderSlot,
  _virtual as virtualRows,
} from './host';
import { theme, themeColor } from './theme';
import { Button as KitButton } from './button';
import { Input as TextField, SearchField, NumberField, ScrubField, Select, SelectOption } from './input';
import { Checkbox } from './selection';
import { ColorPicker } from './pickers';
import { Accordion, AccordionItem, DataGrid, DataRow } from './data';
import { ResizeHandle } from './separator';
import { Tooltip } from './overlays';
import {
  toolClamp,
  snapTime,
  LogBuffer,
  LogRecord,
  TerminalBuffer,
  TerminalCell,
  TerminalLine,
  CurveKey,
  CurveMode,
  orderedKeys,
  evaluateCurve,
  moveCurveKey,
  moveCurveHandle,
  insertCurveKey,
  nextToolSerial,
  GradientStop,
  orderedStops,
  sampleGradient,
  TimelineTrack,
  TimelineClip,
  editTimelineClip,
  ToolNode,
  NodePin,
  NodeLink,
  connectNodes,
  FlameSpan,
  FlameIndex,
  HexSelection,
  NibblePhase,
  LevelState,
  MeterPhase,
  MeterClock,
  MeterClockPhase,
} from './tool-model';
export {
  LogBuffer,
  LogRecord,
  TerminalBuffer,
  TerminalCell,
  TerminalLine,
  CurveKey,
  CurveMode,
  evaluateCurve,
  GradientStop,
  sampleGradient,
  TimelineTrack,
  TimelineClip,
  ToolNode,
  NodePin,
  NodeLink,
  FlameSpan,
} from './tool-model';
function textClass(): string {
  return `text-[13px] text-${theme().foreground}`;
}
function focusClass(): string {
  return `focus-visible:ring-2 focus-visible:ring-${theme().accent} focus-visible:ring-offset-2`;
}
function editingField(): boolean {
  const node = ui.inspectNode(ui.focused());
  return node !== null && (node.tag === ui.INPUT || node.tag === ui.TEXTAREA);
}
function surfaceClass(): string {
  return `min-w-0 overflow-hidden rounded-[14px] border border-${theme().border} bg-${theme().card}`;
}
enum GesturePhase {
  Idle,
  Pressed,
  Dragging,
  Disposed,
}
class PanelGesture {
  phase = GesturePhase.Idle;
  id = '';
  originX = 0;
  originY = 0;
  x = 0;
  y = 0;
  transition(next: GesturePhase): void {
    if (
      this.phase === GesturePhase.Disposed ||
      (next === GesturePhase.Pressed && this.phase !== GesturePhase.Idle) ||
      (next === GesturePhase.Dragging && this.phase !== GesturePhase.Pressed && this.phase !== GesturePhase.Dragging)
    )
      return;
    this.phase = next;
    if (next === GesturePhase.Idle || next === GesturePhase.Disposed) this.id = '';
  }
}
function ownGesture(root: i32, state: PanelGesture): void {
  componentEffect(() => {
    const cancel = (): void => state.transition(GesturePhase.Idle);
    const removeFocus = ui.onFocusWithin(root, (inside: boolean) => {
      if (!ui.hasFocusWithin(root)) cancel();
    });
    const signal = (kind: string, arg: string): void => {
      if ((kind === 'focus' && arg === '0') || kind === 'background') cancel();
    };
    ui.addSignalListener(signal);
    return () => {
      removeFocus();
      ui.removeSignalListener(signal);
      state.transition(GesturePhase.Disposed);
    };
  }, []);
}
export interface InspectorProperty {
  id: string;
  label: string;
  type: string;
  group?: string;
  tooltip?: string;
  disabled?: boolean;
  value: () => string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  options?: SelectOption[];
}
export interface PropertyInspectorProps {
  properties: InspectorProperty[];
  label?: string;
  className?: string;
}
function PropertyField(p: { property: InspectorProperty }): i32 {
  const row = p.property,
    dimensions = row.type === 'vector2' ? 2 : row.type === 'vector4' ? 4 : 3;
  if (row.type === 'boolean')
    return (
      <Checkbox
        label={row.label}
        checked={() => row.value() === 'true'}
        onChange={(value: boolean) => row.onChange(String(value))}
        disabled={row.disabled}
      />
    );
  if (row.type === 'enum')
    return (
      <Select
        label={row.label}
        items={row.options ?? []}
        value={row.value}
        onChange={row.onChange}
        disabled={row.disabled}
      />
    );
  if (row.type === 'color')
    return (
      <ColorPicker label={row.label} value={row.value} onChange={row.onChange} disabled={row.disabled} alpha={true} />
    );
  if (row.type === 'vector' || row.type === 'vector2' || row.type === 'vector3' || row.type === 'vector4')
    return (
      <View className="flex-row flex-wrap gap-1">
        {[0, 1, 2, 3].slice(0, row.type === 'vector2' ? 2 : row.type === 'vector4' ? 4 : 3).map((axis: number) => (
          <View className="grow basis-[80px] min-w-0">
            <ScrubField
              label={row.label + ' ' + ['X', 'Y', 'Z', 'W'][axis]}
              value={() => Number(row.value().split(',').length > axis ? row.value().split(',')[axis] : '0')}
              onChange={(value: number) => {
                const parts = row.value().split(',');
                while (parts.length < dimensions) parts.push('0');
                parts[axis] = String(value);
                row.onChange(parts.join(','));
              }}
              min={row.min}
              max={row.max}
              step={row.step}
              disabled={row.disabled}
            />
          </View>
        ))}
      </View>
    );
  if (row.type === 'float' || row.type === 'integer')
    return (
      <ScrubField
        label={row.label}
        value={() => Number(row.value())}
        onChange={(value: number) => row.onChange(String(value))}
        min={row.min}
        max={row.max}
        step={row.step ?? 1}
        decimals={row.type === 'integer' ? 0 : 3}
        disabled={row.disabled}
      />
    );
  return <TextField label={row.label} value={row.value} onInput={row.onChange} disabled={row.disabled} />;
}
function propertyGroups(properties: InspectorProperty[]): string[] {
  const groups: string[] = [];
  for (const row of properties) {
    const group = row.group ?? 'Properties';
    if (groups.indexOf(group) < 0) groups.push(group);
  }
  return groups;
}
export function PropertyInspector(p: PropertyInspectorProps): i32 {
  const [expanded, setExpanded] = componentSignal<string[]>(propertyGroups(p.properties));
  const [fraction, setFraction] = componentSignal(0.38),
    [width, setWidth] = componentSignal(500);
  const root = createNodeRef(),
    groups = propertyGroups(p.properties);
  const items: AccordionItem[] = groups.map((name: string) => ({
    id: name,
    title: name,
    content: () => (
      <View className="flex-col gap-3">
        {p.properties
          .filter((row: InspectorProperty) => (row.group ?? 'Properties') === name)
          .map((row: InspectorProperty) => (
            <View className={width() < 380 ? 'flex-col gap-1' : 'flex-row items-start gap-2'}>
              <View style={{ width: width() < 380 ? width() - 40 : Math.max(60, (width() - 50) * fraction()) }}>
                <Tooltip label={row.tooltip ?? row.label}>
                  <Text className={`pt-2 text-[12px] text-${theme().mutedForeground}`}>{row.label}</Text>
                </Tooltip>
              </View>
              <Show when={width() >= 380}>
                <ResizeHandle
                  vertical={true}
                  size={() => (width() - 50) * fraction()}
                  onResize={(value: number) => setFraction(toolClamp(value / Math.max(1, width() - 50), 0.2, 0.7))}
                  min={60}
                  max={(width() - 50) * 0.7}
                />
              </Show>
              <View className="grow min-w-0">
                <PropertyField property={row} />
              </View>
            </View>
          ))}
      </View>
    ),
  }));
  const node = (
    <View
      ref={root}
      role="group"
      aria-label={p.label ?? 'Property inspector'}
      className={`relative flex-col ${p.className ?? ''}`}
    >
      <Canvas
        className="absolute inset-0 pointer-events-none"
        style={{ lazy: 1 }}
        onDraw={(x: i32, y: i32, w: i32, h: i32) => {
          if (w !== width()) setWidth(w);
        }}
      />
      <Accordion items={items} expanded={expanded} onChange={setExpanded} multiple={true} />
    </View>
  );
  return node;
}
export interface LogConsoleProps {
  buffer: LogBuffer;
  revision: () => number;
  label?: string;
  height?: number;
  className?: string;
}
export function LogConsole(p: LogConsoleProps): i32 {
  const [query, setQuery] = componentSignal(''),
    [level, setLevel] = componentSignal(''),
    [selected, setSelected] = componentSignal<string[]>([]),
    [follow, setFollow] = componentSignal(true),
    [refresh, setRefresh] = componentSignal(0);
  const records = componentMemo(() => {
    p.revision();
    refresh();
    return p.buffer.filtered(query(), level());
  }, [] as LogRecord[]);
  const rows = componentMemo(
    () => records().map((r: LogRecord) => ({ id: String(r.id), cells: [r.time, r.level, r.source, r.text] })),
    [] as DataRow[],
  );
  const viewport = createNodeRef();
  const copy = (): void =>
    setClipboardText(
      records()
        .filter((r: LogRecord) => selected().length === 0 || selected().indexOf(String(r.id)) >= 0)
        .map((r: LogRecord) => [r.time, r.level, r.source, r.text].join(' '))
        .join('\n'),
    );
  const node = (
    <View
      ref={viewport}
      className={`flex-col gap-2 min-w-0 ${p.className ?? ''}`}
      onKeyDown={(e: ui.KeyEvent) => {
        if (e.primary && e.key === 'c') {
          copy();
          e.preventDefault();
        }
      }}
    >
      <View className="flex-row flex-wrap items-end gap-2">
        <View className="grow basis-[150px]">
          <SearchField label="Filter logs" value={query} onInput={setQuery} />
        </View>
        <Select
          className="w-[170px] max-w-full"
          label="Log level"
          items={['', 'debug', 'info', 'warning', 'error'].map((v: string) => ({
            value: v,
            label: v === '' ? 'All levels' : v,
          }))}
          value={level}
          onChange={setLevel}
        />
        <Checkbox label="Follow" checked={follow} onChange={setFollow} />
        <KitButton label="Copy logs" size="sm" variant="outline" onClick={copy} />
        <KitButton
          label="Clear logs"
          size="sm"
          variant="ghost"
          onClick={() => {
            p.buffer.clear();
            setSelected([]);
            setRefresh(refresh() + 1);
            ui.repaint();
          }}
        />
      </View>
      <Text className={`text-[12px] text-${theme().mutedForeground}`}>
        {String(p.buffer.count('warning')) +
          ' warnings · ' +
          String(p.buffer.count('error')) +
          ' errors · ' +
          String(records().length) +
          ' / ' +
          String(p.buffer.records.length) +
          ' records'}
      </Text>
      <DataGrid
        label={p.label ?? 'Log console'}
        columns={[
          { id: 'time', label: 'Time', width: 90 },
          {
            id: 'level',
            label: 'Level',
            width: 80,
            cell: (row: DataRow) => (
              <Text
                className={`text-[12px] text-${row.cells[1] === 'error' ? theme().destructive : row.cells[1] === 'warning' ? theme().warningSoftForeground : theme().mutedForeground}`}
              >
                {row.cells[1]}
              </Text>
            ),
          },
          { id: 'source', label: 'Source', width: 110 },
          { id: 'text', label: 'Message', width: 550 },
        ]}
        rows={rows}
        selected={selected}
        onSelect={setSelected}
        height={p.height ?? 220}
        compact={true}
      />
    </View>
  );
  componentEffect(() => {
    p.revision();
    if (follow() && rows().length > 0) {
      const grids = ui.inspectNode(viewport.node);
      if (grids !== null) followLog(viewport.node, rows().length);
    }
    return undefined;
  });
  return node;
}
function followLog(root: i32, count: number): void {
  const node = ui.inspectNode(root);
  if (node === null) return;
  if (node.tag === ui.SCROLL && ui.getNumber(root, 'height') > 0) ui.scrollTo(root, ui.scrollLeft(root), count * 36);
  for (const child of node.children) followLog(child, count);
}
export interface TerminalProps {
  buffer: TerminalBuffer;
  revision: () => number;
  onCommand: (command: string) => void;
  onInterrupt?: () => void;
  prompt?: string;
  label?: string;
  height?: number;
  noInput?: boolean;
  size?: number;
  disabled?: boolean;
  className?: string;
}
interface TerminalRun {
  text: string;
  foreground: string;
  background: string;
  bold: boolean;
  dim: boolean;
  underline: boolean;
  inverse: boolean;
}
interface TerminalRow {
  line: number;
  start: number;
  end: number;
}
function terminalRuns(line: TerminalLine, start: number, end: number): TerminalRun[] {
  const result: TerminalRun[] = [];
  for (let i = start; i < end; i++) {
    const cell = line.cells[i],
      previous = result.length > 0 ? result[result.length - 1] : null;
    if (
      previous !== null &&
      previous.foreground === cell.foreground &&
      previous.background === cell.background &&
      previous.bold === cell.bold &&
      previous.dim === cell.dim &&
      previous.underline === cell.underline &&
      previous.inverse === cell.inverse
    )
      previous.text += cell.text;
    else
      result.push({
        text: cell.text,
        foreground: cell.foreground,
        background: cell.background,
        bold: cell.bold,
        dim: cell.dim,
        underline: cell.underline,
        inverse: cell.inverse,
      });
  }
  return result;
}
function terminalColor(value: string, fallback: string): string {
  if (value === '') return fallback;
  if (!value.startsWith('ansi:')) return '[' + value + ']';
  const dark = ui.currentScheme() === 'dark';
  const lightColors = [
    '#181818',
    '#c9302d',
    '#00774d',
    '#9f6202',
    '#2864c8',
    '#8645ae',
    '#087b88',
    '#676767',
    '#585858',
    '#c9302d',
    '#00774d',
    '#9f6202',
    '#2864c8',
    '#8645ae',
    '#087b88',
    '#181818',
  ];
  const darkColors = [
    '#b4b4b4',
    '#f2716c',
    '#55d69f',
    '#f2bd68',
    '#82adf5',
    '#c89cde',
    '#79ced7',
    '#c8c8c8',
    '#b4b4b4',
    '#f2716c',
    '#55d69f',
    '#f2bd68',
    '#82adf5',
    '#c89cde',
    '#79ced7',
    '#f2f2f2',
  ];
  return '[' + (dark ? darkColors : lightColors)[Math.floor(toolClamp(Number(value.slice(5)), 0, 15))] + ']';
}
export function Terminal(p: TerminalProps): i32 {
  const [input, setInput] = componentSignal(''),
    [selection, setSelection] = componentSignal<number[]>([]),
    [follow, setFollow] = componentSignal(true),
    [refresh, setRefresh] = componentSignal(0),
    [columns, setColumns] = componentSignal(80);
  const history = componentRef(p.buffer.history.length),
    draft = componentRef(''),
    output = createNodeRef(),
    field = createNodeRef();
  const size = Math.max(10, p.size ?? 13),
    rowHeight = Math.ceil(size * 1.7);
  const lines = componentMemo(() => {
    p.revision();
    refresh();
    return p.buffer.lines;
  }, [] as TerminalLine[]);
  const rows = componentMemo(() => {
    const result: TerminalRow[] = [],
      source = lines(),
      width = columns();
    for (let line = 0; line < source.length; line++) {
      const length = source[line].cells.length;
      for (let start = 0; start < Math.max(1, length); start += width)
        result.push({ line, start, end: Math.min(length, start + width) });
    }
    return result;
  }, [] as TerminalRow[]);
  const copy = (): void => {
    const chosen = selection(),
      first = chosen.length === 0 ? 0 : lines().findIndex((line: TerminalLine) => line.id === chosen[0]),
      last =
        chosen.length === 0
          ? lines().length - 1
          : lines().findIndex((line: TerminalLine) => line.id === chosen[chosen.length - 1]);
    if (first >= 0 && last >= 0) setClipboardText(p.buffer.text(first, last));
  };
  const submit = (): void => {
    if (p.disabled === true) return;
    const command = input();
    p.buffer.remember(command);
    p.buffer.write((p.prompt ?? '$') + ' ' + command + '\n');
    history.current = p.buffer.history.length;
    draft.current = '';
    setInput('');
    p.onCommand(command);
    setRefresh(refresh() + 1);
  };
  const interrupt = (): void => {
    if (selection().length > 0) {
      copy();
      return;
    }
    if (p.disabled === true) return;
    p.buffer.write('^C\n');
    setInput('');
    setRefresh(refresh() + 1);
    if (p.onInterrupt !== undefined) p.onInterrupt();
  };
  const outputKey = (e: ui.KeyEvent): void => {
    if (e.primary && e.key === 'a') {
      if (lines().length > 0) setSelection([lines()[0].id, lines()[lines().length - 1].id]);
    } else if (e.primary && e.key === 'c') interrupt();
    else if (e.key === 'Escape') setSelection([]);
    else if (
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown' ||
      e.key === 'Home' ||
      e.key === 'End' ||
      e.key === 'PageUp' ||
      e.key === 'PageDown'
    ) {
      const chosen = selection(),
        current =
          chosen.length === 0 ? 0 : lines().findIndex((line: TerminalLine) => line.id === chosen[chosen.length - 1]),
        page = Math.max(1, Math.floor((p.height ?? 200) / rowHeight)),
        delta = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : e.key === 'PageUp' ? -page : page;
      const next =
        e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? lines().length - 1
            : Math.floor(toolClamp(current + delta, 0, lines().length - 1));
      if (lines().length > 0) {
        setSelection(e.shift && chosen.length > 0 ? [chosen[0], lines()[next].id] : [lines()[next].id]);
        const visual = rows().findIndex((row: TerminalRow) => row.line === next);
        ui.scrollToRow(output.node, visual);
      }
      setFollow(e.key === 'End');
    } else return;
    e.preventDefault();
  };
  const node = (
    <View
      role="group"
      aria-label={p.label ?? 'Terminal'}
      className={`relative flex-col ${surfaceClass()} ${p.className ?? ''}`}
    >
      <Canvas
        className="absolute inset-0 pointer-events-none"
        style={{ lazy: 1 }}
        onDraw={(x: i32, y: i32, w: i32, h: i32) => {
          const next = Math.max(1, Math.floor((w - 16) / (size * 0.62)));
          if (next !== columns()) setColumns(next);
        }}
      />
      <View className="flex-row flex-wrap items-center gap-2 px-2 py-1">
        <Checkbox label="Follow output" checked={follow} onChange={setFollow} />
        <KitButton label="Copy output" size="sm" variant="ghost" onClick={copy} />
        <KitButton
          label="Clear output"
          size="sm"
          variant="ghost"
          onClick={() => {
            p.buffer.clear();
            setSelection([]);
            setRefresh(refresh() + 1);
          }}
        />
      </View>
      <ScrollView
        ref={output}
        tabIndex={0}
        role="log"
        aria-label="Terminal output"
        className={`h-[${p.height ?? 200}px] ${focusClass()}`}
        onKeyDown={outputKey}
        onScroll={(e: ui.ResponderEvent, g: ui.GestureState) => {
          const event = e.nativeEvent;
          setFollow(event.contentOffset.y + event.layoutMeasurement.height >= event.contentSize.height - rowHeight);
        }}
      />
      <Show when={p.noInput !== true}>
        <View className={`flex-row items-center border-t border-${theme().border} px-2`}>
          <Text className={textClass()}>{p.prompt ?? '$'}</Text>
          <Input
            ref={field}
            value={input()}
            aria-label="Terminal command"
            disabled={p.disabled === true}
            className={`grow h-9 px-2 font-mono text-[${size}px] text-${theme().foreground} ${focusClass()}`}
            onInput={setInput}
            onKeyDown={(e: ui.KeyEvent) => {
              if (e.key === 'Enter') {
                submit();
                e.preventDefault();
              } else if (e.ctrl && e.key === 'c') {
                interrupt();
                e.preventDefault();
              } else if (e.ctrl && e.key === 'l') {
                p.buffer.clear();
                setSelection([]);
                setRefresh(refresh() + 1);
                e.preventDefault();
              } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                if (history.current >= p.buffer.history.length) draft.current = input();
                history.current = Math.floor(
                  toolClamp(history.current + (e.key === 'ArrowUp' ? -1 : 1), 0, p.buffer.history.length),
                );
                setInput(
                  history.current === p.buffer.history.length ? draft.current : p.buffer.history[history.current],
                );
                e.preventDefault();
              }
            }}
          />
        </View>
      </Show>
    </View>
  );
  virtualRows(
    output.node,
    () => rows().length,
    rowHeight,
    (index: i32) => {
      const row = rows()[index],
        line = lines()[row.line],
        runs = terminalRuns(line, row.start, row.end);
      const selected = (): boolean =>
        selection().length > 0 &&
        line.id >= Math.min(selection()[0], selection()[selection().length - 1]) &&
        line.id <= Math.max(selection()[0], selection()[selection().length - 1]);
      return (
        <Button
          tabIndex={-1}
          aria-label={'Output line ' + String(line.id)}
          className={`h-[${rowHeight}px] flex-row justify-start items-center px-2 ${selected() ? 'bg-' + theme().accentSoft : ''}`}
          onClick={() => {
            if (p.noInput === true) ui.focusNode(output.node);
            else ui.focusNode(field.node);
          }}
          onPointerDown={(e: ui.PointerEvent) => {
            if (e.shift && selection().length > 0) setSelection([selection()[0], line.id]);
            else setSelection([line.id]);
          }}
        >
          {runs.map((run: TerminalRun) => (
            <Text
              className={`font-mono text-[${size}px] ${run.bold ? 'font-medium' : ''} ${run.dim ? 'opacity-45' : ''} ${run.underline ? 'underline' : ''} text-${terminalColor(run.inverse ? run.background : run.foreground, run.inverse ? theme().card : theme().foreground)} ${run.inverse || run.background !== '' ? 'bg-' + terminalColor(run.inverse ? run.foreground : run.background, theme().foreground) : ''}`}
            >
              {run.text}
            </Text>
          ))}
        </Button>
      );
    },
  );
  componentEffect(() => {
    p.revision();
    refresh();
    if (follow()) ui.scrollTo(output.node, 0, rows().length * rowHeight);
    return undefined;
  });
  return node;
}
export interface CurveEditorProps {
  keys: () => CurveKey[];
  onChange: (keys: CurveKey[]) => void;
  label?: string;
  minTime?: number;
  maxTime?: number;
  minValue?: number;
  maxValue?: number;
  snap?: number;
  height?: number;
  disabled?: boolean;
  className?: string;
}
export function CurveEditor(p: CurveEditorProps): i32 {
  const [selected, setSelected] = componentSignal(''),
    root = createNodeRef(),
    gesture = componentRef(new PanelGesture()).current,
    serial = componentRef(0),
    points = componentRef<number[]>([]);
  const low = p.minTime ?? 0,
    high = Math.max(low + 0.000001, p.maxTime ?? 1),
    bottom = p.minValue ?? 0,
    top = Math.max(bottom + 0.000001, p.maxValue ?? 1),
    height = p.height ?? 180;
  const keys = componentMemo(() => orderedKeys(p.keys()), [] as CurveKey[]);
  const active = (): CurveKey | undefined => keys().find((k: CurveKey) => k.id === selected());
  const move = (time: number, value: number): void => {
    if (p.disabled !== true) {
      p.onChange(moveCurveKey(keys(), selected(), time, toolClamp(value, bottom, top), low, high, p.snap ?? 0));
      ui.repaint();
    }
  };
  const remove = (): void => {
    if (p.disabled !== true && keys().length > 2) {
      p.onChange(keys().filter((k: CurveKey) => k.id !== selected()));
      setSelected('');
      ui.repaint();
    }
  };
  const pointAt = (e: ui.PointerEvent): number[] => {
    const box = ui.screenBox(root.node);
    return [
      low + toolClamp(e.x / Math.max(1, box[2]), 0, 1) * (high - low),
      top - toolClamp(e.y / height, 0, 1) * (top - bottom),
    ];
  };
  const add = (time: number, value: number): void => {
    if (p.disabled === true) return;
    const current = keys();
    serial.current = nextToolSerial(
      'curve-',
      serial.current,
      current.map((key: CurveKey) => key.id),
    );
    const id = 'curve-' + String(serial.current),
      next = insertCurveKey(current, id, time, value, low, high, p.snap ?? 0);
    if (next === current) return;
    p.onChange(next);
    setSelected(id);
    ui.repaint();
  };
  const selectAt = (e: ui.PointerEvent): void => {
    if (p.disabled === true || e.button !== 0) return;
    const box = ui.screenBox(root.node),
      time = pointAt(e)[0],
      value = pointAt(e)[1];
    const current = active();
    if (current !== undefined && current.mode === 'free') {
      for (const side of ['in', 'out']) {
        const tx = side === 'in' ? (current.inTime ?? current.time) : (current.outTime ?? current.time),
          ty = side === 'in' ? (current.inValue ?? current.value) : (current.outValue ?? current.value);
        const dx = ((tx - time) / (high - low)) * box[2],
          dy = ((ty - value) / (top - bottom)) * height;
        if (dx * dx + dy * dy < 100) {
          gesture.id = 'handle-' + side;
          gesture.transition(GesturePhase.Pressed);
          return;
        }
      }
    }
    let closest = '',
      distance = 100;
    for (const key of keys()) {
      const dx = ((key.time - time) / (high - low)) * box[2],
        dy = ((key.value - value) / (top - bottom)) * height,
        d = dx * dx + dy * dy;
      if (d < distance) {
        closest = key.id;
        distance = d;
      }
    }
    if (closest !== '') {
      setSelected(closest);
      gesture.id = closest;
      gesture.transition(GesturePhase.Pressed);
    }
  };
  const node = (
    <View className={`flex-col gap-2 min-w-0 ${p.className ?? ''}`}>
      <View
        ref={root}
        tabIndex={0}
        role="application"
        aria-label={p.label ?? 'Curve editor'}
        className={`relative h-[${height}px] ${surfaceClass()} ${focusClass()}`}
        grab="keep"
        onPointerDown={selectAt}
        onPointerMove={(e: ui.PointerEvent) => {
          if (gesture.phase === GesturePhase.Pressed || gesture.phase === GesturePhase.Dragging) {
            gesture.transition(GesturePhase.Dragging);
            const point = pointAt(e);
            if (gesture.id.startsWith('handle-')) {
              p.onChange(moveCurveHandle(keys(), selected(), gesture.id.slice(7), point[0], point[1]));
              ui.repaint();
            } else move(point[0], point[1]);
          }
        }}
        onPointerUp={(e: ui.PointerEvent) => gesture.transition(GesturePhase.Idle)}
        onPointerCancel={(e: ui.PointerEvent) => gesture.transition(GesturePhase.Idle)}
        onDoubleClick={(e: ui.PointerEvent) => {
          const point = pointAt(e);
          add(point[0], point[1]);
        }}
        onKeyDown={(e: ui.KeyEvent) => {
          const key = active(),
            index = keys().findIndex((k: CurveKey) => k.id === selected());
          if (e.key === 'Tab') return;
          if (e.key === 'Home' || e.key === 'End' || e.key === '[' || e.key === ']') {
            const next =
              e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? keys().length - 1
                  : toolClamp(index + (e.key === '[' ? -1 : 1), 0, keys().length - 1);
            if (keys().length > 0) setSelected(keys()[next].id);
          } else if (e.key === 'Insert') {
            add((low + high) / 2, evaluateCurve(keys(), (low + high) / 2));
          } else if (e.key === 'Delete' || e.key === 'Backspace') remove();
          else if (key !== undefined && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'))
            move(
              key.time + (e.key === 'ArrowLeft' ? -1 : 1) * (p.snap ?? (high - low) / 100) * (e.shift ? 10 : 1),
              key.value,
            );
          else if (key !== undefined && (e.key === 'ArrowUp' || e.key === 'ArrowDown'))
            move(key.time, key.value + ((e.key === 'ArrowUp' ? 1 : -1) * (top - bottom)) / (e.shift ? 10 : 100));
          else if (e.key === 'Escape') {
            gesture.transition(GesturePhase.Idle);
            setSelected('');
          } else return;
          ui.repaint();
          e.preventDefault();
        }}
      >
        <Canvas
          className="absolute inset-0 pointer-events-none"
          style={{ lazy: 1 }}
          onDraw={(x: i32, y: i32, w: i32, h: i32) => {
            const border = themeColor('border'),
              accent = themeColor('accent'),
              muted = themeColor('mutedForeground');
            for (let i = 1; i < 4; i++) {
              rrect(x, y + (h * i) / 4, w, 1, 0, border as u32, 255);
              rrect(x + (w * i) / 4, y, 1, h, 0, border as u32, 255);
            }
            const path = points.current;
            path.length = 0;
            for (let i = 0; i <= Math.min(w, 512); i++) {
              const ratio = i / Math.min(w, 512);
              path.push(
                x + ratio * w,
                y + (1 - (evaluateCurve(keys(), low + ratio * (high - low)) - bottom) / (top - bottom)) * h,
              );
            }
            if (path.length > 3) stroke(path, 2, accent as u32, 255, false);
            for (const key of keys()) {
              const px = x + ((key.time - low) / (high - low)) * w,
                py = y + (1 - (key.value - bottom) / (top - bottom)) * h;
              rrect(px - 4, py - 4, 8, 8, 2, (key.id === selected() ? accent : muted) as u32, 255);
              if (key.id === selected() && key.mode === 'free') {
                for (const side of ['in', 'out']) {
                  const tx = side === 'in' ? (key.inTime ?? key.time) : (key.outTime ?? key.time),
                    ty = side === 'in' ? (key.inValue ?? key.value) : (key.outValue ?? key.value);
                  const hx = x + ((tx - low) / (high - low)) * w,
                    hy = y + (1 - (ty - bottom) / (top - bottom)) * h;
                  path.length = 0;
                  path.push(px, py, hx, hy);
                  stroke(path, 1, muted as u32, 255, false);
                  rrect(hx - 3, hy - 3, 6, 6, 3, muted as u32, 255);
                }
              }
            }
          }}
        />
      </View>
      <View className="flex-row flex-wrap gap-2 items-end">
        <Show when={active() !== undefined}>
          <NumberField
            className="w-[170px] max-w-full"
            label="Key time"
            value={() => active()?.time ?? 0}
            min={low}
            max={high}
            step={p.snap ?? 0.01}
            onChange={(v: number) => move(v, active()?.value ?? 0)}
            disabled={p.disabled}
          />
          <NumberField
            className="w-[170px] max-w-full"
            label="Key value"
            value={() => active()?.value ?? 0}
            min={bottom}
            max={top}
            step={0.01}
            onChange={(v: number) => move(active()?.time ?? 0, v)}
            disabled={p.disabled}
          />
          <Select
            className="w-[170px] max-w-full"
            label="Interpolation"
            items={['linear', 'step', 'smooth', 'free'].map((v: string) => ({ value: v, label: v }))}
            value={() => active()?.mode ?? 'linear'}
            onChange={(value: string) => {
              if (p.disabled !== true) {
                p.onChange(
                  keys().map((k: CurveKey) =>
                    k.id === selected()
                      ? {
                          id: k.id,
                          time: k.time,
                          value: k.value,
                          mode: value as CurveMode,
                          inTime: k.inTime,
                          inValue: k.inValue,
                          outTime: k.outTime,
                          outValue: k.outValue,
                        }
                      : k,
                  ),
                );
                ui.repaint();
              }
            }}
            disabled={p.disabled}
          />
          <KitButton
            label="Remove key"
            size="sm"
            variant="ghost"
            disabled={p.disabled === true || keys().length <= 2}
            onClick={remove}
          />
          <Show when={active()?.mode === 'free'}>
            {['in', 'out'].map((side: string) => (
              <View className="flex-row gap-1">
                <NumberField
                  className="w-[170px] max-w-full"
                  label={side + ' handle time'}
                  value={() =>
                    side === 'in'
                      ? (active()?.inTime ?? active()?.time ?? 0)
                      : (active()?.outTime ?? active()?.time ?? 0)
                  }
                  min={
                    side === 'in'
                      ? keys()[Math.max(0, keys().findIndex((k: CurveKey) => k.id === selected()) - 1)].time
                      : (active()?.time ?? low)
                  }
                  max={
                    side === 'out'
                      ? keys()[Math.min(keys().length - 1, keys().findIndex((k: CurveKey) => k.id === selected()) + 1)]
                          .time
                      : (active()?.time ?? high)
                  }
                  step={0.01}
                  onChange={(v: number) => changeCurveHandle(p, selected(), side, true, v)}
                  disabled={p.disabled}
                />
                <NumberField
                  className="w-[170px] max-w-full"
                  label={side + ' handle value'}
                  value={() =>
                    side === 'in'
                      ? (active()?.inValue ?? active()?.value ?? 0)
                      : (active()?.outValue ?? active()?.value ?? 0)
                  }
                  min={bottom}
                  max={top}
                  step={0.01}
                  onChange={(v: number) => changeCurveHandle(p, selected(), side, false, v)}
                  disabled={p.disabled}
                />
              </View>
            ))}
          </Show>
        </Show>
        <Text className={`text-[11px] text-${theme().mutedForeground}`}>
          Insert/double click adds · [ ] select · arrows move
        </Text>
      </View>
    </View>
  );
  ownGesture(root.node, gesture);
  componentEffect(() => {
    p.keys();
    theme();
    ui.repaint();
    return undefined;
  });
  return node;
}
function changeCurveHandle(p: CurveEditorProps, id: string, side: string, time: boolean, value: number): void {
  if (p.disabled === true) return;
  const key = p.keys().find((k: CurveKey) => k.id === id);
  if (key === undefined) return;
  const x = side === 'in' ? (key.inTime ?? key.time) : (key.outTime ?? key.time),
    y = side === 'in' ? (key.inValue ?? key.value) : (key.outValue ?? key.value);
  p.onChange(moveCurveHandle(p.keys(), id, side, time ? value : x, time ? y : value));
  ui.repaint();
}
export interface GradientEditorProps {
  stops: () => GradientStop[];
  onChange: (stops: GradientStop[]) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}
export function GradientEditor(p: GradientEditorProps): i32 {
  const [selected, setSelected] = componentSignal(p.stops().length > 0 ? p.stops()[0].id : ''),
    [rampWidth, setRampWidth] = componentSignal(300),
    serial = componentRef(0),
    ramp = createNodeRef(),
    gesture = componentRef(new PanelGesture()).current;
  const stops = componentMemo(() => orderedStops(p.stops()), [] as GradientStop[]),
    active = (): GradientStop | undefined => stops().find((s: GradientStop) => s.id === selected());
  const change = (position: number, color: string): void => {
    if (p.disabled !== true) {
      p.onChange(
        orderedStops(
          stops().map((s: GradientStop) =>
            s.id === selected() ? { id: s.id, position: toolClamp(position, 0, 1), color } : s,
          ),
        ),
      );
      ui.repaint();
    }
  };
  const add = (position: number): void => {
    if (p.disabled === true) return;
    serial.current = nextToolSerial(
      'stop-',
      serial.current,
      stops().map((stop: GradientStop) => stop.id),
    );
    const id = 'stop-' + String(serial.current);
    p.onChange(
      orderedStops(
        stops().concat([{ id, position: toolClamp(position, 0, 1), color: sampleGradient(stops(), position) }]),
      ),
    );
    setSelected(id);
    ui.repaint();
  };
  const remove = (): void => {
    if (p.disabled !== true && stops().length > 2) {
      p.onChange(stops().filter((s: GradientStop) => s.id !== selected()));
      setSelected(p.stops()[0].id);
      ui.repaint();
    }
  };
  const node = (
    <View className={`flex-col gap-3 min-w-0 ${p.className ?? ''}`}>
      <View
        ref={ramp}
        role="group"
        aria-label={p.label ?? 'Gradient editor'}
        className={`relative h-[60px] ${surfaceClass()}`}
        onDoubleClick={(e: ui.PointerEvent) => add(e.x / Math.max(1, rampWidth() - 16))}
      >
        <Canvas
          style={{ lazy: 1 }}
          className="absolute inset-0 pointer-events-none"
          onDraw={(x: i32, y: i32, w: i32, h: i32) => {
            if (w !== rampWidth()) setRampWidth(w);
            for (let column = 0; column < w; column += 4) {
              const color = sampleGradient(stops(), column / Math.max(1, w - 1)),
                alpha = parseInt(color.slice(7, 9), 16),
                rgb = parseInt(color.slice(1, 7), 16);
              for (let row = 0; row < h; row += 8)
                rrect(
                  x + column,
                  y + row,
                  Math.min(4, w - column),
                  8,
                  0,
                  themeColor((Math.floor(column / 8) + row / 8) % 2 === 0 ? 'card' : 'muted') as u32,
                  255,
                );
              rrect(x + column, y, Math.min(4, w - column), h, 0, rgb as u32, alpha as u8);
            }
          }}
        />
        {stops().map((stop: GradientStop) => (
          <Button
            role="slider"
            aria-label={'Gradient stop ' + stop.id}
            aria-valuenow={String(stop.position)}
            aria-valuemin="0"
            aria-valuemax="1"
            disabled={p.disabled === true}
            style={{ left: stop.position * (rampWidth() - 16) }}
            className={`absolute top-[34px] w-4 h-6 rounded border border-${stop.id === selected() ? theme().accent : theme().input} bg-${theme().card} ${focusClass()}`}
            grab="keep"
            onClick={() => setSelected(stop.id)}
            onPointerDown={(e: ui.PointerEvent) => {
              setSelected(stop.id);
              gesture.transition(GesturePhase.Pressed);
              gesture.originX = e.gx;
              gesture.x = stop.position;
            }}
            onPointerMove={(e: ui.PointerEvent) => {
              if (gesture.phase !== GesturePhase.Idle && gesture.phase !== GesturePhase.Disposed) {
                gesture.transition(GesturePhase.Dragging);
                change(
                  gesture.x + (e.gx - gesture.originX) / Math.max(1, rampWidth() - 16),
                  active()?.color ?? stop.color,
                );
              }
            }}
            onPointerUp={(e: ui.PointerEvent) => gesture.transition(GesturePhase.Idle)}
            onPointerCancel={(e: ui.PointerEvent) => gesture.transition(GesturePhase.Idle)}
            onKeyDown={(e: ui.KeyEvent) => {
              setSelected(stop.id);
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
                change(stop.position + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shift ? 0.001 : 0.01), stop.color);
              else if (e.key === 'Home' || e.key === 'End') change(e.key === 'Home' ? 0 : 1, stop.color);
              else if (e.key === 'Delete') remove();
              else return;
              e.preventDefault();
            }}
          />
        ))}
      </View>
      <View className="flex-row flex-wrap items-end gap-2">
        <KitButton label="Add stop" size="sm" variant="outline" disabled={p.disabled} onClick={() => add(0.5)} />
        <KitButton
          label="Remove stop"
          size="sm"
          variant="ghost"
          disabled={p.disabled === true || stops().length <= 2}
          onClick={remove}
        />
        <Show when={active() !== undefined}>
          <NumberField
            className="w-[170px] max-w-full"
            label="Stop position"
            min={0}
            max={1}
            step={0.01}
            value={() => active()?.position ?? 0}
            onChange={(v: number) => change(v, active()?.color ?? '#000000ff')}
            disabled={p.disabled}
          />
          <ColorPicker
            label="Stop color"
            alpha={true}
            value={() => active()?.color ?? '#000000ff'}
            onChange={(v: string) => change(active()?.position ?? 0, v)}
            disabled={p.disabled}
          />
        </Show>
      </View>
    </View>
  );
  ownGesture(ramp.node, gesture);
  componentEffect(() => {
    p.stops();
    theme();
    ui.repaint();
    return undefined;
  });
  return node;
}
export interface HexRange {
  offset: number;
  length: number;
  label: string;
}
export interface HexViewerProps {
  bytes: () => number[];
  onChange?: (bytes: number[]) => void;
  label?: string;
  base?: number;
  ranges?: HexRange[];
  columns?: number;
  height?: number;
  className?: string;
}
export function HexViewer(p: HexViewerProps): i32 {
  const state = componentRef(new HexSelection()).current,
    gesture = componentRef(new PanelGesture()).current;
  const [revision, setRevision] = componentSignal(0),
    [width, setWidth] = componentSignal(600),
    [go, setGo] = componentSignal('0'),
    [hover, setHover] = componentSignal(-1);
  const root = createNodeRef(),
    viewport = createNodeRef();
  const addressDigits = (): number =>
    Math.max(8, Math.floor(Math.max(0, p.base ?? 0) + p.bytes().length).toString(16).length);
  const addressWidth = (): number => addressDigits() * 7,
    cellWidth = (): number => (width() < 240 ? 20 : 24),
    gap = (): number => (width() < 240 ? 2 : 4),
    step = (): number => cellWidth() + gap();
  const columns = (): number => {
    const desired = p.columns ?? 16;
    for (const count of [32, 16, 8, 4])
      if (count <= desired && count * step() <= width() - addressWidth() - 24) return count;
    return 4;
  };
  const ascii = (): boolean => columns() * (step() + 7) + addressWidth() + 32 <= width();
  const indices = componentMemo(() => {
    const values: number[] = [];
    for (let i = 0; i < columns(); i++) values.push(i);
    return values;
  }, [] as number[]);
  const selected = (index: number): boolean => {
    revision();
    return index >= Math.min(state.cursor, state.anchor) && index <= Math.max(state.cursor, state.anchor);
  };
  const range = (index: number): HexRange | undefined => {
    if (p.ranges === undefined) return undefined;
    for (let i = p.ranges.length - 1; i >= 0; i--)
      if (index >= p.ranges[i].offset && index < p.ranges[i].offset + p.ranges[i].length) return p.ranges[i];
    return undefined;
  };
  const background = (index: number): string =>
    selected(index) || hover() === index
      ? theme().accentSoft
      : range(index) !== undefined
        ? theme().muted
        : 'transparent';
  const refresh = (): void => {
    setRevision(revision() + 1);
    ui.scrollToRow(viewport.node, Math.floor(state.cursor / columns()));
  };
  const move = (position: number, extend: boolean): void => {
    state.move(position, p.bytes().length, extend);
    refresh();
  };
  const begin = (index: number, e: ui.PointerEvent): void => {
    if (e.button !== 0) return;
    move(index, e.shift);
    gesture.transition(GesturePhase.Pressed);
    ui.focusNode(root.node);
  };
  const drag = (e: ui.PointerEvent): void => {
    if (gesture.phase !== GesturePhase.Pressed && gesture.phase !== GesturePhase.Dragging) return;
    const box = ui.screenBox(viewport.node),
      x = e.gx - box[0] - 8 - addressWidth() - 8,
      y = e.gy - box[1] + ui.scrollTop(viewport.node);
    if (e.gy < box[1] || e.gy >= box[1] + box[3] || x < 0) return;
    const column =
      x >= columns() * step() + 8 && ascii() ? Math.floor((x - columns() * step() - 8) / 7) : Math.floor(x / step());
    if (column < 0 || column >= columns()) return;
    gesture.transition(GesturePhase.Dragging);
    move(Math.floor(y / 26) * columns() + column, true);
  };
  const byteCell = (byte: number, index: number, character: boolean): i32 => (
    <Tooltip label={(range(index)?.label ?? 'Byte') + ' · 0x' + ((p.base ?? 0) + index).toString(16)}>
      <Button
        tabIndex={-1}
        role="gridcell"
        aria-label={(character ? 'ASCII byte ' : 'Byte ') + String(index)}
        aria-selected={String(selected(index))}
        className={`h-6 items-center justify-center rounded bg-${background(index)} ${index === state.cursor ? 'border border-' + theme().accent : ''}`}
        style={{ width: character ? 7 : cellWidth() }}
        grab="keep"
        onClick={() => ui.focusNode(root.node)}
        onPointerDown={(e: ui.PointerEvent) => begin(index, e)}
        onPointerMove={drag}
        onPointerUp={(e: ui.PointerEvent) => gesture.transition(GesturePhase.Idle)}
        onPointerCancel={(e: ui.PointerEvent) => gesture.transition(GesturePhase.Idle)}
        onPointerEnter={(e: ui.PointerEvent) => setHover(index)}
        onPointerLeave={(e: ui.PointerEvent) => setHover(-1)}
      >
        <Text
          className={`font-mono text-[12px] text-${byte === 0 || (character && (byte < 32 || byte > 126)) ? theme().mutedForeground : theme().foreground}`}
        >
          {character
            ? byte >= 32 && byte < 127
              ? String.fromCharCode(byte)
              : '.'
            : Math.floor(toolClamp(byte, 0, 255))
                .toString(16)
                .padStart(2, '0')}
        </Text>
      </Button>
    </Tooltip>
  );
  const node = (
    <View
      ref={root}
      tabIndex={0}
      role="grid"
      aria-label={p.label ?? 'Hex viewer'}
      className={`relative flex-col ${surfaceClass()} ${focusClass()} ${p.className ?? ''}`}
      onKeyDown={(e: ui.KeyEvent) => {
        const focused = ui.inspectNode(ui.focused());
        if (ui.focused() !== root.node && (focused === null || focused.role !== 'gridcell')) return;
        if (e.primary && e.key === 'c') {
          setClipboardText(state.copy(p.bytes(), e.shift));
          e.preventDefault();
          return;
        }
        if (e.primary && e.key === 'a') {
          state.anchor = 0;
          state.cursor = Math.max(0, p.bytes().length - 1);
          refresh();
          e.preventDefault();
          return;
        }
        const page = Math.max(1, Math.floor((p.height ?? 220) / 26)) * columns(),
          delta =
            e.key === 'ArrowRight'
              ? 1
              : e.key === 'ArrowLeft'
                ? -1
                : e.key === 'ArrowDown'
                  ? columns()
                  : e.key === 'ArrowUp'
                    ? -columns()
                    : e.key === 'PageDown'
                      ? page
                      : e.key === 'PageUp'
                        ? -page
                        : 0;
        if (delta !== 0) move(state.cursor + delta, e.shift);
        else if (e.key === 'Home' || e.key === 'End')
          move(
            e.primary
              ? e.key === 'Home'
                ? 0
                : p.bytes().length - 1
              : Math.floor(state.cursor / columns()) * columns() + (e.key === 'Home' ? 0 : columns() - 1),
            e.shift,
          );
        else if (e.key === 'Escape') {
          state.transition(NibblePhase.High);
          state.anchor = state.cursor;
          refresh();
        } else if (
          p.onChange !== undefined &&
          e.key.length === 1 &&
          '0123456789abcdef'.includes(e.key.toLowerCase()) &&
          !e.primary &&
          !e.alt
        ) {
          p.onChange(state.edit(p.bytes(), e.key));
          refresh();
        } else return;
        e.preventDefault();
      }}
    >
      <Canvas
        className="absolute inset-0 pointer-events-none"
        style={{ lazy: 1 }}
        onDraw={(x: i32, y: i32, w: i32, h: i32) => {
          if (w !== width()) setWidth(w);
        }}
      />
      <View className="flex-row flex-wrap gap-2 p-2 items-end">
        <TextField
          className="w-[180px] max-w-full"
          label="Go to byte (hex)"
          value={go}
          onInput={setGo}
          onSubmit={() => move(parseInt(go(), 16), false)}
        />
        <KitButton label="Go to byte" size="sm" onClick={() => move(parseInt(go(), 16), false)} />
        <KitButton
          label="Copy hex"
          size="sm"
          variant="ghost"
          onClick={() => setClipboardText(state.copy(p.bytes(), false))}
        />
        <KitButton
          label="Copy ASCII"
          size="sm"
          variant="ghost"
          onClick={() => setClipboardText(state.copy(p.bytes(), true))}
        />
      </View>
      <View className="flex-row items-center gap-2 px-2 h-6">
        <Text className={`font-mono text-[11px] text-${theme().mutedForeground}`} style={{ width: addressWidth() }}>
          Address
        </Text>
        <View className="flex-row" style={{ gap: gap() }}>
          {indices().map((index: number) => (
            <Text
              style={{ width: cellWidth() }}
              className={`text-center font-mono text-[11px] text-${hover() >= 0 && hover() % columns() === index ? theme().foreground : theme().mutedForeground}`}
            >
              {index.toString(16).padStart(2, '0')}
            </Text>
          ))}
        </View>
        <Show when={ascii()}>
          <Text className={`text-[11px] text-${theme().mutedForeground}`}>ASCII</Text>
        </Show>
      </View>
      <ScrollView ref={viewport} className={`h-[${p.height ?? 220}px]`} />
      <Text className={`px-2 text-[11px] text-${theme().mutedForeground}`}>
        {String(p.bytes().length) +
          ' bytes · ' +
          (p.onChange === undefined
            ? 'read only'
            : revision() >= 0 && state.phase === NibblePhase.Low
              ? 'low nibble'
              : 'high nibble')}
      </Text>
    </View>
  );
  virtualRows(
    viewport.node,
    () => Math.ceil(p.bytes().length / columns()),
    26,
    (row: i32) => (
      <View role="row" className="flex-row items-center gap-2 h-[26px] px-2">
        <Text style={{ width: addressWidth() }} className={`font-mono text-[11px] text-${theme().mutedForeground}`}>
          {(Math.max(0, p.base ?? 0) + row * columns()).toString(16).padStart(addressDigits(), '0')}
        </Text>
        <View className="flex-row" style={{ gap: gap() }}>
          {p
            .bytes()
            .slice(row * columns(), (row + 1) * columns())
            .map((byte: number, col: i32) => renderSlot(() => byteCell(byte, row * columns() + col, false)))}
        </View>
        <Show when={ascii()}>
          <View className="flex-row">
            {p
              .bytes()
              .slice(row * columns(), (row + 1) * columns())
              .map((byte: number, col: i32) => renderSlot(() => byteCell(byte, row * columns() + col, true)))}
          </View>
        </Show>
      </View>
    ),
  );
  ownGesture(root.node, gesture);
  componentEffect(() => {
    const reset = (): void => state.transition(NibblePhase.High),
      remove = ui.onFocusWithin(root.node, (inside: boolean) => {
        if (!inside) reset();
      }),
      signal = (kind: string, arg: string): void => {
        if ((kind === 'focus' && arg === '0') || kind === 'background') reset();
      };
    ui.addSignalListener(signal);
    return () => {
      remove();
      ui.removeSignalListener(signal);
      reset();
    };
  }, []);
  componentEffect(() => {
    const length = p.bytes().length;
    if (state.cursor >= length || state.anchor >= length) {
      state.move(state.cursor, length, true);
      state.anchor = Math.floor(toolClamp(state.anchor, 0, Math.max(0, length - 1)));
    }
    return undefined;
  });
  return node;
}
export interface NodeEditorProps {
  nodes: () => ToolNode[];
  links: () => NodeLink[];
  onNodesChange: (nodes: ToolNode[]) => void;
  onLinksChange: (links: NodeLink[]) => void;
  validate?: (from: NodePin, to: NodePin) => boolean;
  label?: string;
  height?: number;
  minimap?: boolean;
  disabled?: boolean;
  className?: string;
}
enum NodePhase {
  Idle,
  Connecting,
  ConnectingDrag,
  ConnectionDone,
  Moving,
  PanArmed,
  Panning,
  Selecting,
}
class NodeSession {
  phase = NodePhase.Idle;
  initialSelection: string[] = [];
  pointerX = 0;
  pointerY = 0;
  sourceNode = '';
  sourcePin = '';
  moving: ToolNode[] = [];
  originX = 0;
  originY = 0;
  panX = 0;
  panY = 0;
  transition(next: NodePhase): void {
    const old = this.phase;
    if (next !== NodePhase.Idle && next !== old) {
      if (next === NodePhase.ConnectingDrag && old !== NodePhase.Connecting) return;
      if (next === NodePhase.ConnectionDone && old !== NodePhase.ConnectingDrag && old !== NodePhase.Idle) return;
      if (next === NodePhase.Panning && old !== NodePhase.Idle && old !== NodePhase.PanArmed) return;
      if (
        (next === NodePhase.Moving || next === NodePhase.PanArmed || next === NodePhase.Selecting) &&
        old !== NodePhase.Idle &&
        old !== NodePhase.ConnectionDone
      )
        return;
      if (
        next === NodePhase.Connecting &&
        old !== NodePhase.Idle &&
        old !== NodePhase.ConnectionDone &&
        old !== NodePhase.Connecting
      )
        return;
    }
    this.phase = next;
    if (next === NodePhase.Idle) {
      this.sourceNode = '';
      this.sourcePin = '';
      this.moving = [];
    }
  }
}
export function NodeEditor(p: NodeEditorProps): i32 {
  const state = componentRef(new NodeSession()).current,
    [zoom, setZoom] = componentSignal(1),
    [panX, setPanX] = componentSignal(20),
    [panY, setPanY] = componentSignal(20),
    [selected, setSelected] = componentSignal<string[]>([]),
    [selectedLink, setSelectedLink] = componentSignal(''),
    [message, setMessage] = componentSignal('Select an output, then an input of the same type.');
  const root = createNodeRef(),
    serial = componentRef(0),
    path = componentRef<number[]>([]);
  const bounds = componentMemo(() => {
    let left = 0,
      top = 0,
      right = 500,
      bottom = 300;
    for (const node of p.nodes()) {
      left = Math.min(left, node.x);
      top = Math.min(top, node.y);
      right = Math.max(right, node.x + (node.width ?? 180));
      bottom = Math.max(bottom, node.y + 160);
    }
    return [left, top, right, bottom];
  }, [0, 0, 500, 300]);
  const fit = (): void => {
    const box = ui.screenBox(root.node),
      extent = bounds(),
      scale = toolClamp(
        Math.min((box[2] - 40) / (extent[2] - extent[0]), (box[3] - 40) / (extent[3] - extent[1])),
        0.25,
        3,
      );
    setZoom(scale);
    setPanX(20 - extent[0] * scale);
    setPanY(20 - extent[1] * scale);
    ui.repaint();
  };
  const deleteSelection = (): void => {
    if (p.disabled === true) return;
    if (selectedLink() !== '') {
      p.onLinksChange(p.links().filter((link: NodeLink) => link.id !== selectedLink()));
      setSelectedLink('');
    } else {
      p.onLinksChange(
        p
          .links()
          .filter((link: NodeLink) => selected().indexOf(link.fromNode) < 0 && selected().indexOf(link.toNode) < 0),
      );
      p.onNodesChange(p.nodes().filter((node: ToolNode) => selected().indexOf(node.id) < 0));
      setSelected([]);
    }
    ui.repaint();
  };
  const cancel = (): void => {
    state.transition(NodePhase.Idle);
    setMessage('Connection cancelled');
  };
  const pin = (node: ToolNode, item: NodePin): void => {
    if (p.disabled === true) return;
    if (item.output) {
      state.sourceNode = node.id;
      state.sourcePin = item.id;
      state.transition(NodePhase.Connecting);
      setMessage('Connect ' + node.label + ' ' + item.label + ' to an input');
      return;
    }
    if (state.phase !== NodePhase.Connecting && state.phase !== NodePhase.ConnectingDrag) return;
    const source = p.nodes().find((n: ToolNode) => n.id === state.sourceNode),
      sourcePin = source === undefined ? undefined : source.pins.find((s: NodePin) => s.id === state.sourcePin);
    if (sourcePin === undefined || (p.validate !== undefined && !p.validate(sourcePin, item))) {
      setMessage('Connection refused');
      state.transition(NodePhase.Idle);
      return;
    }
    serial.current = nextToolSerial(
      'link-',
      serial.current,
      p.links().map((link: NodeLink) => link.id),
    );
    const links = connectNodes(
      p.nodes(),
      p.links(),
      state.sourceNode,
      state.sourcePin,
      node.id,
      item.id,
      'link-' + String(serial.current),
    );
    if (links !== p.links()) {
      p.onLinksChange(links);
      setMessage('Connected ' + item.label);
    } else setMessage('Incompatible pins');
    state.transition(NodePhase.Idle);
    ui.repaint();
  };
  const pinPoint = (node: ToolNode, id: string): number[] => {
    const index = node.pins.findIndex((s: NodePin) => s.id === id),
      item = index >= 0 ? node.pins[index] : null;
    return [
      panX() + (node.x + (item !== null && item.output ? (node.width ?? 180) : 0)) * zoom(),
      panY() + (node.y + 46 + index * 28) * zoom(),
    ];
  };
  const moveSelected = (dx: number, dy: number, initial: ToolNode[]): void => {
    if (p.disabled === true) return;
    p.onNodesChange(
      p.nodes().map((node: ToolNode) => {
        const old = initial.find((n: ToolNode) => n.id === node.id);
        return old === undefined
          ? node
          : {
              id: node.id,
              label: node.label,
              x: old.x + dx,
              y: old.y + dy,
              width: node.width,
              pins: node.pins,
              children: node.children,
            };
      }),
    );
    ui.repaint();
  };
  const node = (
    <View className={`flex-col gap-2 min-w-0 ${p.className ?? ''}`}>
      <View className="flex-row flex-wrap items-end gap-2">
        <NumberField
          className="w-[170px] max-w-full"
          label="Graph zoom"
          value={zoom}
          min={0.25}
          max={3}
          step={0.1}
          onChange={(v: number) => {
            setZoom(v);
            ui.repaint();
          }}
        />
        <KitButton
          label="Reset graph view"
          size="sm"
          variant="ghost"
          onClick={() => {
            setZoom(1);
            setPanX(20);
            setPanY(20);
            ui.repaint();
          }}
        />
        <KitButton label="Frame all nodes" size="sm" variant="ghost" onClick={fit} />
        <Select
          className="w-[190px] max-w-full"
          label="Connection"
          items={p.links().map((link: NodeLink) => ({ value: link.id, label: link.fromNode + ' → ' + link.toNode }))}
          value={selectedLink}
          onChange={(value: string) => {
            setSelectedLink(value);
            ui.repaint();
          }}
        />
        <KitButton
          label="Delete graph selection"
          size="sm"
          variant="ghost"
          disabled={p.disabled}
          onClick={deleteSelection}
        />
        <KitButton
          label="Disconnect selected nodes"
          size="sm"
          variant="ghost"
          disabled={p.disabled}
          onClick={() => {
            p.onLinksChange(
              p
                .links()
                .filter(
                  (link: NodeLink) => selected().indexOf(link.fromNode) < 0 && selected().indexOf(link.toNode) < 0,
                ),
            );
            ui.repaint();
          }}
        />
      </View>
      <View
        ref={root}
        tabIndex={0}
        role="application"
        aria-label={p.label ?? 'Node editor'}
        className={`relative h-[${p.height ?? 320}px] ${surfaceClass()} ${focusClass()}`}
        onKeyDown={(e: ui.KeyEvent) => {
          if (editingField()) return;
          if (e.key === 'Escape') cancel();
          else if (e.primary && e.key === 'a') setSelected(p.nodes().map((n: ToolNode) => n.id));
          else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection();
          else if (e.key === 'f') fit();
          else if (e.key === '0') {
            setZoom(1);
            ui.repaint();
          } else if (e.key === ' ') state.transition(NodePhase.PanArmed);
          else if (e.key === '+' || e.key === '=') setZoom(toolClamp(zoom() + 0.1, 0.25, 3));
          else if (e.key === '-') setZoom(toolClamp(zoom() - 0.1, 0.25, 3));
          else if (e.key.startsWith('Arrow')) {
            const step = e.shift ? 10 : 1,
              dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0,
              dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
            if (e.alt) {
              setPanX(panX() + dx * 10);
              setPanY(panY() + dy * 10);
            } else
              moveSelected(
                dx,
                dy,
                p.nodes().filter((n: ToolNode) => selected().indexOf(n.id) >= 0),
              );
          } else return;
          ui.repaint();
          e.preventDefault();
        }}
        onKeyUp={(e: ui.KeyEvent) => {
          if (e.key === ' ' && state.phase === NodePhase.PanArmed) state.transition(NodePhase.Idle);
        }}
      >
        <View
          className="absolute inset-0"
          grab="keep"
          onPointerDown={(e: ui.PointerEvent) => {
            const pan = e.button === 1 || state.phase === NodePhase.PanArmed;
            state.transition(NodePhase.Idle);
            state.transition(pan ? NodePhase.Panning : NodePhase.Selecting);
            state.originX = e.gx;
            state.originY = e.gy;
            state.pointerX = e.gx;
            state.pointerY = e.gy;
            state.initialSelection = e.shift || e.ctrl || e.meta ? selected() : [];
            state.panX = panX();
            state.panY = panY();
            if (!pan) {
              setSelectedLink('');
              setSelected(state.initialSelection);
            }
          }}
          onPointerMove={(e: ui.PointerEvent) => {
            if (state.phase === NodePhase.Panning) {
              setPanX(state.panX + e.gx - state.originX);
              setPanY(state.panY + e.gy - state.originY);
              ui.repaint();
            } else if (state.phase === NodePhase.Selecting) {
              state.pointerX = e.gx;
              state.pointerY = e.gy;
              const box = ui.screenBox(root.node),
                left = Math.min(state.originX, e.gx) - box[0],
                right = Math.max(state.originX, e.gx) - box[0],
                top = Math.min(state.originY, e.gy) - box[1],
                bottom = Math.max(state.originY, e.gy) - box[1];
              setSelected(
                state.initialSelection.concat(
                  p
                    .nodes()
                    .filter(
                      (node: ToolNode) =>
                        panX() + node.x * zoom() <= right &&
                        panX() + (node.x + (node.width ?? 180)) * zoom() >= left &&
                        panY() + node.y * zoom() <= bottom &&
                        panY() + (node.y + 80) * zoom() >= top,
                    )
                    .map((node: ToolNode) => node.id),
                ),
              );
              ui.repaint();
            }
          }}
          onPointerUp={(e: ui.PointerEvent) => state.transition(NodePhase.Idle)}
          onPointerCancel={(e: ui.PointerEvent) => state.transition(NodePhase.Idle)}
          onWheel={(e: ui.PointerEvent) => {
            if (e.ctrl || e.meta) setZoom(toolClamp(zoom() + e.wheel * 0.05, 0.25, 3));
            else {
              setPanX(panX() + e.wheelX * 20);
              setPanY(panY() + e.wheel * 20);
            }
            ui.repaint();
          }}
        />
        <Canvas
          className="absolute inset-0 pointer-events-none"
          style={{ lazy: 1 }}
          onDraw={(x: i32, y: i32, w: i32, h: i32) => {
            const accent = themeColor('accent'),
              border = themeColor('input'),
              points = path.current;
            for (const link of p.links()) {
              const a = p.nodes().find((n: ToolNode) => n.id === link.fromNode),
                b = p.nodes().find((n: ToolNode) => n.id === link.toNode);
              if (a === undefined || b === undefined) continue;
              const from = pinPoint(a, link.fromPin),
                to = pinPoint(b, link.toPin);
              if (
                Math.max(from[0], to[0]) < 0 ||
                Math.min(from[0], to[0]) > w ||
                Math.max(from[1], to[1]) < 0 ||
                Math.min(from[1], to[1]) > h
              )
                continue;
              points.length = 0;
              for (let i = 0; i <= 24; i++) {
                const t = i / 24,
                  u = 1 - t,
                  bend = Math.max(30, Math.abs(to[0] - from[0]) / 2);
                points.push(
                  x +
                    u * u * u * from[0] +
                    3 * u * u * t * (from[0] + bend) +
                    3 * u * t * t * (to[0] - bend) +
                    t * t * t * to[0],
                  y + (u * u * u + 3 * u * u * t) * from[1] + (3 * u * t * t + t * t * t) * to[1],
                );
              }
              stroke(
                points,
                2,
                (selectedLink() === link.id || selected().indexOf(a.id) >= 0 || selected().indexOf(b.id) >= 0
                  ? accent
                  : border) as u32,
                255,
                false,
              );
            }
            if (state.phase === NodePhase.ConnectingDrag) {
              const source = p.nodes().find((item: ToolNode) => item.id === state.sourceNode);
              if (source !== undefined) {
                const from = pinPoint(source, state.sourcePin),
                  box = ui.screenBox(root.node);
                points.length = 0;
                points.push(x + from[0], y + from[1], x + state.pointerX - box[0], y + state.pointerY - box[1]);
                stroke(points, 2, accent as u32, 255, false);
              }
            }
            if (state.phase === NodePhase.Selecting) {
              const box = ui.screenBox(root.node);
              rrect(
                x + Math.min(state.originX, state.pointerX) - box[0],
                y + Math.min(state.originY, state.pointerY) - box[1],
                Math.abs(state.pointerX - state.originX),
                Math.abs(state.pointerY - state.originY),
                0,
                accent as u32,
                30,
              );
            }
          }}
        />
        {p.nodes().map((item: ToolNode) => (
          <View
            role="group"
            aria-label={item.label}
            style={{
              left: panX() + item.x * zoom(),
              top: panY() + item.y * zoom(),
              width: item.width ?? 180,
              scale: zoom(),
            }}
            className={`absolute flex-col rounded-[10px] border border-${selected().indexOf(item.id) >= 0 ? theme().accent : theme().input} bg-${theme().card}`}
          >
            <Button
              aria-label={'Move ' + item.label}
              className={`h-8 px-2 items-start border-b border-${theme().border} ${focusClass()}`}
              grab="keep"
              onClick={() => {
                if (selected().indexOf(item.id) < 0) setSelected([item.id]);
              }}
              onPointerDown={(e: ui.PointerEvent) => {
                if (p.disabled === true) return;
                if (e.shift) {
                  if (selected().indexOf(item.id) < 0) setSelected(selected().concat([item.id]));
                } else if (selected().indexOf(item.id) < 0) setSelected([item.id]);
                state.moving = p.nodes().filter((n: ToolNode) => selected().indexOf(n.id) >= 0);
                state.originX = e.gx;
                state.originY = e.gy;
                state.transition(NodePhase.Moving);
              }}
              onPointerMove={(e: ui.PointerEvent) => {
                if (state.phase === NodePhase.Moving)
                  moveSelected((e.gx - state.originX) / zoom(), (e.gy - state.originY) / zoom(), state.moving);
              }}
              onPointerUp={(e: ui.PointerEvent) => state.transition(NodePhase.Idle)}
              onPointerCancel={(e: ui.PointerEvent) => state.transition(NodePhase.Idle)}
            >
              <Text className={textClass()}>{item.label}</Text>
            </Button>
            {item.pins.map((socket: NodePin) => (
              <Button
                aria-label={item.label + ' ' + socket.label + ' ' + (socket.output ? 'output' : 'input')}
                className={`flex-row h-7 px-2 gap-2 ${socket.output ? 'justify-end' : 'justify-start'} ${focusClass()}`}
                grab="keep"
                onClick={() => {
                  if (state.phase === NodePhase.ConnectionDone) state.transition(NodePhase.Idle);
                  else pin(item, socket);
                }}
                onPointerDown={(e: ui.PointerEvent) => {
                  if (socket.output) {
                    pin(item, socket);
                    state.originX = e.gx;
                    state.originY = e.gy;
                    state.pointerX = e.gx;
                    state.pointerY = e.gy;
                  }
                }}
                onPointerMove={(e: ui.PointerEvent) => {
                  state.pointerX = e.gx;
                  state.pointerY = e.gy;
                  ui.repaint();
                  if (
                    socket.output &&
                    state.phase === NodePhase.Connecting &&
                    Math.abs(e.gx - state.originX) + Math.abs(e.gy - state.originY) > 4
                  )
                    state.transition(NodePhase.ConnectingDrag);
                }}
                onPointerUp={(e: ui.PointerEvent) => {
                  if (socket.output && state.phase === NodePhase.ConnectingDrag) {
                    const box = ui.screenBox(root.node);
                    for (const target of p.nodes())
                      for (const input of target.pins) {
                        if (input.output) continue;
                        const point = pinPoint(target, input.id);
                        if (
                          Math.abs(e.gx - box[0] - point[0]) < 20 * zoom() &&
                          Math.abs(e.gy - box[1] - point[1]) < 14 * zoom()
                        )
                          pin(target, input);
                      }
                    state.transition(NodePhase.ConnectionDone);
                  } else if (!socket.output && state.phase === NodePhase.Connecting) pin(item, socket);
                }}
                onPointerCancel={(e: ui.PointerEvent) => state.transition(NodePhase.Idle)}
              >
                <View className={`w-2 h-2 rounded-full border border-${theme().accent}`} />
                <Text className={`text-[12px] text-${theme().foreground}`}>{socket.label}</Text>
              </Button>
            ))}
            <View className="p-2">{renderSlot(item.children)}</View>
          </View>
        ))}
        <Show when={p.minimap !== false}>
          <Button
            aria-label="Graph minimap"
            className={`absolute right-2 bottom-2 w-[120px] h-[76px] overflow-hidden border border-${theme().input} bg-${theme().card} ${focusClass()}`}
            onPointerDown={(e: ui.PointerEvent) => {
              const extent = bounds(),
                scale = Math.min(120 / (extent[2] - extent[0]), 76 / (extent[3] - extent[1])),
                box = ui.screenBox(root.node);
              setPanX(box[2] / 2 - (extent[0] + e.x / scale) * zoom());
              setPanY(box[3] / 2 - (extent[1] + e.y / scale) * zoom());
              ui.repaint();
            }}
            onKeyDown={(e: ui.KeyEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                fit();
                e.preventDefault();
              } else if (e.key.startsWith('Arrow')) {
                const amount = e.shift ? 1 : 10;
                setPanX(panX() + (e.key === 'ArrowLeft' ? amount : e.key === 'ArrowRight' ? -amount : 0));
                setPanY(panY() + (e.key === 'ArrowUp' ? amount : e.key === 'ArrowDown' ? -amount : 0));
                ui.repaint();
                e.preventDefault();
              }
            }}
          >
            <Canvas
              className="absolute inset-0 pointer-events-none"
              style={{ lazy: 1 }}
              onDraw={(x: i32, y: i32, w: i32, h: i32) => {
                const extent = bounds(),
                  scale = Math.min(w / (extent[2] - extent[0]), h / (extent[3] - extent[1])),
                  accent = themeColor('accent'),
                  ordinary = themeColor('input');
                for (const item of p.nodes())
                  rrect(
                    x + (item.x - extent[0]) * scale,
                    y + (item.y - extent[1]) * scale,
                    (item.width ?? 180) * scale,
                    80 * scale,
                    2,
                    (selected().indexOf(item.id) >= 0 ? accent : ordinary) as u32,
                    255,
                  );
                const box = ui.screenBox(root.node),
                  left = x + (-panX() / zoom() - extent[0]) * scale,
                  top = y + (-panY() / zoom() - extent[1]) * scale,
                  right = left + (box[2] / zoom()) * scale,
                  bottom = top + (box[3] / zoom()) * scale,
                  points = path.current;
                points.length = 0;
                points.push(left, top, right, top, right, bottom, left, bottom, left, top);
                stroke(points, 1, accent as u32, 255, false);
              }}
            />
          </Button>
        </Show>
      </View>
      <Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>
        {message()}
      </Text>
    </View>
  );
  componentEffect(() => {
    const blur = (kind: string, arg: string): void => {
      if ((kind === 'focus' && arg === '0') || kind === 'background') state.transition(NodePhase.Idle);
    };
    const remove = ui.onFocusWithin(root.node, (inside: boolean) => {
      if (!ui.hasFocusWithin(root.node)) state.transition(NodePhase.Idle);
    });
    ui.addSignalListener(blur);
    return () => {
      remove();
      ui.removeSignalListener(blur);
      state.transition(NodePhase.Idle);
    };
  }, []);
  componentEffect(() => {
    p.nodes();
    p.links();
    zoom();
    panX();
    panY();
    theme();
    ui.repaint();
    return undefined;
  });
  return node;
}
export interface FlameGraphProps {
  spans: () => FlameSpan[];
  label?: string;
  height?: number;
  start?: number;
  end?: number;
  className?: string;
}
export function FlameGraph(p: FlameGraphProps): i32 {
  const index = componentMemo(() => new FlameIndex(p.spans()), new FlameIndex([])),
    [start, setStart] = componentSignal(p.start ?? 0),
    [end, setEnd] = componentSignal(p.end ?? 100),
    [depth, setDepth] = componentSignal(0),
    [selected, setSelected] = componentSignal(''),
    [plotWidth, setPlotWidth] = componentSignal(600);
  const root = createNodeRef(),
    gesture = componentRef(new PanelGesture()).current,
    labelFont = componentRef(font('sans', 11)).current,
    height = p.height ?? 220;
  const visible = componentMemo(
    () =>
      index().visible(
        start(),
        end(),
        plotWidth() / Math.max(0.000001, end() - start()),
        depth(),
        depth() + Math.ceil(height / 24),
      ),
    [] as FlameSpan[],
  );
  const active = (): FlameSpan | undefined => p.spans().find((span: FlameSpan) => span.id === selected());
  const zoom = (factor: number, centre: number): void => {
    const duration = Math.max(0.000001, (end() - start()) * factor),
      position = start() + (end() - start()) * centre;
    setStart(position - duration * centre);
    setEnd(position + duration * (1 - centre));
    ui.repaint();
  };
  const hit = (e: ui.PointerEvent): void => {
    const box = ui.screenBox(root.node),
      time = start() + (e.x / Math.max(1, box[2])) * (end() - start()),
      row = Math.floor(e.y / 24) + depth(),
      span = index().hit(time, row);
    if (span !== undefined) setSelected(span.id);
  };
  const node = (
    <View className={`flex-col gap-2 min-w-0 ${p.className ?? ''}`}>
      <View className="flex-row flex-wrap gap-2">
        <KitButton label="Zoom flame in" size="sm" variant="outline" onClick={() => zoom(0.5, 0.5)} />
        <KitButton label="Zoom flame out" size="sm" variant="outline" onClick={() => zoom(2, 0.5)} />
        <KitButton
          label="Frame selected span"
          size="sm"
          variant="ghost"
          onClick={() => {
            const span = active();
            if (span !== undefined && span.duration > 0) {
              setStart(span.start);
              setEnd(span.start + span.duration);
              ui.repaint();
            }
          }}
        />
      </View>
      <View
        ref={root}
        tabIndex={0}
        role="application"
        aria-label={p.label ?? 'Flame graph'}
        className={`relative h-[${height}px] ${surfaceClass()} ${focusClass()}`}
        grab="keep"
        onPointerMove={(e: ui.PointerEvent) => {
          hit(e);
          if (gesture.phase === GesturePhase.Pressed || gesture.phase === GesturePhase.Dragging) {
            gesture.transition(GesturePhase.Dragging);
            const delta =
              ((e.gx - gesture.originX) / Math.max(1, ui.screenBox(root.node)[2])) * (gesture.y - gesture.x);
            setStart(gesture.x - delta);
            setEnd(gesture.y - delta);
            ui.repaint();
          }
        }}
        onPointerDown={(e: ui.PointerEvent) => {
          hit(e);
          gesture.originX = e.gx;
          gesture.x = start();
          gesture.y = end();
          gesture.transition(GesturePhase.Pressed);
        }}
        onPointerUp={(e: ui.PointerEvent) => gesture.transition(GesturePhase.Idle)}
        onPointerCancel={(e: ui.PointerEvent) => gesture.transition(GesturePhase.Idle)}
        onDoubleClick={(e: ui.PointerEvent) => {
          const span = active();
          if (span !== undefined && span.duration > 0) {
            setStart(span.start);
            setEnd(span.start + span.duration);
            ui.repaint();
          }
        }}
        onWheel={(e: ui.PointerEvent) => {
          if (e.ctrl || e.meta) zoom(e.wheel > 0 ? 0.8 : 1.25, e.x / Math.max(1, ui.screenBox(root.node)[2]));
          else
            setDepth(
              Math.floor(toolClamp(depth() - e.wheel, 0, Math.max(0, index().levels.length - Math.floor(height / 24)))),
            );
          ui.repaint();
        }}
        onKeyDown={(e: ui.KeyEvent) => {
          if (e.key === '+' || e.key === '=') zoom(0.5, 0.5);
          else if (e.key === '-') zoom(2, 0.5);
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const delta = (end() - start()) * (e.key === 'ArrowLeft' ? -0.1 : 0.1);
            setStart(start() + delta);
            setEnd(end() + delta);
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown')
            setDepth(
              Math.floor(
                toolClamp(depth() + (e.key === 'ArrowUp' ? -1 : 1), 0, Math.max(0, index().levels.length - 1)),
              ),
            );
          else if (e.key === 'Home') {
            setStart(p.start ?? 0);
            setEnd(p.end ?? 100);
            setDepth(0);
          } else if (e.key === '[' || e.key === ']' || e.key === 'Enter') {
            const spans = index().visible(
                start(),
                end(),
                ui.screenBox(root.node)[2] / Math.max(0.000001, end() - start()),
                depth(),
                depth() + Math.ceil(height / 24),
              ),
              at = spans.findIndex((span: FlameSpan) => span.id === selected());
            if (spans.length > 0)
              setSelected(spans[Math.floor(toolClamp(at + (e.key === '[' ? -1 : 1), 0, spans.length - 1))].id);
          } else return;
          ui.repaint();
          e.preventDefault();
        }}
      >
        <Canvas
          className="absolute inset-0 pointer-events-none"
          style={{ lazy: 1 }}
          onDraw={(x: i32, y: i32, w: i32, h: i32) => {
            if (w !== plotWidth()) setPlotWidth(w);
            const scale = w / Math.max(0.000001, end() - start()),
              spans = visible(),
              fill = themeColor('muted'),
              selectedColor = themeColor('accentSoft'),
              text = themeColor('foreground');
            for (const span of spans) {
              const left = Math.max(0, (span.start - start()) * scale),
                right = Math.min(w, (span.start + span.duration - start()) * scale),
                row = (span.depth - depth()) * 24;
              if (right <= left) continue;
              rrect(
                x + left,
                y + row + 1,
                right - left - 1,
                22,
                3,
                (span.id === selected() ? selectedColor : fill) as u32,
                255,
              );
              if (right - left > 28)
                drawText(
                  labelFont,
                  x + left + 4,
                  y + row + 4,
                  span.label.slice(0, Math.floor((right - left - 8) / 7)),
                  text as u32,
                  255,
                  0,
                );
            }
          }}
        />
      </View>
      <Text role="status" className={`text-[12px] tabular-nums text-${theme().mutedForeground}`}>
        {active() === undefined
          ? String(start().toFixed(2)) + ' – ' + String(end().toFixed(2))
          : (active()?.label ?? '') +
            ' · ' +
            String((active()?.duration ?? 0).toFixed(3)) +
            ' ms · ' +
            String(
              (((active()?.duration ?? 0) / Math.max(0.000001, (p.end ?? 100) - (p.start ?? 0))) * 100).toFixed(1),
            ) +
            '% of recording'}
      </Text>
    </View>
  );
  ownGesture(root.node, gesture);
  componentEffect(() => {
    p.spans();
    start();
    end();
    depth();
    selected();
    theme();
    ui.repaint();
    return undefined;
  });
  return node;
}
export interface TimelineEditorProps {
  tracks: () => TimelineTrack[];
  onChange: (tracks: TimelineTrack[]) => void;
  playhead: () => number;
  onPlayheadChange: (time: number) => void;
  onPlayRequest?: () => void;
  playing?: () => boolean;
  label?: string;
  duration: number;
  snap?: number;
  height?: number;
  disabled?: boolean;
  className?: string;
}
interface TimelineSelection {
  track: string;
  key: string;
  clip: string;
}
export function TimelineEditor(p: TimelineEditorProps): i32 {
  const [selected, setSelected] = componentSignal<TimelineSelection>({ track: '', key: '', clip: '' }),
    [start, setStart] = componentSignal(0),
    [end, setEnd] = componentSignal(p.duration),
    [width, setWidth] = componentSignal(600);
  const viewport = createNodeRef(),
    root = createNodeRef(),
    gesture = componentRef(new PanelGesture()).current,
    serial = componentRef(0);
  const track = (): TimelineTrack | undefined => p.tracks().find((item: TimelineTrack) => item.id === selected().track);
  const key = (): CurveKey | undefined => track()?.keys.find((item: CurveKey) => item.id === selected().key);
  const clip = (): TimelineClip | undefined => track()?.clips.find((item: TimelineClip) => item.id === selected().clip);
  const timeAt = (x: number): number =>
    toolClamp(snapTime(start() + (x / Math.max(1, width() - 140)) * (end() - start()), p.snap ?? 0), 0, p.duration);
  const updateTrack = (next: TimelineTrack): void => {
    if (p.disabled !== true && next.locked !== true) {
      p.onChange(p.tracks().map((item: TimelineTrack) => (item.id === next.id ? next : item)));
      ui.repaint();
    }
  };
  const updateKey = (time: number, value: number): void => {
    const item = track();
    if (item !== undefined)
      updateTrack({
        id: item.id,
        label: item.label,
        keys: moveCurveKey(item.keys, selected().key, time, value, 0, p.duration, p.snap ?? 0),
        clips: item.clips,
        locked: item.locked,
      });
  };
  const updateClip = (part: string, time: number): void => {
    const item = track(),
      value = clip();
    if (item === undefined || value === undefined) return;
    updateTrack({
      id: item.id,
      label: item.label,
      keys: item.keys,
      clips: editTimelineClip(item.clips, value.id, part, snapTime(time, p.snap ?? 0), p.duration),
      locked: item.locked,
    });
  };
  const remove = (): void => {
    const item = track();
    if (item !== undefined)
      updateTrack({
        id: item.id,
        label: item.label,
        keys: item.keys.filter((k: CurveKey) => k.id !== selected().key),
        clips: item.clips.filter((c: TimelineClip) => c.id !== selected().clip),
        locked: item.locked,
      });
    setSelected({ track: selected().track, key: '', clip: '' });
  };
  const zoom = (factor: number): void => {
    const span = toolClamp((end() - start()) * factor, Math.min(0.1, p.duration), p.duration),
      from = toolClamp(p.playhead() - span / 2, 0, Math.max(0, p.duration - span));
    setStart(from);
    setEnd(from + span);
    ui.repaint();
  };
  const node = (
    <View
      ref={root}
      role="application"
      aria-label={p.label ?? 'Timeline editor'}
      className={`relative flex-col gap-2 min-w-0 ${p.className ?? ''}`}
      onKeyDown={(e: ui.KeyEvent) => {
        if (editingField()) return;
        if (e.key === 'Escape') {
          gesture.transition(GesturePhase.Idle);
          setSelected({ track: '', key: '', clip: '' });
        } else if (e.key === 'Delete' || e.key === 'Backspace') remove();
        else if (e.key === '+' || e.key === '=') zoom(0.5);
        else if (e.key === '-') zoom(2);
        else if (e.key === ' ' && p.onPlayRequest !== undefined) p.onPlayRequest();
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const amount = (e.key === 'ArrowLeft' ? -1 : 1) * (p.snap ?? 0.1) * (e.shift ? 10 : 1),
            value = key(),
            region = clip();
          if (value !== undefined) updateKey(value.time + amount, value.value);
          else if (region !== undefined)
            updateClip(
              e.alt ? (e.shift ? 'start' : 'end') : 'move',
              (e.alt ? (e.shift ? region.start : region.end) : region.start) + amount,
            );
          else p.onPlayheadChange(toolClamp(p.playhead() + amount, 0, p.duration));
        } else if (e.key === 'Home' || e.key === 'End') p.onPlayheadChange(e.key === 'Home' ? 0 : p.duration);
        else return;
        ui.repaint();
        e.preventDefault();
      }}
    >
      <Canvas
        className="absolute inset-0 pointer-events-none"
        style={{ lazy: 1 }}
        onDraw={(x: i32, y: i32, w: i32, h: i32) => {
          if (w !== width()) setWidth(w);
        }}
      />
      <View className="flex-row flex-wrap gap-2 items-end">
        <Show when={p.onPlayRequest !== undefined}>
          <KitButton
            label={p.playing !== undefined && p.playing() ? 'Pause timeline' : 'Play timeline'}
            size="sm"
            onClick={() => {
              if (p.onPlayRequest !== undefined) p.onPlayRequest();
            }}
          />
        </Show>
        <NumberField
          className="w-[170px] max-w-full"
          label="Playhead"
          min={0}
          max={p.duration}
          step={p.snap ?? 0.1}
          value={p.playhead}
          onChange={p.onPlayheadChange}
        />
        <KitButton label="Zoom timeline in" size="sm" variant="outline" onClick={() => zoom(0.5)} />
        <KitButton label="Zoom timeline out" size="sm" variant="outline" onClick={() => zoom(2)} />
        <NumberField
          className="w-[170px] max-w-full"
          label="Visible start"
          min={0}
          max={end() - 0.000001}
          value={start}
          step={p.snap ?? 0.1}
          onChange={setStart}
        />
      </View>
      <View className={`flex-col ${surfaceClass()}`}>
        <View className="flex-row h-8">
          <Text className={`w-[140px] shrink-0 px-2 py-2 text-[12px] text-${theme().mutedForeground}`}>Tracks</Text>
          <Button
            aria-label="Timeline ruler"
            className={`relative grow ${focusClass()}`}
            onPointerDown={(e: ui.PointerEvent) => {
              p.onPlayheadChange(timeAt(e.x));
              ui.repaint();
            }}
            onKeyDown={(e: ui.KeyEvent) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                p.onPlayheadChange(
                  toolClamp(p.playhead() + (e.key === 'ArrowLeft' ? -1 : 1) * (p.snap ?? 0.1), 0, p.duration),
                );
                e.preventDefault();
              }
            }}
          >
            <Canvas
              className="absolute inset-0 pointer-events-none"
              style={{ lazy: 1 }}
              onDraw={(x: i32, y: i32, w: i32, h: i32) => {
                const text = themeColor('mutedForeground'),
                  tick = themeColor('border'),
                  labelFont = font('sans', 11);
                for (let i = 0; i <= 10; i++) {
                  const px = (w * i) / 10;
                  rrect(x + px, y + 24, 1, 8, 0, tick as u32, 255);
                  if (i < 10)
                    drawText(
                      labelFont,
                      x + px + 3,
                      y + 3,
                      (start() + ((end() - start()) * i) / 10).toFixed(1),
                      text as u32,
                      255,
                      0,
                    );
                }
                if (p.playhead() >= start() && p.playhead() <= end())
                  rrect(
                    x + ((p.playhead() - start()) / (end() - start())) * w,
                    y,
                    2,
                    h,
                    0,
                    themeColor('accent') as u32,
                    255,
                  );
              }}
            />
          </Button>
        </View>
        <ScrollView ref={viewport} className={`h-[${p.height ?? 220}px]`} />
      </View>
      <View className="flex-row flex-wrap gap-2 items-end">
        <Show when={key() !== undefined}>
          <NumberField
            className="w-[170px] max-w-full"
            label="Timeline key time"
            value={() => key()?.time ?? 0}
            min={0}
            max={p.duration}
            step={p.snap ?? 0.1}
            onChange={(v: number) => updateKey(v, key()?.value ?? 0)}
            disabled={p.disabled === true || track()?.locked === true}
          />
          <NumberField
            className="w-[170px] max-w-full"
            label="Timeline key value"
            value={() => key()?.value ?? 0}
            step={0.01}
            onChange={(v: number) => updateKey(key()?.time ?? 0, v)}
            disabled={p.disabled === true || track()?.locked === true}
          />
        </Show>
        <Show when={clip() !== undefined}>
          <NumberField
            className="w-[170px] max-w-full"
            label="Clip in"
            value={() => clip()?.start ?? 0}
            min={0}
            max={p.duration}
            step={p.snap ?? 0.1}
            onChange={(v: number) => updateClip('start', v)}
            disabled={p.disabled === true || track()?.locked === true}
          />
          <NumberField
            className="w-[170px] max-w-full"
            label="Clip out"
            value={() => clip()?.end ?? 0}
            min={0}
            max={p.duration}
            step={p.snap ?? 0.1}
            onChange={(v: number) => updateClip('end', v)}
            disabled={p.disabled === true || track()?.locked === true}
          />
          <Text className={textClass()}>{'Media offset ' + String((clip()?.offset ?? 0).toFixed(2))}</Text>
        </Show>
        <Show when={selected().key !== '' || selected().clip !== ''}>
          <KitButton
            label="Remove timeline selection"
            size="sm"
            variant="ghost"
            disabled={p.disabled === true || track()?.locked === true}
            onClick={remove}
          />
        </Show>
      </View>
    </View>
  );
  virtualRows(
    viewport.node,
    () => p.tracks().length,
    54,
    (row: i32) => {
      const item = p.tracks()[row];
      return (
        <View className={`flex-row h-[54px] border-t border-${theme().border}`}>
          <Button
            aria-label={'Select track ' + item.label}
            className={`w-[140px] shrink-0 flex-col px-2 items-start ${focusClass()}`}
            onClick={() => setSelected({ track: item.id, key: '', clip: '' })}
          >
            <Text className={textClass()}>{item.label + (item.locked === true ? ' · locked' : '')}</Text>
            <Text className={`text-[11px] tabular-nums text-${theme().mutedForeground}`}>
              {evaluateCurve(orderedKeys(item.keys), p.playhead()).toFixed(3)}
            </Text>
          </Button>
          <View
            className="relative grow"
            onDoubleClick={(e: ui.PointerEvent) => {
              const time = timeAt(e.x);
              serial.current = nextToolSerial(
                'timeline-key-',
                serial.current,
                item.keys.map((key: CurveKey) => key.id),
              );
              updateTrack({
                id: item.id,
                label: item.label,
                keys: insertCurveKey(
                  item.keys,
                  'timeline-key-' + String(serial.current),
                  time,
                  evaluateCurve(orderedKeys(item.keys), time),
                  0,
                  p.duration,
                  p.snap ?? 0,
                ),
                clips: item.clips,
                locked: item.locked,
              });
            }}
          >
            <Canvas
              className="absolute inset-0 pointer-events-none"
              style={{ lazy: 1 }}
              onDraw={(x: i32, y: i32, w: i32, h: i32) => {
                if (p.playhead() >= start() && p.playhead() <= end())
                  rrect(
                    x + ((p.playhead() - start()) / (end() - start())) * w,
                    y,
                    1,
                    h,
                    0,
                    themeColor('accent') as u32,
                    255,
                  );
              }}
            />
            {item.clips
              .filter((c: TimelineClip) => c.end >= start() && c.start <= end())
              .map((c: TimelineClip) => (
                <View
                  className={`absolute top-1 h-[28px] flex-row rounded border border-${selected().clip === c.id ? theme().accent : theme().input} bg-${theme().muted}`}
                  style={{
                    left: Math.max(0, ((c.start - start()) / (end() - start())) * (width() - 140)),
                    width:
                      ((Math.min(c.end, end()) - Math.max(c.start, start())) / (end() - start())) * (width() - 140),
                  }}
                >
                  {['start', 'move', 'end'].map((part: string) => (
                    <Button
                      aria-label={item.label + ' ' + c.label + ' ' + part}
                      className={`${part === 'move' ? 'grow min-w-0' : 'w-3 shrink-0'} ${focusClass()}`}
                      grab="keep"
                      disabled={p.disabled === true || item.locked === true}
                      onClick={() => setSelected({ track: item.id, key: '', clip: c.id })}
                      onPointerDown={(e: ui.PointerEvent) => {
                        setSelected({ track: item.id, key: '', clip: c.id });
                        gesture.id = part;
                        gesture.x = part === 'end' ? c.end : c.start;
                        gesture.originX = e.gx;
                        gesture.transition(GesturePhase.Pressed);
                      }}
                      onPointerMove={(e: ui.PointerEvent) => {
                        if (gesture.phase === GesturePhase.Pressed || gesture.phase === GesturePhase.Dragging) {
                          gesture.transition(GesturePhase.Dragging);
                          updateClip(
                            part,
                            snapTime(
                              gesture.x + ((e.gx - gesture.originX) / Math.max(1, width() - 140)) * (end() - start()),
                              p.snap ?? 0,
                            ),
                          );
                        }
                      }}
                      onPointerUp={(e: ui.PointerEvent) => gesture.transition(GesturePhase.Idle)}
                      onPointerCancel={(e: ui.PointerEvent) => gesture.transition(GesturePhase.Idle)}
                    >
                      <Text className={`text-[11px] text-${theme().foreground}`}>
                        {part === 'move' ? c.label : '⋮'}
                      </Text>
                    </Button>
                  ))}
                </View>
              ))}
            {orderedKeys(item.keys)
              .filter((k: CurveKey) => k.time >= start() && k.time <= end())
              .map((k: CurveKey) => (
                <Button
                  aria-label={item.label + ' key ' + k.id}
                  className={`absolute top-[34px] w-3 h-3 rounded border border-${theme().accent} bg-${selected().key === k.id ? theme().accent : theme().card} ${focusClass()}`}
                  style={{ left: ((k.time - start()) / (end() - start())) * (width() - 140) - 6 }}
                  grab="keep"
                  disabled={p.disabled === true || item.locked === true}
                  onClick={() => setSelected({ track: item.id, key: k.id, clip: '' })}
                  onPointerDown={(e: ui.PointerEvent) => {
                    setSelected({ track: item.id, key: k.id, clip: '' });
                    gesture.x = k.time;
                    gesture.originX = e.gx;
                    gesture.transition(GesturePhase.Pressed);
                  }}
                  onPointerMove={(e: ui.PointerEvent) => {
                    if (gesture.phase === GesturePhase.Pressed || gesture.phase === GesturePhase.Dragging) {
                      gesture.transition(GesturePhase.Dragging);
                      updateKey(
                        gesture.x + ((e.gx - gesture.originX) / Math.max(1, width() - 140)) * (end() - start()),
                        k.value,
                      );
                    }
                  }}
                  onPointerUp={(e: ui.PointerEvent) => gesture.transition(GesturePhase.Idle)}
                  onPointerCancel={(e: ui.PointerEvent) => gesture.transition(GesturePhase.Idle)}
                />
              ))}
          </View>
        </View>
      );
    },
  );
  ownGesture(root.node, gesture);
  componentEffect(() => {
    p.tracks();
    p.playhead();
    start();
    end();
    width();
    theme();
    ui.repaint();
    return undefined;
  });
  return node;
}
export interface LevelMeterProps {
  peaks: () => number[];
  sampleId?: () => number;
  label?: string;
  minDb?: number;
  maxDb?: number;
  holdMs?: number;
  decayDb?: number;
  length?: number;
  channelWidth?: number;
  horizontal?: boolean;
  segmented?: boolean;
  scale?: boolean;
  className?: string;
}
export function LevelMeter(p: LevelMeterProps): i32 {
  const state = componentRef(new LevelState(p.minDb ?? -60, p.maxDb ?? 6, p.holdMs ?? 1500, p.decayDb ?? 20)).current,
    clock = componentRef(new MeterClock()).current,
    labelFont = componentRef(font('sans', 10)).current,
    root = createNodeRef(),
    [revision, setRevision] = componentSignal(0);
  const version = componentRef(0),
    previousSample = componentRef<number[]>([]),
    previousSampleId = componentRef(-Infinity);
  const changed = (): void => setRevision(++version.current);
  const cancel = (): void => {
    if (clock.phase === MeterClockPhase.Scheduled) {
      ui.cancelAlarm(clock.handle);
      clock.transition(MeterClockPhase.Idle);
    }
  };
  const schedule = (): void => {
    if (state.phase !== MeterPhase.Active || clock.phase !== MeterClockPhase.Idle) return;
    clock.transition(MeterClockPhase.Scheduled);
    const generation = clock.generation;
    clock.handle = ui.alarm(ui.now() + 33, () => {
      if (clock.phase !== MeterClockPhase.Scheduled || clock.generation !== generation) return;
      clock.transition(MeterClockPhase.Idle);
      if (state.phase === MeterPhase.Disposed) return;
      state.sample(
        state.peaks.map((value: number) => 0),
        ui.now(),
      );
      changed();
      ui.repaint();
      schedule();
    });
  };
  const length = Math.max(40, p.length ?? 160),
    channelWidth = Math.max(4, p.channelWidth ?? 6),
    count = (): number => Math.min(8, p.peaks().length),
    band = (): number => count() * (channelWidth + 6) + (p.scale === false ? 0 : 44);
  const node = (
    <View
      ref={root}
      role="meter"
      aria-label={p.label ?? 'Audio level meter'}
      aria-valuemin={String(state.floor)}
      aria-valuemax={String(state.ceiling)}
      aria-valuenow={String(revision() >= 0 && state.peaks.length > 0 ? Math.max(...state.peaks) : state.floor)}
      className={`flex-col gap-2 items-start ${p.className ?? ''}`}
    >
      <Show when={p.label !== undefined}>
        <Text className={textClass()}>{p.label ?? ''}</Text>
      </Show>
      <Canvas
        style={{ lazy: 1 }}
        className={`w-[${p.horizontal === true ? length : band()}px] h-[${p.horizontal === true ? band() : length}px]`}
        onDraw={(x: i32, y: i32, w: i32, h: i32) => {
          const horizontal = p.horizontal === true,
            background = themeColor('muted'),
            peak = themeColor('foreground'),
            clip = themeColor('destructive'),
            text = themeColor('mutedForeground'),
            success = themeColor('success'),
            warning = themeColor('warningSoftForeground'),
            span = Math.max(0.000001, state.ceiling - state.floor);
          for (let i = 0; i < state.peaks.length; i++) {
            const position = toolClamp((state.peaks[i] - state.floor) / span, 0, 1),
              hold = toolClamp((state.holds[i] - state.floor) / span, 0, 1),
              offset = i * (channelWidth + 6);
            rrect(
              x + (horizontal ? 0 : offset),
              y + (horizontal ? offset : 0),
              horizontal ? length : channelWidth,
              horizontal ? channelWidth : length,
              1,
              background as u32,
              255,
            );
            const segments = p.segmented === true ? 32 : 3;
            for (let segment = 0; segment < segments; segment++) {
              const fromDb =
                p.segmented === true
                  ? state.floor + (segment / segments) * span
                  : segment === 0
                    ? state.floor
                    : Math.max(state.floor, segment === 1 ? -18 : -6);
              const toDb =
                p.segmented === true
                  ? state.floor + ((segment + 1) / segments) * span
                  : Math.min(state.ceiling, segment === 0 ? -18 : segment === 1 ? -6 : state.ceiling);
              const from = toolClamp((fromDb - state.floor) / span, 0, 1),
                to = Math.min(position, toolClamp((toDb - state.floor) / span, 0, 1));
              if (to <= from) continue;
              const color = fromDb >= -6 ? clip : fromDb >= -18 ? warning : success,
                gap = p.segmented === true ? 1 : 0;
              rrect(
                x + (horizontal ? from * length : offset),
                y + (horizontal ? offset : (1 - to) * length),
                horizontal ? Math.max(0, (to - from) * length - gap) : channelWidth,
                horizontal ? channelWidth : Math.max(0, (to - from) * length - gap),
                0,
                color as u32,
                255,
              );
            }
            rrect(
              x + (horizontal ? hold * length : offset),
              y + (horizontal ? offset : (1 - hold) * length),
              horizontal ? 1 : channelWidth,
              horizontal ? channelWidth : 1,
              0,
              peak as u32,
              255,
            );
            if (state.clips[i])
              rrect(
                x + (horizontal ? length - 5 : offset),
                y + (horizontal ? offset : 0),
                horizontal ? 5 : channelWidth,
                horizontal ? channelWidth : 5,
                0,
                clip as u32,
                255,
              );
          }
          if (p.scale !== false)
            for (let db = Math.ceil(state.floor / 12) * 12; db <= state.ceiling; db += 12) {
              const pos = toolClamp((db - state.floor) / span, 0, 1);
              drawText(
                labelFont,
                x + (horizontal ? pos * (length - 20) : count() * (channelWidth + 6) + 2),
                y + (horizontal ? count() * (channelWidth + 6) + 2 : (1 - pos) * (length - 12)),
                String(db),
                text as u32,
                255,
                0,
              );
            }
        }}
      />
      <KitButton
        label="Reset peaks and clips"
        size="sm"
        variant="ghost"
        onClick={() => {
          state.reset();
          changed();
          ui.repaint();
        }}
      />
      <Text role="status" className={`text-[11px] tabular-nums text-${theme().mutedForeground}`}>
        {revision() >= 0
          ? state.peaks
              .map(
                (v: number, i: i32) => String(i + 1) + ': ' + v.toFixed(1) + ' dBFS' + (state.clips[i] ? ' CLIP' : ''),
              )
              .join(' · ')
          : ''}
      </Text>
    </View>
  );
  componentEffect(() => {
    const values = p.peaks();
    const rawId = p.sampleId === undefined ? 0 : p.sampleId(),
      id = Number.isFinite(rawId) ? rawId : 0,
      count = Math.min(8, values.length);
    // A repaint is not a new audio sample; a stream ID also distinguishes repeated equal peaks.
    if (
      id === previousSampleId.current &&
      count === previousSample.current.length &&
      previousSample.current.every(
        (value: number, i: i32) => value === (Number.isFinite(values[i]) ? Math.max(0, values[i]) : 0),
      )
    )
      return undefined;
    previousSample.current = values
      .slice(0, count)
      .map((value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0));
    previousSampleId.current = id;
    state.sample(previousSample.current, ui.now());
    changed();
    ui.repaint();
    schedule();
    return undefined;
  });
  componentEffect(() => {
    theme();
    ui.repaint();
    return undefined;
  });
  componentEffect(() => {
    const signal = (kind: string, arg: string): void => {
      if (kind === 'background' || (kind === 'focus' && arg === '0')) {
        cancel();
        state.transition(MeterPhase.Suspended);
      } else if (kind === 'focus' && arg === '1' && state.phase === MeterPhase.Suspended) {
        state.transition(MeterPhase.Rest);
        state.sample(
          state.peaks.map((v: number) => 0),
          ui.now(),
        );
        changed();
        ui.repaint();
        schedule();
      }
    };
    ui.addSignalListener(signal);
    return () => {
      ui.removeSignalListener(signal);
      cancel();
      clock.transition(MeterClockPhase.Disposed);
      state.transition(MeterPhase.Disposed);
    };
  }, []);
  return node;
}
