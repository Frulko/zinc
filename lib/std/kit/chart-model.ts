// Pure chart geometry in a 1000 × 300 view box. Canvas drawing and input use the same marks.
export interface ChartSeries {
    name: string;
    values: number[];
    color?: string;
}
export interface ChartItem {
    label: string;
    value: number;
    color?: string;
}
export interface ChartPoint {
    x: number;
    y: number;
    size?: number;
}
export interface ScatterSeries {
    name: string;
    points: ChartPoint[];
    color?: string;
}
export interface Candle {
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}
export interface SankeyLink {
    from: i32;
    to: i32;
    value: number;
}
export interface GaugeBand {
    to: number;
    tone: string;
}
export interface ChartRange {
    min: number;
    max: number;
    step: number;
}
export interface ChartRect {
    index: i32;
    x: number;
    y: number;
    w: number;
    h: number;
}
export class ChartShape {
    kind: string = 'rect';
    x: number = 0;
    y: number = 0;
    w: number = 0;
    h: number = 0;
    points: number[] = [];
    drawing: number[] = [];
    color: string = 'accent';
    alpha: i32 = 255;
    width: number = 1.5;
    from: i32 = -1;
    to: i32 = -1;
    selection: i32 = -1;
    text: string = '';
    align: string = 'left';
}
export class ChartMark {
    index: i32 = 0;
    last: i32 = 0;
    series: i32 = 0;
    x: number = 0;
    y: number = 0;
    w: number = 0;
    h: number = 0;
    title: string = '';
    detail: string = '';
    points: number[] = [];
    guideX: number = NaN;
    guideY: number = NaN;
    angle: number = 0;
    sweep: number = 0;
    inner: number = 0;
}
export class ChartModel {
    shapes: ChartShape[] = [];
    marks: ChartMark[] = [];
    legend: ChartItem[] = [];
    message: string = 'No data';
    description: string = '';
    axes: boolean = false;
}
export function clampChart(v: number, low: number, high: number): number { return Number.isNaN(v) ? low : Math.max(low, Math.min(high, v)); }
export function chartNumber(v: number): string {
    if (!Number.isFinite(v))
        return '—';
    const n = Math.abs(v), unit = n >= 1e9 ? 'B' : n >= 1e6 ? 'M' : n >= 1000 ? 'k' : '';
    const d = unit === 'B' ? 1e9 : unit === 'M' ? 1e6 : unit === 'k' ? 1000 : 1;
    return String(Number((v / d).toFixed(n < 10 || d > 1 ? 1 : 0))) + unit;
}
export function chartRange(low: number, high: number, fixedMin?: number, fixedMax?: number): ChartRange {
    let lo = fixedMin !== undefined && Number.isFinite(fixedMin) ? fixedMin : Number.isFinite(low) ? low : 0;
    let hi = fixedMax !== undefined && Number.isFinite(fixedMax) ? fixedMax : Number.isFinite(high) ? high : 1;
    if (hi <= lo) {
        const pad = Math.max(1, Math.abs(lo) * 0.1);
        lo -= pad;
        hi += pad;
    }
    const rough = (hi - lo) / 4, mag = Math.pow(10, Math.floor(Math.log10(rough))), normalized = rough / mag;
    const step = (normalized < 1.5 ? 1 : normalized < 2.25 ? 2 : normalized < 3.5 ? 2.5 : normalized < 7.5 ? 5 : 10) * mag;
    return { min: fixedMin !== undefined ? lo : Math.floor(lo / step) * step, max: fixedMax !== undefined ? hi : Math.ceil(hi / step) * step, step };
}
function shape(m: ChartModel, kind: string, x: number, y: number, w: number, h: number, color: string, alpha: i32 = 255): ChartShape {
    const s = new ChartShape();
    s.kind = kind;
    s.x = x;
    s.y = y;
    s.w = w;
    s.h = h;
    s.color = color;
    s.alpha = alpha;
    m.shapes.push(s);
    return s;
}
function path(m: ChartModel, points: number[], color: string, fill: boolean = false, alpha: i32 = 255, width: number = 1.5): ChartShape {
    const s = shape(m, fill ? 'polygon' : 'line', 0, 0, 0, 0, color, alpha);
    s.points = points;
    s.drawing = points.slice();
    s.width = width;
    return s;
}
function text(m: ChartModel, label: string, x: number, y: number, align: string = 'left', color: string = 'mutedForeground', maxWidth: number = 0): void {
    const s = shape(m, 'text', x, y, maxWidth, 0, color);
    s.text = label;
    s.align = align;
}
function mark(m: ChartModel, index: i32, title: string, detail: string, x: number, y: number, w: number, h: number, series: i32 = 0): ChartMark {
    const s = new ChartMark();
    s.index = index;
    s.last = index;
    s.series = series;
    s.title = title;
    s.detail = detail;
    s.x = x;
    s.y = y;
    s.w = w;
    s.h = h;
    m.marks.push(s);
    m.message = '';
    return s;
}
function colorAt(i: i32, own?: string): string { return own ?? (i === 0 ? 'accent' : i % 3 === 1 ? 'mutedForeground' : 'foreground'); }
function yAt(v: number, range: ChartRange): number { return 245 - clampChart((v - range.min) / (range.max - range.min), 0, 1) * 225; }
function axes(m: ChartModel, range: ChartRange, grid: boolean, format: (v: number) => string): void {
    m.axes = true;
    const ticks = Math.min(12, Math.ceil((range.max - range.min) / range.step));
    for (let i = 0; i <= ticks; i++) {
        const v = range.min + range.step * i;
        if (v > range.max + range.step / 100)
            break;
        const y = yAt(v, range);
        text(m, format(v), 74, y - 5, 'right');
        if (grid)
            shape(m, 'rect', 90, y, 880, 0.8, 'border');
    }
}
function labelAt(names: string[], index: i32): string { return index >= 0 && index < names.length ? names[index] : String(index + 1); }
function labels(m: ChartModel, names: string[], count: i32, centered: boolean = false): void {
    const skip = Math.max(1, Math.ceil(count / 7));
    for (let i = 0; i < count; i += skip)
        text(m, labelAt(names, i), 90 + (centered ? (i + 0.5) / count : count < 2 ? 0.5 : i / (count - 1)) * 880, 264, 'center');
}
export function smoothChart(points: number[]): number[] {
    const out: number[] = [];
    for (let i = 0; i + 3 < points.length; i += 2) {
        const x0 = points[Math.max(0, i - 2)], y0 = points[Math.max(1, i - 1)];
        const x1 = points[i], y1 = points[i + 1], x2 = points[i + 2], y2 = points[i + 3];
        const x3 = points[Math.min(points.length - 2, i + 4)], y3 = points[Math.min(points.length - 1, i + 5)];
        for (let k = 0; k < 8; k++) {
            const t = k / 8, t2 = t * t, t3 = t2 * t;
            out.push(0.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3));
            out.push(clampChart(0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3), Math.min(y1, y2), Math.max(y1, y2)));
        }
    }
    if (points.length >= 2) {
        out.push(points[points.length - 2]);
        out.push(points[points.length - 1]);
    }
    return out;
}
export function seriesChart(series: ChartSeries[], names: string[], kind: string, stacked: boolean, smooth: boolean, grid: boolean, hidden: i32[], format: (v: number) => string, min?: number, max?: number): ChartModel {
    const m = new ChartModel();
    let count: i32 = 0, low = 0, high = 0;
    const used: i32[] = [];
    for (let s = 0; s < Math.min(16, series.length); s++) {
        m.legend.push({ label: series[s].name, value: s, color: colorAt(s, series[s].color) });
        if (!hidden.includes(s)) {
            used.push(s);
            count = Math.max(count, Math.min(4096, series[s].values.length));
        }
    }
    for (let i = 0; i < count; i++) {
        let positive = 0, negative = 0;
        for (const s of used) {
            const v = i < series[s].values.length ? series[s].values[i] : NaN;
            if (!Number.isFinite(v))
                continue;
            if (stacked && kind === 'bar') {
                if (v < 0)
                    negative += v;
                else
                    positive += v;
            }
            else {
                low = Math.min(low, v);
                high = Math.max(high, v);
            }
        }
        low = Math.min(low, negative);
        high = Math.max(high, positive);
    }
    const range = chartRange(low, high, min, max);
    axes(m, range, grid, format);
    labels(m, names, count, kind === 'bar');
    for (let i = 0; i < count; i++) {
        let detail = '', positive = 0, negative = 0;
        for (const s of used) {
            const v = i < series[s].values.length ? series[s].values[i] : NaN;
            if (!Number.isFinite(v))
                continue;
            detail += (detail === '' ? '' : ' · ') + series[s].name + ' ' + format(v);
            if (kind !== 'bar')
                continue;
            const unit = 880 / count, from = stacked ? v < 0 ? negative : positive : 0;
            const a = yAt(from, range), b = yAt(from + v, range), group = used.indexOf(s);
            const width = unit * 0.76 / (stacked ? 1 : Math.max(1, used.length));
            const x = 90 + i * unit + unit * 0.12 + (stacked ? 0 : group * width);
            shape(m, 'rect', x, Math.min(a, b), Math.max(0.4, width - 1), Math.max(0.8, Math.abs(a - b)), colorAt(s, series[s].color));
            if (v < 0)
                negative += v;
            else
                positive += v;
        }
        const unit = 880 / Math.max(1, count), center = 90 + (count < 2 ? 0.5 : i / (count - 1)) * 880;
        const half = count < 2 ? 440 : 440 / (count - 1);
        const left = kind === 'bar' ? 90 + i * unit : Math.max(90, center - half);
        const right = kind === 'bar' ? left + unit : Math.min(970, center + half);
        if (detail !== '') {
            const hit = mark(m, i, labelAt(names, i), detail, left, 20, right - left, 225);
            if (kind !== 'bar') hit.guideX = center;
        }
    }
    if (kind !== 'bar')
        for (const s of used) {
            let points: number[] = [];
            const flush = (): void => {
                if (points.length === 0)
                    return;
                const line = smooth ? smoothChart(points) : points;
                if (kind === 'area' && s === used[0]) {
                    const area = line.slice();
                    area.push(line[line.length - 2]);
                    area.push(yAt(0, range));
                    area.push(line[0]);
                    area.push(yAt(0, range));
                    path(m, area, colorAt(s, series[s].color), true, 28);
                }
                path(m, line, colorAt(s, series[s].color), false, 255, 2);
                if (points.length === 2)
                    shape(m, 'circle', points[0] - 4, points[1] - 4, 8, 8, colorAt(s, series[s].color));
                points = [];
            };
            for (let i = 0; i < count; i++) {
                const v = i < series[s].values.length ? series[s].values[i] : NaN;
                if (!Number.isFinite(v)) {
                    flush();
                    continue;
                }
                points.push(90 + (count < 2 ? 0.5 : i / (count - 1)) * 880);
                points.push(yAt(v, range));
            }
            flush();
        }
    return m;
}
function arc(cx: number, cy: number, radius: number, start: number, sweep: number): number[] {
    const points: number[] = [], steps = Math.max(2, Math.ceil(Math.abs(sweep) * 16));
    for (let i = 0; i <= steps; i++) {
        const a = start + sweep * i / steps;
        points.push(cx + Math.cos(a) * radius);
        points.push(cy + Math.sin(a) * radius);
    }
    return points;
}
export function donutChart(items: ChartItem[], format: (v: number) => string, inner: number = 0.68): ChartModel {
    const m = new ChartModel();
    let total = 0;
    for (const item of items.slice(0, 128))
        if (Number.isFinite(item.value))
            total += Math.max(0, item.value);
    let angle = -Math.PI / 2;
    path(m, arc(500, 145, 110, 0, Math.PI * 2), 'muted', false, 255, 34);
    for (let i = 0; i < Math.min(128, items.length); i++) {
        const item = items[i], value = Number.isFinite(item.value) ? Math.max(0, item.value) : 0;
        m.legend.push({ label: item.label, value, color: colorAt(i, item.color) });
        if (total <= 0 || value <= 0)
            continue;
        const sweep = value / total * Math.PI * 2, points = arc(500, 145, 128, angle, sweep);
        const inside = arc(500, 145, 128 * clampChart(inner, 0.1, 0.9), angle + sweep, -sweep);
        path(m, points.concat(inside), colorAt(i, item.color), true, i === 0 ? 255 : 140 + i % 3 * 35);
        const hit = mark(m, i, item.label, format(value) + ' · ' + chartNumber(value / total * 100) + '%', 372, 17, 256, 256);
        hit.angle = angle;
        hit.sweep = sweep;
        hit.inner = clampChart(inner, 0.1, 0.9);
        angle += sweep;
    }
    text(m, format(total), 500, 138, 'center', 'foreground');
    return m;
}
export function waffleCounts(values: number[], cells: i32): i32[] {
    const count = Math.min(128, values.length), out: i32[] = [], remainder: number[] = [];
    let total = 0, assigned: i32 = 0;
    for (let i = 0; i < count; i++)
        total += Number.isFinite(values[i]) ? Math.max(0, values[i]) : 0;
    for (let i = 0; i < count; i++) {
        const share = total > 0 && Number.isFinite(values[i]) ? Math.max(0, values[i]) / total * cells : 0;
        const n = Math.floor(share);
        out.push(n);
        remainder.push(share - n);
        assigned += n;
    }
    while (total > 0 && assigned < cells) {
        let best: i32 = 0;
        for (let i = 1; i < count; i++)
            if (remainder[i] > remainder[best])
                best = i;
        out[best]++;
        remainder[best] = -1;
        assigned++;
    }
    return out;
}
export function waffleChart(items: ChartItem[], columns: i32, rows: i32, format: (v: number) => string): ChartModel {
    const m = new ChartModel(), cols = Math.round(clampChart(columns, 1, 50)), lines = Math.round(clampChart(rows, 1, 50));
    const counts = waffleCounts(items.map((v: ChartItem) => v.value), cols * lines), cellW = 880 / cols, cellH = 245 / lines;
    let at: i32 = 0;
    for (let i = 0; i < counts.length; i++) {
        const item = items[i];
        m.legend.push({ label: item.label, value: item.value, color: colorAt(i, item.color) });
        for (let k = 0; k < counts[i]; k++) {
            const x = 90 + (at % cols) * cellW, y = 10 + Math.floor(at / cols) * cellH;
            shape(m, 'rect', x, y, Math.max(1, cellW - 4), Math.max(1, cellH - 4), colorAt(i, item.color), i === 0 ? 255 : 150);
            mark(m, i, item.label, format(item.value) + ' · ' + counts[i] + '/' + cols * lines, x, y, cellW, cellH);
            at++;
        }
    }
    return m;
}
export function heatmapChart(values: number[], rows: i32, cols: i32, rowNames: string[], colNames: string[], format: (v: number) => string, min?: number, max?: number): ChartModel {
    const m = new ChartModel(), r = Math.round(clampChart(rows, 0, 128)), c = Math.round(clampChart(cols, 0, 128));
    let low = Infinity, high = -Infinity;
    for (const v of values.slice(0, r * c))
        if (Number.isFinite(v)) {
            low = Math.min(low, v);
            high = Math.max(high, v);
        }
    const range = chartRange(low, high, min, max);
    m.axes = true;
    for (let row = 0; row < r; row++) {
        if (r < 16 || row % Math.ceil(r / 12) === 0)
            text(m, labelAt(rowNames, row), 82, 12 + (row + 0.5) * 240 / r, 'right');
        for (let col = 0; col < c; col++) {
            const index = row * c + col, value = index < values.length ? values[index] : NaN, x = 90 + col * 880 / c, y = 10 + row * 240 / r;
            shape(m, 'rect', x, y, 880 / c - 2, 240 / r - 2, Number.isFinite(value) ? 'accent' : 'muted', Number.isFinite(value) ? Math.round(35 + clampChart((value - range.min) / (range.max - range.min), 0, 1) * 220) : 255);
            if (Number.isFinite(value))
                mark(m, index, (labelAt(rowNames, row)) + ' · ' + (labelAt(colNames, col)), format(value), x, y, 880 / c, 240 / r);
        }
    }
    labels(m, colNames, c, true);
    text(m, format(range.min) + ' — ' + format(range.max), 970, 285, 'right');
    return m;
}
export function treemapLayout(values: number[], width: number, height: number): ChartRect[] {
    const order: i32[] = [], areas: number[] = [], result: ChartRect[] = [];
    let total = 0;
    for (let i = 0; i < Math.min(512, values.length); i++)
        if (Number.isFinite(values[i]) && values[i] > 0) {
            order.push(i);
            total += values[i];
        }
    order.sort((a: i32, b: i32) => values[b] - values[a]);
    for (const i of order)
        areas.push(values[i] / total * width * height);
    let x = 0, y = 0, w = Math.max(0, width), h = Math.max(0, height), at: i32 = 0;
    while (at < areas.length && w > 0 && h > 0) {
        const side = Math.min(w, h);
        let end = at + 1, sum = areas[at], worst = Math.max(side * side * areas[at] / (sum * sum), sum * sum / (side * side * areas[at]));
        while (end < areas.length) {
            const nextSum = sum + areas[end], largest = areas[at], smallest = areas[end];
            const next = Math.max(side * side * largest / (nextSum * nextSum), nextSum * nextSum / (side * side * smallest));
            if (next > worst)
                break;
            sum = nextSum;
            worst = next;
            end++;
        }
        const thick = sum / side;
        let offset = 0;
        for (let i = at; i < end; i++) {
            const length = areas[i] / thick;
            result.push({ index: order[i], x: x + (w < h ? offset : 0), y: y + (w < h ? 0 : offset), w: w < h ? length : thick, h: w < h ? thick : length });
            offset += length;
        }
        if (w < h) {
            y += thick;
            h = Math.max(0, h - thick);
        }
        else {
            x += thick;
            w = Math.max(0, w - thick);
        }
        at = end;
    }
    return result;
}
export function treemapChart(items: ChartItem[], format: (v: number) => string): ChartModel {
    const m = new ChartModel(), boxes = treemapLayout(items.map((v: ChartItem) => v.value), 880, 260);
    let top = 1;
    for (const item of items)
        if (Number.isFinite(item.value))
            top = Math.max(top, item.value);
    for (const box of boxes) {
        const item = items[box.index], x = 90 + box.x, y = 10 + box.y;
        shape(m, 'rect', x, y, Math.max(0, box.w - 3), Math.max(0, box.h - 3), item.color ?? 'accent', Math.round(55 + item.value / top * 200));
        if (box.w > 105 && box.h > 35) {
            text(m, item.label, x + 10, y + 10, 'left', item.value / top > 0.7 ? 'accentForeground' : 'foreground', box.w - 20);
            text(m, format(item.value), x + 10, y + 31, 'left', item.value / top > 0.7 ? 'accentForeground' : 'foreground', box.w - 20);
        }
        mark(m, box.index, item.label, format(item.value), x, y, box.w, box.h);
    }
    return m;
}
export function funnelChart(items: ChartItem[], format: (v: number) => string): ChartModel {
    const m = new ChartModel();
    let maximum = 0;
    for (const item of items.slice(0, 128))
        if (Number.isFinite(item.value))
            maximum = Math.max(maximum, item.value);
    const count = Math.min(128, items.length), first = count > 0 ? items[0].value : 0;
    for (let i = 0; i < count; i++) {
        const item = items[i], value = Number.isFinite(item.value) ? Math.max(0, item.value) : 0;
        if (maximum <= 0)
            continue;
        const width = value / maximum * 600, next = i + 1 < count ? (Number.isFinite(items[i + 1].value) ? Math.max(0, items[i + 1].value) : 0) / maximum * 600 : width * 0.9, y = 10 + i * 260 / count, height = 260 / count - 5;
        const points = [650 - width / 2, y, 650 + width / 2, y, 650 + next / 2, y + height, 650 - next / 2, y + height];
        path(m, points, item.color ?? 'accent', true, Math.round(255 - i / count * 150));
        const previous = i > 0 ? items[i - 1].value : first, detail = format(value) + ' · ' + chartNumber(first > 0 ? value / first * 100 : 0) + '% of first' + (i > 0 ? ' · ' + chartNumber(previous > 0 ? value / previous * 100 : 0) + '% conversion' : '');
        text(m, item.label + ' ' + format(value), 90, y + height / 2 - 5, 'left', 'foreground', 240);
        const hit = mark(m, i, item.label, detail, 650 - Math.max(width, next) / 2, y, Math.max(width, next), height);
        hit.points = points;
    }
    return m;
}
export function radarChart(series: ChartSeries[], names: string[], hidden: i32[], maximum: number, format: (v: number) => string): ChartModel {
    const m = new ChartModel(), count = Math.min(32, names.length);
    if (count < 3)
        return m;
    let top = maximum > 0 ? maximum : 1;
    if (maximum <= 0)
        for (const item of series.slice(0, 16))
            for (const v of item.values.slice(0, count))
                if (Number.isFinite(v))
                    top = Math.max(top, v);
    for (let tick = 1; tick <= 4; tick++) {
        const points: number[] = [];
        for (let i = 0; i <= count; i++) {
            const a = -Math.PI / 2 + i % count * 2 * Math.PI / count;
            points.push(500 + Math.cos(a) * tick * 27);
            points.push(145 + Math.sin(a) * tick * 27);
        }
        path(m, points, 'border');
        text(m, format(top * tick / 4), 505, 145 - tick * 27);
    }
    for (let i = 0; i < count; i++) {
        const a = -Math.PI / 2 + i * 2 * Math.PI / count, x = 500 + Math.cos(a) * 108, y = 145 + Math.sin(a) * 108;
        path(m, [500, 145, x, y], 'border');
        text(m, names[i], 500 + Math.cos(a) * 140, 140 + Math.sin(a) * 130, 'center');
        let detail = '';
        for (let s = 0; s < Math.min(16, series.length); s++)
            if (!hidden.includes(s))
                detail += (detail === '' ? '' : ' · ') + series[s].name + ' ' + format(i < series[s].values.length ? series[s].values[i] : NaN);
        mark(m, i, names[i], detail, x - 30, y - 30, 60, 60);
    }
    for (let s = 0; s < Math.min(16, series.length); s++) {
        const item = series[s];
        m.legend.push({ label: item.name, value: s, color: colorAt(s, item.color) });
        if (hidden.includes(s))
            continue;
        const points: number[] = [];
        for (let i = 0; i <= count; i++) {
            const v = i % count < item.values.length ? item.values[i % count] : NaN, a = -Math.PI / 2 + i % count * 2 * Math.PI / count, r = Number.isFinite(v) ? clampChart(v / top, 0, 1) * 108 : 0;
            points.push(500 + Math.cos(a) * r);
            points.push(145 + Math.sin(a) * r);
        }
        path(m, points, colorAt(s, item.color), true, 22);
        path(m, points, colorAt(s, item.color));
    }
    return m;
}
export function scatterChart(series: ScatterSeries[], hidden: i32[], xFormat: (v: number) => string, format: (v: number) => string, xLabel: string, yLabel: string): ChartModel {
    const m = new ChartModel();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, maximumSize = 1;
    for (let s = 0; s < Math.min(16, series.length); s++)
        if (!hidden.includes(s))
            for (const p of series[s].points.slice(0, 4096))
                if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
                    minX = Math.min(minX, p.x);
                    maxX = Math.max(maxX, p.x);
                    minY = Math.min(minY, p.y);
                    maxY = Math.max(maxY, p.y);
                    if (p.size !== undefined && Number.isFinite(p.size))
                        maximumSize = Math.max(maximumSize, p.size);
                }
    const xr = chartRange(minX, maxX), yr = chartRange(minY, maxY);
    axes(m, yr, true, format);
    for (let i = 0; i <= 4; i++)
        text(m, xFormat(xr.min + (xr.max - xr.min) * i / 4), 90 + i * 220, 264, 'center');
    text(m, xLabel, 530, 286, 'center');
    text(m, yLabel, 90, 0);
    for (let s = 0; s < Math.min(16, series.length); s++) {
        const item = series[s];
        m.legend.push({ label: item.name, value: s, color: colorAt(s, item.color) });
        if (hidden.includes(s))
            continue;
        for (let i = 0; i < Math.min(4096, item.points.length); i++) {
            const p = item.points[i];
            if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
                continue;
            const x = 90 + (p.x - xr.min) / (xr.max - xr.min) * 880, y = yAt(p.y, yr), size = p.size !== undefined && Number.isFinite(p.size) ? clampChart(Math.sqrt(Math.max(0, p.size) / maximumSize) * 19, 3, 19) : 5;
            shape(m, 'circle', x - size - 1.5, y - size - 1.5, (size + 1.5) * 2, (size + 1.5) * 2, 'card');
            shape(m, 'circle', x - size, y - size, size * 2, size * 2, colorAt(s, item.color));
            const hit = mark(m, i, item.name, xFormat(p.x) + ' · ' + format(p.y) + (p.size !== undefined ? ' · size ' + format(p.size) : ''), x - size - 5, y - size - 5, (size + 5) * 2, (size + 5) * 2, s);
            hit.guideX = x; hit.guideY = y;
        }
    }
    return m;
}
export function hitChart(m: ChartModel, x: number, y: number): i32 {
    let best: i32 = -1, distance = Infinity;
    for (let i = 0; i < m.marks.length; i++) {
        const a = m.marks[i];
        if (x < a.x || y < a.y || x > a.x + a.w || y > a.y + a.h)
            continue;
        if (a.sweep > 0) {
            const dx = (x - 500) / 128, dy = (y - 145) / 128, radius = dx * dx + dy * dy;
            let angle = Math.atan2(dy, dx) - a.angle;
            while (angle < 0)
                angle += Math.PI * 2;
            if (radius < a.inner * a.inner || radius > 1 || angle > a.sweep)
                continue;
        }
        if (a.points.length > 0) {
            let inside = false;
            for (let j = 0, k = a.points.length - 2; j < a.points.length; k = j, j += 2) {
                const px = a.points[j], py = a.points[j + 1], qx = a.points[k], qy = a.points[k + 1];
                if ((py > y) !== (qy > y) && x < (qx - px) * (y - py) / (qy - py) + px)
                    inside = !inside;
            }
            if (!inside)
                continue;
        }
        const dx = x - a.x - a.w / 2, dy = y - a.y - a.h / 2, d = dx * dx + dy * dy;
        if (d < distance) {
            distance = d;
            best = i;
        }
    }
    return best;
}
export class CandleViewport {
    count: i32 = 0;
    start: number = 0;
    span: number = 0;
    sync(count: i32): void {
        const follow = this.start + this.span >= this.count - 0.5, all = this.span >= this.count;
        this.count = Math.max(0, count);
        this.span = all ? this.count : Math.min(this.count, Math.max(1, this.span));
        this.start = follow ? Math.max(0, this.count - this.span) : clampChart(this.start, 0, Math.max(0, this.count - this.span));
    }
    fit(): void { this.start = 0; this.span = this.count; }
    zoom(factor: number, anchor: number): void {
        const at = this.start + clampChart(anchor, 0, 1) * this.span;
        this.span = clampChart(this.span * factor, Math.min(3, this.count), this.count);
        this.start = clampChart(at - anchor * this.span, 0, Math.max(0, this.count - this.span));
    }
    pan(delta: number): void { this.start = clampChart(this.start + delta, 0, Math.max(0, this.count - this.span)); }
    show(index: i32): void { if (index < this.start)
        this.start = index;
    else if (index >= this.start + this.span)
        this.start = index - this.span + 1; this.start = clampChart(this.start, 0, Math.max(0, this.count - this.span)); }
}
export function candleChart(candles: Candle[], names: string[], overlays: ChartSeries[], view: CandleViewport, volume: boolean, ohlc: boolean, format: (v: number) => string, up: string, down: string): ChartModel {
    const m = new ChartModel();
    view.sync(candles.length);
    const begin = Math.floor(view.start), end = Math.min(candles.length, Math.ceil(view.start + view.span)), span = Math.max(1, end - begin);
    let low = Infinity, high = -Infinity, maxVolume = 0;
    for (let i = begin; i < end; i++) {
        const c = candles[i];
        if (Number.isFinite(c.low) && Number.isFinite(c.high)) {
            low = Math.min(low, c.low);
            high = Math.max(high, c.high);
        }
        maxVolume = Math.max(maxVolume, Number.isFinite(c.volume ?? 0) ? c.volume ?? 0 : 0);
    }
    const range = chartRange(low, high);
    axes(m, range, true, format);
    const volumeHeight = volume && maxVolume > 0 ? 45 : 0, priceHeight = 225 - volumeHeight;
    for (const s of m.shapes)
        s.y = 20 + (s.y - 20) * priceHeight / 225;
    const py = (v: number): number => 20 + (1 - clampChart((v - range.min) / (range.max - range.min), 0, 1)) * priceHeight;
    const buckets = Math.min(880, span), step = span / buckets, width = 880 / buckets;
    for (let bucket = 0; bucket < buckets; bucket++) {
        const first = begin + Math.floor(bucket * step), last = Math.min(end, begin + Math.floor((bucket + 1) * step));
        let open = NaN, close = NaN, hi = -Infinity, lo = Infinity, amount = 0;
        for (let i = first; i < last; i++) {
            const c = candles[i];
            if (![c.open, c.high, c.low, c.close].every((n: number) => Number.isFinite(n)))
                continue;
            if (!Number.isFinite(open))
                open = c.open;
            close = c.close;
            hi = Math.max(hi, c.high, c.open, c.close);
            lo = Math.min(lo, c.low, c.open, c.close);
            if (Number.isFinite(c.volume ?? 0))
                amount += Math.max(0, c.volume ?? 0);
        }
        if (!Number.isFinite(open))
            continue;
        const x = 90 + (bucket + 0.5) * width, color = close >= open ? up : down;
        path(m, [x, py(hi), x, py(lo)], color);
        if (ohlc) {
            path(m, [x - width * 0.35, py(open), x, py(open)], color);
            path(m, [x, py(close), x + width * 0.35, py(close)], color);
        }
        else
            shape(m, 'rect', x - width * 0.32, Math.min(py(open), py(close)), Math.max(0.6, width * 0.64), Math.max(1, Math.abs(py(open) - py(close))), color);
        if (volumeHeight > 0)
            shape(m, 'rect', x - width * 0.32, 245 - Math.min(1, amount / Math.max(1, maxVolume * (last - first))) * (volumeHeight - 5), Math.max(0.6, width * 0.64), Math.min(1, amount / Math.max(1, maxVolume * (last - first))) * (volumeHeight - 5), color, 95);
        const previous = first > 0 ? candles[first - 1].close : open, change = previous !== 0 ? (close - previous) / Math.abs(previous) * 100 : 0;
        const hit = mark(m, first, (labelAt(names, first)) + (last - first > 1 ? ' — ' + (labelAt(names, last - 1)) : ''), 'O ' + format(open) + ' · H ' + format(hi) + ' · L ' + format(lo) + ' · C ' + format(close) + ' · ' + (change >= 0 ? '+' : '') + chartNumber(change) + '% · V ' + chartNumber(amount), x - width / 2, 20, width, 225);
        hit.last = last - 1;
        hit.guideX = x;
    }
    for (const s of overlays.slice(0, 16)) {
        const points: number[] = [];
        for (let i = begin; i < end; i += Math.max(1, Math.floor(span / 880))) {
            const v = i < s.values.length ? s.values[i] : NaN;
            if (!Number.isFinite(v))
                continue;
            points.push(90 + (i - begin + 0.5) / span * 880);
            points.push(py(v));
        }
        path(m, points, s.color ?? 'accent');
        m.legend.push({ label: s.name, value: 0, color: s.color ?? 'accent' });
    }
    if (end > begin && Number.isFinite(candles[end - 1].close)) {
        const close = candles[end - 1].close, y = py(close);
        for (let x = 90; x < 970; x += 18)
            shape(m, 'rect', x, y, 9, 0.8, 'mutedForeground');
        text(m, format(close), 970, y - 15, 'right', 'foreground');
    }
    const skip = Math.max(1, Math.ceil(span / 6));
    for (let i = begin; i < end; i += skip)
        text(m, labelAt(names, i), 90 + (i - begin + 0.5) / span * 880, 264, 'center');
    return m;
}
export function gaugeChart(value: number, min: number, max: number, sweepDegrees: number, ticks: i32, bands: GaugeBand[], target: number | undefined, needle: boolean, unit: string, format: (v: number) => string): ChartModel {
    min = Number.isFinite(min) ? min : 0;
    max = Number.isFinite(max) && max > min ? max : min + 1;
    const m = new ChartModel(), range = Math.max(1e-12, max - min), ratio = Number.isFinite(value) ? clampChart((value - min) / range, 0, 1) : 0;
    const sweep = clampChart(sweepDegrees, 90, 300) * Math.PI / 180, start = Math.PI / 2 + (Math.PI * 2 - sweep) / 2;
    path(m, arc(500, 150, 105, start, sweep), 'muted', false, 255, needle ? 9 : 18);
    let previous = 0, tone = 'accent';
    for (const band of bands.slice(0, 32)) {
        const end = clampChart((band.to - min) / range, previous, 1), color = band.tone === 'danger' ? 'destructive' : band.tone === 'warning' ? 'warningSoftForeground' : band.tone === 'success' ? 'success' : 'accent';
        path(m, arc(500, 150, 105, start + previous * sweep, (end - previous) * sweep), color, false, needle ? 255 : 75, needle ? 9 : 18);
        if (ratio >= previous && ratio <= end)
            tone = color;
        previous = end;
    }
    if (ticks >= 0)
        for (let i = 0; i <= Math.min(10, Math.max(1, ticks)); i++) {
            const divisions = Math.min(10, Math.max(1, ticks)), angle = start + i / divisions * sweep;
            text(m, format(min + i / divisions * range), 500 + Math.cos(angle) * 132, 145 + Math.sin(angle) * 130, 'center');
            for (let minor = 0; minor < (i === divisions ? 1 : 5); minor++) {
                const a = angle + minor / (divisions * 5) * sweep;
                path(m, [500 + Math.cos(a) * 91, 150 + Math.sin(a) * 91, 500 + Math.cos(a) * (minor === 0 ? 100 : 96), 150 + Math.sin(a) * (minor === 0 ? 100 : 96)], 'mutedForeground');
            }
        }
    if (target !== undefined && Number.isFinite(target)) {
        const angle = start + clampChart((target - min) / range, 0, 1) * sweep;
        path(m, [500 + Math.cos(angle) * 94, 150 + Math.sin(angle) * 94, 500 + Math.cos(angle) * 116, 150 + Math.sin(angle) * 116], 'foreground', false, 255, 2.5);
    }
    const moving = shape(m, needle ? 'needle' : 'dial', 500, 150, 105, 0, tone);
    moving.points = [start, sweep, min, max];
    moving.drawing = needle ? [0, 0, 0, 0] : arc(500, 150, 105, start, sweep);
    moving.width = needle ? 2.5 : 18;
    if (needle)
        shape(m, 'circle', 494, 144, 12, 12, tone);
    text(m, format(value) + unit, 500, needle ? 202 : 145, 'center', tone);
    m.description = format(value) + unit + ' · range ' + format(min) + ' — ' + format(max) + (target !== undefined ? ' · target ' + format(target) : '');
    mark(m, 0, 'Value', m.description, 360, 10, 280, 270);
    return m;
}
export class SankeyLayout {
    nodes: ChartRect[] = [];
    links: ChartShape[] = [];
    values: number[] = [];
}
export function sankeyLayout(count: i32, links: SankeyLink[], nodeWidth: number = 22): SankeyLayout {
    const out = new SankeyLayout(), n = Math.min(256, Math.max(0, count)), incoming: number[] = [], outgoing: number[] = [], indegree: i32[] = [], layers: i32[] = [], queue: i32[] = [];
    for (let i = 0; i < n; i++) {
        incoming.push(0);
        outgoing.push(0);
        indegree.push(0);
        layers.push(0);
    }
    for (const link of links.slice(0, 2048))
        if (link.from >= 0 && link.from < n && link.to >= 0 && link.to < n && Number.isFinite(link.value) && link.value > 0) {
            outgoing[link.from] += link.value;
            incoming[link.to] += link.value;
            indegree[link.to]++;
        }
    for (let i = 0; i < n; i++)
        if (indegree[i] === 0)
            queue.push(i);
    for (let at = 0; at < queue.length; at++)
        for (const link of links.slice(0, 2048))
            if (link.from === queue[at] && link.to >= 0 && link.to < n && Number.isFinite(link.value) && link.value > 0) {
                layers[link.to] = Math.max(layers[link.to], layers[link.from] + 1);
                indegree[link.to]--;
                if (indegree[link.to] === 0)
                    queue.push(link.to);
            }
    // Cyclic components stay in a bounded column; their feedback ribbons remain visible.
    let columns: i32 = 1;
    for (let i = 0; i < n; i++) {
        if (indegree[i] > 0)
            layers[i] = 0;
        columns = Math.max(columns, layers[i] + 1);
        out.values.push(Math.max(incoming[i], outgoing[i]));
    }
    let scale = Infinity;
    for (let layer = 0; layer < columns; layer++) {
        let sum = 0, size: i32 = 0;
        for (let i = 0; i < n; i++)
            if (layers[i] === layer) {
                sum += out.values[i];
                size++;
            }
        if (sum > 0)
            scale = Math.min(scale, Math.max(5, 250 - (size - 1) * 10) / sum);
    }
    if (!Number.isFinite(scale))
        scale = 0;
    const cursor: number[] = [];
    for (let i = 0; i < columns; i++)
        cursor.push(10);
    for (let i = 0; i < n; i++) {
        const h = Math.max(2, out.values[i] * scale), x = columns < 2 ? 500 : 90 + layers[i] / (columns - 1) * (880 - nodeWidth), y = cursor[layers[i]];
        out.nodes.push({ index: i, x, y, w: nodeWidth, h });
        cursor[layers[i]] += h + 10;
    }
    const fromOffset: number[] = [], toOffset: number[] = [];
    for (let i = 0; i < n; i++) {
        fromOffset.push(0);
        toOffset.push(0);
    }
    for (let i = 0; i < Math.min(2048, links.length); i++) {
        const link = links[i];
        if (link.from < 0 || link.from >= n || link.to < 0 || link.to >= n || !Number.isFinite(link.value) || link.value <= 0)
            continue;
        const a = out.nodes[link.from], b = out.nodes[link.to], x0 = a.x + a.w, x1 = b.x, y0 = a.y + fromOffset[link.from], y1 = b.y + toOffset[link.to], h = Math.max(0.5, link.value * scale), bend = Math.max(35, Math.abs(x1 - x0) * 0.45), points: number[] = [];
        for (let edge = 0; edge < 2; edge++)
            for (let k = 0; k <= 20; k++) {
                const t = edge === 0 ? k / 20 : 1 - k / 20, u = 1 - t;
                points.push(u * u * u * x0 + 3 * u * u * t * (x0 + bend) + 3 * u * t * t * (x1 - bend) + t * t * t * x1);
                points.push(u * u * u * (y0 + edge * h) + 3 * u * u * t * (y0 + edge * h) + 3 * u * t * t * (y1 + edge * h) + t * t * t * (y1 + edge * h));
            }
        const ribbon = new ChartShape();
        ribbon.kind = 'polygon';
        ribbon.points = points;
        ribbon.drawing = points.slice();
        ribbon.x = i;
        out.links.push(ribbon);
        fromOffset[link.from] += h;
        toOffset[link.to] += h;
    }
    return out;
}
export function sankeyChart(names: string[], links: SankeyLink[], format: (v: number) => string, nodeWidth: number): ChartModel {
    const m = new ChartModel(), layout = sankeyLayout(names.length, links, nodeWidth);
    for (const ribbon of layout.links) {
        const index = Math.round(ribbon.x), link = links[index];
        ribbon.from = link.from; ribbon.to = link.to; ribbon.selection = names.length + index;
        ribbon.color = 'accent';
        ribbon.alpha = 55;
        m.shapes.push(ribbon);
        let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
        for (let i = 0; i < ribbon.points.length; i += 2) {
            x = Math.min(x, ribbon.points[i]);
            y = Math.min(y, ribbon.points[i + 1]);
            right = Math.max(right, ribbon.points[i]);
            bottom = Math.max(bottom, ribbon.points[i + 1]);
        }
        const hit = mark(m, names.length + index, names[link.from] + ' → ' + names[link.to], format(link.value) + ' · ' + chartNumber(layout.values[link.from] > 0 ? link.value / layout.values[link.from] * 100 : 0) + '% of source', x, y, right - x, bottom - y);
        hit.points = ribbon.points;
    }
    for (const box of layout.nodes) {
        const value = layout.values[box.index];
        shape(m, 'rect', box.x, box.y, box.w, box.h, 'mutedForeground');
        if (box.h >= 18)
            text(m, names[box.index], box.x < 500 ? box.x + box.w + 6 : box.x - 6, box.y + Math.min(box.h / 2, 20) - 5, box.x < 500 ? 'left' : 'right', 'foreground', 210);
        mark(m, box.index, names[box.index], format(value), box.x, box.y, box.w, box.h);
    }
    return m;
}
