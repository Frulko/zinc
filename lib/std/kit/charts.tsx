/** @jsxHelpers zinc:ui/kit/host */
// Charts share the engine's Canvas, focus and event ownership; the model contains every painted hit region.
import * as ui from 'zinc:ui';
import { Value, spring } from 'zinc:ui/animated';
import { createNodeRef } from 'zinc:ui/solid';
import { rect, rrect, border, polygon, stroke, font, drawText, textWidth } from 'zinc:gfx';
import { Theme, theme, themeColor, themeAccent } from './theme';
import { componentRef, componentSignal, componentMemo, componentEffect } from './host';
import { ChartModel, ChartSeries, ChartItem, ChartPoint, ScatterSeries, Candle, SankeyLink, GaugeBand, CandleViewport, chartNumber, clampChart, hitChart, seriesChart, donutChart, waffleChart, heatmapChart, treemapChart, funnelChart, radarChart, scatterChart, candleChart, gaugeChart, sankeyChart } from './chart-model';
export { ChartSeries, ChartItem, ChartPoint, ScatterSeries, Candle, SankeyLink, GaugeBand } from './chart-model';
export interface ChartProps {
    label: string;
    width?: number;
    height?: number;
    className?: string;
    format?: (value: number) => string;
    noLegend?: boolean;
    onSelect?: (index: i32, series: i32) => void;
}
export interface SeriesChartProps extends ChartProps {
    series: () => ChartSeries[];
    labels?: string[];
    min?: number;
    max?: number;
    smooth?: boolean;
    area?: boolean;
    stacked?: boolean;
    noGrid?: boolean;
}
export interface ItemChartProps extends ChartProps {
    items: () => ChartItem[];
}
export interface DonutChartProps extends ItemChartProps {
    innerRadius?: number;
}
export interface SparklineProps extends ChartProps {
    values: () => number[];
    color?: string;
}
export interface HeatmapProps extends ChartProps {
    values: () => number[];
    rows: i32;
    columns: i32;
    rowLabels?: string[];
    columnLabels?: string[];
    min?: number;
    max?: number;
}
export interface RadarChartProps extends ChartProps {
    series: () => ChartSeries[];
    axes: string[];
    max?: number;
}
export interface WaffleChartProps extends ItemChartProps {
    columns?: i32;
    rows?: i32;
}
export interface ScatterChartProps extends ChartProps {
    series: () => ScatterSeries[];
    xLabel?: string;
    yLabel?: string;
    xFormat?: (value: number) => string;
}
export interface SankeyChartProps extends ChartProps {
    nodes: string[];
    links: () => SankeyLink[];
    nodeWidth?: number;
}
export interface CandlestickChartProps extends ChartProps {
    candles: () => Candle[];
    labels?: string[];
    overlays?: () => ChartSeries[];
    noVolume?: boolean;
    ohlc?: boolean;
    up?: string;
    down?: string;
}
export interface GaugeProps extends ChartProps {
    value: () => number;
    min?: number;
    max?: number;
    unit?: string;
    size?: number;
}
export interface RadialGaugeProps extends GaugeProps {
    sweep?: number;
    ticks?: i32;
    bands?: GaugeBand[];
    target?: number;
    noNeedle?: boolean;
}
enum InspectPhase {
    None,
    Pointer,
    Keyboard
}
enum PanPhase {
    Idle,
    Panning
}
class ChartCursor {
    index: i32;
    series: i32;
    phase: InspectPhase;
    constructor(index: i32, series: i32, phase: InspectPhase) { this.index = index; this.series = series; this.phase = phase; }
}
class ChartView {
    width: number = 1;
    height: number = 1;
    scaleX: number = 1;
    scaleY: number = 1;
    offsetX: number = 0;
    offsetY: number = 0;
    pan: PanPhase = PanPhase.Idle;
    panStart: number = 0;
    font: i32 = -1;
    colors: Map<string, i32> = new Map<string, i32>();
    palette: Theme | null = null;
    scheme: string = '';
    accent: string = '';
    colorModel: ChartModel | null = null;
    color(role: string): i32 {
        const known = this.colors.get(role);
        if (known !== undefined) return known;
        const value = resolveColor(role); this.colors.set(role, value); return value;
    }
    transitionPan(next: PanPhase): void {
        if (next === PanPhase.Panning && this.pan !== PanPhase.Idle)
            return;
        this.pan = next;
    }
}
class ChartCache {
    model: ChartModel = new ChartModel();
    sources: unknown[] = [];
    key: string = '';
    format: ((value: number) => string) | null = null;
    secondaryFormat: ((value: number) => string) | null = null;
}
function cachedChart(p: ChartProps, sources: () => unknown[], key: () => string, make: () => ChartModel, secondaryFormat: ((value: number) => string) | null = null): () => ChartModel {
    const cache = componentRef(new ChartCache());
    return componentMemo(() => {
        const next = sources(), signature = key(), formatter = p.format ?? chartNumber, previous = cache.current;
        let same = previous.key === signature && previous.format === formatter && previous.secondaryFormat === secondaryFormat && previous.sources.length === next.length;
        for (let i = 0; same && i < next.length; i++)
            same = previous.sources[i] === next[i];
        if (!same) {
            previous.model = make();
            previous.sources = next;
            previous.key = signature;
            previous.format = formatter;
            previous.secondaryFormat = secondaryFormat;
        }
        return previous.model;
    }, cache.current.model);
}
function seriesSources(series: ChartSeries[]): unknown[] {
    const result: unknown[] = [];
    for (const item of series) {
        result.push(item.name);
        result.push(item.values);
        result.push(item.values.length);
        result.push(item.color);
    }
    return result;
}
function itemSources(items: ChartItem[]): unknown[] {
    const result: unknown[] = [];
    for (const item of items) {
        result.push(item.label);
        result.push(item.value);
        result.push(item.color);
    }
    return result;
}
function requireChartLimit(count: number, limit: number, what: string): void { if (count > limit)
    throw new RangeError(what + ' accepts at most ' + limit + ' entries'); }
function resolveColor(color: string): i32 {
    return color.startsWith('#') || color.startsWith('[') || color.includes('-') ? ui.tailwindColor(color) : themeColor(color);
}
function ChartFrame(p: ChartProps, read: () => ChartModel, round: boolean = false, viewport: CandleViewport | null = null, refresh: (() => void) | null = null, spark: boolean = false, motion: Value | null = null): i32 {
    const root = createNodeRef(), canvas = createNodeRef();
    const view = componentRef(new ChartView());
    const [cursor, setCursor] = componentSignal<ChartCursor | null>(null);
    const current = (): ChartModel => read();
    const active = (): i32 => {
        const selected = cursor();
        if (selected === null)
            return -1;
        const marks = current().marks;
        for (let i = 0; i < marks.length; i++)
            if (marks[i].series === selected.series && selected.index >= marks[i].index && selected.index <= marks[i].last)
                return i;
        return -1;
    };
    const selectCursor = (index: i32, series: i32, phase: InspectPhase): void => {
        const previous = cursor();
        if (index < 0 ? previous !== null : previous === null || previous.index !== index || previous.series !== series || previous.phase !== phase) {
            setCursor(index < 0 ? null : new ChartCursor(index, series, phase));
            ui.repaint();
        }
    };
    const inspected = (): string => {
        const model = current(), at = active();
        return at >= 0 && at < model.marks.length ? model.marks[at].title + ': ' + model.marks[at].detail : model.message !== '' ? model.message : model.description !== '' ? model.description : 'Arrow keys inspect · Enter selects';
    };
    const select = (at: i32, phase: InspectPhase): void => {
        const n = current().marks.length, next = at >= 0 && at < n ? at : -1;
        const mark = next >= 0 ? current().marks[next] : null;
        selectCursor(mark !== null ? mark.index : -1, mark !== null ? mark.series : -1, phase);
    };
    const point = (e: ui.PointerEvent): i32 => {
        const v = view.current;
        return hitChart(current(), (e.x - v.offsetX) / v.scaleX, (e.y - v.offsetY) / v.scaleY);
    };
    const activate = (): void => {
        const selected = cursor();
        if (selected === null || p.onSelect === undefined)
            return;
        if (active() >= 0 || viewport !== null && selected.index >= 0 && selected.index < viewport.count)
            p.onSelect(selected.index, selected.series);
    };
    const key = (e: ui.KeyEvent): void => {
        const model = current(), last = model.marks.length - 1;
        if (viewport !== null && (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '0')) {
            if (e.key === '0')
                viewport.fit();
            else
                viewport.zoom(e.key === '-' ? 1.3 : 1 / 1.3, 0.5);
            if (refresh !== null)
                refresh();
            select(-1, InspectPhase.None);
            e.preventDefault();
            return;
        }
        if (e.key === 'Escape') {
            select(-1, InspectPhase.None);
            e.preventDefault();
            return;
        }
        if (last < 0)
            return;
        const direction = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (viewport !== null && (direction !== 0 || e.key === 'Home' || e.key === 'End')) {
            const selected = cursor(), index = selected !== null ? selected.index : Math.floor(viewport.start);
            const next = e.key === 'Home' ? 0 : e.key === 'End' ? viewport.count - 1 : Math.round(clampChart(index + direction * (e.shift ? 10 : 1), 0, viewport.count - 1));
            const start = viewport.start;
            viewport.show(next);
            if (viewport.start !== start && refresh !== null)
                refresh();
            selectCursor(next, 0, InspectPhase.Keyboard);
            e.preventDefault();
            return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
            if (active() < 0)
                select(0, InspectPhase.Keyboard);
            activate();
            e.preventDefault();
            return;
        }
        const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (e.key === 'Home')
            select(0, InspectPhase.Keyboard);
        else if (e.key === 'End')
            select(last, InspectPhase.Keyboard);
        else if (delta !== 0)
            select(Math.round(clampChart(active() < 0 ? delta > 0 ? 0 : last : active() + delta * (e.shift ? 10 : 1), 0, last)), InspectPhase.Keyboard);
        else
            return;
        e.preventDefault();
    };
    componentEffect(() => {
        current();
        theme();
        if (view.current.font < 0)
            view.current.font = font('sans', 11);
        ui.repaint();
        return undefined;
    });
    const draw = (x: i32, y: i32, w: i32, h: i32): void => {
        const model = current(), v = view.current;
        const palette = theme(), scheme = ui.currentScheme(), accentName = themeAccent();
        if (v.colorModel !== model || v.palette !== palette || v.scheme !== scheme || v.accent !== accentName) { v.colors.clear(); v.colorModel = model; v.palette = palette; v.scheme = scheme; v.accent = accentName; }
        v.width = w;
        v.height = h;
        let padding = w * 0.09;
        if (model.axes) for (const s of model.shapes) if (s.kind === 'text' && s.align === 'right' && s.x < 90) padding = Math.max(padding, Math.min(w * 0.35, textWidth(v.font, s.text, 0) + 12));
        v.scaleX = round ? Math.min(w / 320, h / 300) : model.axes ? Math.max(1, w - padding - 12) / 880 : w / 1000;
        v.scaleY = round ? v.scaleX : h / 320;
        v.offsetX = round ? w / 2 - 500 * v.scaleX : model.axes ? padding - 90 * v.scaleX : 0;
        v.offsetY = round ? (h - 300 * v.scaleY) / 2 : 0;
        const left = x + v.offsetX, top = y + v.offsetY;
        for (const s of model.shapes) {
            const selected = cursor();
            const alpha = s.from >= 0 && selected !== null ? s.from === selected.index || s.to === selected.index || s.selection === selected.index ? 175 : 24 : s.alpha;
            const color = v.color(s.color) as u32, sx = left + s.x * v.scaleX, sy = top + s.y * v.scaleY;
            if ((s.kind === 'needle' || s.kind === 'dial') && motion !== null) {
                const ratio = clampChart((motion.get() - s.points[2]) / Math.max(1e-12, s.points[3] - s.points[2]), 0, 1);
                if (s.kind === 'needle') {
                    const angle = s.points[0] + ratio * s.points[1];
                    s.drawing[0] = left + (500 - Math.cos(angle) * 12) * v.scaleX;
                    s.drawing[1] = top + (150 - Math.sin(angle) * 12) * v.scaleY;
                    s.drawing[2] = left + (500 + Math.cos(angle) * 83) * v.scaleX;
                    s.drawing[3] = top + (150 + Math.sin(angle) * 83) * v.scaleY;
                }
                else
                    for (let i = 0; i < s.drawing.length; i += 2) {
                        const angle = s.points[0] + ratio * s.points[1] * i / (s.drawing.length - 2);
                        s.drawing[i] = left + (500 + Math.cos(angle) * 105) * v.scaleX;
                        s.drawing[i + 1] = top + (150 + Math.sin(angle) * 105) * v.scaleY;
                    }
                stroke(s.drawing, s.width, color, alpha, false);
            }
            else if (s.kind === 'rect')
                rrect(sx, sy, s.w * v.scaleX, s.h * v.scaleY, 0, color, alpha);
            else if (s.kind === 'circle') {
                const diameter = Math.min(s.w * v.scaleX, s.h * v.scaleY);
                rrect(sx + (s.w * v.scaleX - diameter) / 2, sy + (s.h * v.scaleY - diameter) / 2, diameter, diameter, diameter / 2, color, alpha);
            }
            else if (s.kind === 'text') {
                const width = textWidth(v.font, s.text, 0), tx = s.align === 'right' ? sx - width : s.align === 'center' ? sx - width / 2 : sx;
                if ((s.w <= 0 || width <= s.w * v.scaleX) && tx >= x && tx + width <= x + w)
                    drawText(v.font, tx, sy, s.text, color, alpha, 0);
            }
            else {
                for (let i = 0; i < s.points.length; i += 2) {
                    s.drawing[i] = left + s.points[i] * v.scaleX;
                    s.drawing[i + 1] = top + s.points[i + 1] * v.scaleY;
                }
                if (s.kind === 'polygon')
                    polygon(s.drawing, color, alpha);
                else
                    stroke(s.drawing, s.width, color, alpha, false);
            }
        }
        const at = active();
        if (at >= 0 && at < model.marks.length) {
            const mark = model.marks[at];
            const accent = v.color('accent') as u32;
            if (Number.isFinite(mark.guideX)) rect(left + mark.guideX * v.scaleX, top + 20 * v.scaleY, 1, 225 * v.scaleY, accent);
            if (Number.isFinite(mark.guideY)) rect(left + 90 * v.scaleX, top + mark.guideY * v.scaleY, 880 * v.scaleX, 1, accent);
            if (!Number.isFinite(mark.guideX)) border(left + mark.x * v.scaleX, top + mark.y * v.scaleY, Math.max(1, mark.w * v.scaleX), Math.max(1, mark.h * v.scaleY), 2, 1.5, accent, 210);
        }
    };
    const node = <View className={`flex-col gap-2 min-w-0 ${p.className ?? ''} ${p.width !== undefined ? 'w-[' + p.width + 'px] max-w-full' : 'w-full'}`}>
    <Show when={!spark}><Text className={`text-[13px] font-medium text-${theme().foreground}`}>{p.label}</Text></Show>
    <Button ref={root} role="button" aria-label={p.label + '. ' + inspected()} aria-roledescription="interactive chart" className={`relative w-full h-[${p.height ?? (spark ? 40 : 220)}px] rounded-[10px] bg-${theme().card} focus-visible:ring-2 focus-visible:ring-${theme().accent} focus-visible:ring-offset-2 overflow-hidden`} onKeyDown={key} onPointerMove={(e: ui.PointerEvent) => select(point(e), InspectPhase.Pointer)} onPointerLeave={(e: ui.PointerEvent) => { if (cursor() !== null && cursor()!.phase === InspectPhase.Pointer)
        select(-1, InspectPhase.None); }} onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0)
        select(point(e), InspectPhase.Pointer); }} onClick={activate} onPointerCancel={(e: ui.PointerEvent) => { view.current.transitionPan(PanPhase.Idle); select(-1, InspectPhase.None); }} grab={viewport !== null ? 'keep-x' : 'none'} onWheel={(e: ui.PointerEvent) => {
            if (viewport === null || ui.focused() !== root.node)
                return;
            if (e.shift || e.wheelX !== 0)
                viewport.pan((e.wheelX !== 0 ? e.wheelX : e.wheel) / 80 * viewport.span * 0.1);
            else
                viewport.zoom(Math.pow(1.0015, -e.wheel), clampChart((e.x / view.current.width - 0.09) / 0.88, 0, 1));
            if (refresh !== null)
                refresh();
            select(-1, InspectPhase.None);
        }} onDrag={(e: ui.PointerEvent) => {
            if (viewport === null)
                return;
            if (e.phase === 0) {
                view.current.transitionPan(PanPhase.Panning);
                view.current.panStart = viewport.start;
            }
            if (e.phase < 2 && view.current.pan === PanPhase.Panning) {
                viewport.start = view.current.panStart;
                viewport.pan(-e.dx / Math.max(1, view.current.width * 0.88) * viewport.span);
                if (refresh !== null)
                    refresh();
            }
            else
                view.current.transitionPan(PanPhase.Idle);
        }}>
      <Canvas ref={canvas} className="absolute inset-0 pointer-events-none" style={{ lazy: 1 }} onDraw={draw}/>
      <Show when={active() >= 0 && cursor() !== null && cursor()!.phase === InspectPhase.Pointer}>
        <View className={`absolute top-2 right-2 w-[260px] max-w-full p-2 rounded-[10px] border border-${theme().border} bg-${theme().card} shadow-[0_8px_20px_rgba(0,0,0,0.12)] pointer-events-none`}><Text className={`text-[11px] text-${theme().foreground}`}>{inspected()}</Text></View>
      </Show>
      <Show when={current().marks.length === 0}><View className="absolute inset-0 items-center justify-center"><Text className={`text-[12px] text-${theme().mutedForeground}`}>{current().message}</Text></View></Show>
    </Button>
    <Show when={!spark && !p.noLegend && current().legend.length > 0}>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        {current().legend.map((item: ChartItem) => <View className="flex-row items-center gap-1.5"><View className="w-2 h-2 rounded-sm" style={{ backgroundColor: resolveColor(item.color ?? 'accent') }}/><Text className={`text-[11px] text-${theme().mutedForeground}`}>{item.label}</Text></View>)}
      </View>
    </Show>
    <Show when={!spark}><Text role="status" aria-live="polite" className={`text-[11px] min-h-[28px] text-${theme().mutedForeground}`}>{inspected()}</Text></Show>
  </View>;
    componentEffect(() => ui.onFocusWithin(root.node, (focused: boolean) => { if (!focused && ui.focused() !== root.node) {
        view.current.transitionPan(PanPhase.Idle);
        select(-1, InspectPhase.None);
    } }), []);
    return node;
}
function SeriesPlot(p: SeriesChartProps, kind: string): i32 {
    const read = cachedChart(p, () => seriesSources(p.series()), () => [kind, String(p.min), String(p.max), String(p.stacked), String(p.smooth), String(p.noGrid), (p.labels ?? []).join('\n')].join('|'), () => {
        const data = p.series();
        requireChartLimit(data.length, 16, 'Chart series');
        for (const s of data)
            requireChartLimit(s.values.length, 4096, 'Series values');
        return seriesChart(data, p.labels ?? [], kind, p.stacked === true, p.smooth === true, p.noGrid !== true, [], p.format ?? chartNumber, p.min, p.max);
    });
    return ChartFrame(p, read);
}
export function LineChart(p: SeriesChartProps): i32 { return SeriesPlot(p, p.area === true ? 'area' : 'line'); }
export function AreaChart(p: SeriesChartProps): i32 { return SeriesPlot(p, 'area'); }
export function BarChart(p: SeriesChartProps): i32 { return SeriesPlot(p, 'bar'); }
export function DonutChart(p: DonutChartProps): i32 {
    const read = cachedChart(p, () => itemSources(p.items()), () => String(p.innerRadius), () => { const items = p.items(); requireChartLimit(items.length, 128, 'Donut'); return donutChart(items, p.format ?? chartNumber, p.innerRadius ?? 0.68); });
    return ChartFrame(p, read, true);
}
export function Sparkline(p: SparklineProps): i32 {
    const read = cachedChart(p, () => [p.values(), p.values().length], () => p.color ?? 'accent', () => {
        requireChartLimit(p.values().length, 4096, 'Sparkline');
        const model = seriesChart([{ name: p.label, values: p.values(), color: p.color }], [], 'line', false, false, false, [], p.format ?? chartNumber);
        model.shapes = model.shapes.filter((s) => s.kind !== 'text');
        return model;
    });
    return ChartFrame(p, read, false, null, null, true);
}
export function Heatmap(p: HeatmapProps): i32 {
    const read = cachedChart(p, () => [p.values(), p.values().length], () => [String(p.rows), String(p.columns), String(p.min), String(p.max), (p.rowLabels ?? []).join('\n'), (p.columnLabels ?? []).join('\n')].join('|'), () => { requireChartLimit(p.rows, 128, 'Heatmap rows'); requireChartLimit(p.columns, 128, 'Heatmap columns'); return heatmapChart(p.values(), p.rows, p.columns, p.rowLabels ?? [], p.columnLabels ?? [], p.format ?? chartNumber, p.min, p.max); });
    return ChartFrame(p, read);
}
export function Treemap(p: ItemChartProps): i32 {
    const read = cachedChart(p, () => itemSources(p.items()), () => '', () => { requireChartLimit(p.items().length, 512, 'Treemap'); return treemapChart(p.items(), p.format ?? chartNumber); });
    return ChartFrame(p, read);
}
export function Funnel(p: ItemChartProps): i32 {
    const read = cachedChart(p, () => itemSources(p.items()), () => '', () => { requireChartLimit(p.items().length, 128, 'Funnel'); return funnelChart(p.items(), p.format ?? chartNumber); });
    return ChartFrame(p, read);
}
export function Waffle(p: WaffleChartProps): i32 {
    const read = cachedChart(p, () => itemSources(p.items()), () => String(p.columns) + '|' + String(p.rows), () => { requireChartLimit(p.items().length, 128, 'Waffle'); return waffleChart(p.items(), p.columns ?? 10, p.rows ?? 10, p.format ?? chartNumber); });
    return ChartFrame(p, read);
}
export function RadarChart(p: RadarChartProps): i32 {
    const read = cachedChart(p, () => seriesSources(p.series()), () => p.axes.join('\n') + '|' + String(p.max), () => { requireChartLimit(p.series().length, 16, 'Radar series'); requireChartLimit(p.axes.length, 32, 'Radar axes'); return radarChart(p.series(), p.axes, [], p.max ?? 0, p.format ?? chartNumber); });
    return ChartFrame(p, read, true);
}
export function ScatterChart(p: ScatterChartProps): i32 {
    const read = cachedChart(p, () => { const out: unknown[] = []; for (const s of p.series()) {
        out.push(s.name);
        out.push(s.points);
        out.push(s.points.length);
        out.push(s.color);
    } return out; }, () => (p.xLabel ?? '') + '|' + (p.yLabel ?? ''), () => { const data = p.series(); requireChartLimit(data.length, 16, 'Scatter series'); for (const s of data)
        requireChartLimit(s.points.length, 4096, 'Scatter points'); return scatterChart(data, [], p.xFormat ?? chartNumber, p.format ?? chartNumber, p.xLabel ?? '', p.yLabel ?? ''); }, p.xFormat ?? null);
    return ChartFrame(p, read);
}
export function Sankey(p: SankeyChartProps): i32 {
    const read = cachedChart(p, () => [p.links(), p.links().length], () => p.nodes.join('\n') + '|' + String(p.nodeWidth), () => { requireChartLimit(p.nodes.length, 256, 'Sankey nodes'); requireChartLimit(p.links().length, 2048, 'Sankey links'); return sankeyChart(p.nodes, p.links(), p.format ?? chartNumber, clampChart(p.nodeWidth ?? 22, 2, 80)); });
    return ChartFrame(p, read);
}
export function CandlestickChart(p: CandlestickChartProps): i32 {
    const viewport = componentRef(new CandleViewport()), [revision, setRevision] = componentSignal(0);
    const read = cachedChart(p, () => [p.candles(), p.candles().length, ...(p.overlays !== undefined ? seriesSources(p.overlays()) : [])], () => [String(revision()), String(p.noVolume), String(p.ohlc), p.up ?? '', p.down ?? '', (p.labels ?? []).join('\n')].join('|'), () => candleChart(p.candles(), p.labels ?? [], p.overlays !== undefined ? p.overlays() : [], viewport.current, p.noVolume !== true, p.ohlc === true, p.format ?? chartNumber, p.up ?? 'success', p.down ?? 'destructive'));
    return ChartFrame(p, read, false, viewport.current, () => setRevision(revision() + 1));
}
export function RadialGauge(p: RadialGaugeProps): i32 {
    const motion = componentRef<Value | null>(null);
    if (motion.current === null)
        motion.current = new Value(Number.isFinite(p.value()) ? p.value() : 0);
    componentEffect(() => {
        const value = motion.current as Value, target = Number.isFinite(p.value()) ? p.value() : 0;
        if (ui.prefersReducedMotion())
            value.setValue(target);
        else if (value.get() !== target)
            spring(value, { toValue: target, stiffness: 580, damping: 42, mass: 1 }).start();
        return undefined;
    }, [p.value()]);
    componentEffect(() => {
        const value = motion.current as Value;
        value.addListener((v: number) => ui.repaint());
        const signal = (kind: string, arg: string): void => { if (kind === 'reducemotion' && ui.prefersReducedMotion()) {
            value.setValue(Number.isFinite(p.value()) ? p.value() : 0);
            ui.repaint();
        } };
        ui.addSignalListener(signal);
        return () => { value.stopAnimation(); value.removeAllListeners(); ui.removeSignalListener(signal); };
    }, []);
    const read = cachedChart(p, () => [p.value()], () => [String(p.min), String(p.max), String(p.sweep), String(p.ticks), String(p.target), String(p.noNeedle), p.unit ?? '', JSON.stringify(p.bands ?? [])].join('|'), () => gaugeChart(p.value(), p.min ?? 0, p.max ?? 100, p.sweep ?? 240, p.ticks ?? 5, p.bands ?? [], p.target, p.noNeedle !== true, p.unit ?? '', p.format ?? chartNumber));
    return ChartFrame({ label: p.label, width: p.width ?? p.size, height: p.height ?? p.size ?? 220, className: p.className, format: p.format, noLegend: true, onSelect: p.onSelect }, read, true, null, null, false, motion.current);
}
export function Gauge(p: GaugeProps): i32 { return RadialGauge({ label: p.label, value: p.value, min: p.min, max: p.max, unit: p.unit, size: p.size, width: p.width, height: p.height, className: p.className, format: p.format, onSelect: p.onSelect, sweep: 180, ticks: -1, noNeedle: true }); }
