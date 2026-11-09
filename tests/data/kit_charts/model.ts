import { equal, ok } from 'zinc:assert';
import { ChartModel, chartRange, chartNumber, waffleCounts, treemapLayout, sankeyLayout, hitChart, seriesChart, donutChart, heatmapChart, radarChart, scatterChart, candleChart, gaugeChart, funnelChart, waffleChart, treemapChart, sankeyChart, CandleViewport, Candle } from '../../../lib/std/kit/chart-model';
function near(a: number, b: number): void { ok(Math.abs(a - b) < 0.001, String(a) + ' != ' + b); }
function finite(model: ChartModel): void {
    for (const shape of model.shapes) {
        ok(Number.isFinite(shape.x) && Number.isFinite(shape.y) && Number.isFinite(shape.w) && Number.isFinite(shape.h), 'finite shape');
        for (const p of shape.points)
            ok(Number.isFinite(p), 'finite path');
    }
}
const range = chartRange(-3, 17);
ok(range.min <= -3 && range.max >= 17 && range.step > 0);
const fixed = chartRange(0, 1, -10, 10);
equal(fixed.min, -10);
equal(fixed.max, 10);
const flat = chartRange(0, 0);
ok(flat.max > flat.min);
equal(chartNumber(NaN), '—');
equal(chartNumber(1500), '1.5k');
const counts = waffleCounts([1, 1, 1], 100);
equal(counts.join(','), '34,33,33');
equal(waffleCounts([0, NaN, -1], 100).join(','), '0,0,0');
const boxes = treemapLayout([6, 3, 1, 0, NaN, -8], 1000, 400);
equal(boxes.length, 3);
let area = 0;
for (const b of boxes) {
    area += b.w * b.h;
    ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 1000.001 && b.y + b.h <= 400.001);
}
near(area, 400000);
near(boxes[0].w * boxes[0].h, 240000);
for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        ok(Math.min(a.x + a.w, b.x + b.w) <= Math.max(a.x, b.x) + 0.001 || Math.min(a.y + a.h, b.y + b.h) <= Math.max(a.y, b.y) + 0.001, 'treemap does not overlap');
    }
const flow = sankeyLayout(4, [{ from: 0, to: 2, value: 30 }, { from: 1, to: 2, value: 20 }, { from: 2, to: 3, value: 50 }]);
equal(flow.nodes.length, 4);
equal(flow.links.length, 3);
equal(flow.values[2], 50);
ok(flow.nodes[2].x > flow.nodes[0].x && flow.nodes[3].x > flow.nodes[2].x);
near(flow.nodes[0].h + flow.nodes[1].h, flow.nodes[2].h);
const cycle = sankeyLayout(2, [{ from: 0, to: 1, value: 1 }, { from: 1, to: 0, value: 1 }, { from: 90, to: 0, value: 1 }]);
equal(cycle.links.length, 2);
for (const link of cycle.links)
    for (const p of link.points)
        ok(Number.isFinite(p));
const series = [{ name: 'A', values: [3, -2, NaN, 8] }, { name: 'B', values: [2, -4] }];
for (const kind of ['line', 'area', 'bar']) {
    const m = seriesChart(series, [], kind, true, true, true, [], chartNumber);
    finite(m);
    equal(m.marks.length, 3);
    equal(hitChart(m, m.marks[0].x + 1, 100), 0);
    equal(hitChart(m, -1, -1), -1);
}
const donut = donutChart([{ label: 'A', value: 2 }, { label: 'B', value: 1 }, { label: 'invalid', value: NaN }], chartNumber);
finite(donut);
equal(hitChart(donut, 500, 145), -1, 'donut hole');
ok(hitChart(donut, 500, 25) >= 0);
const items = [{ label: 'A', value: 6 }, { label: 'B', value: 3 }, { label: 'C', value: 1 }];
for (const m of [treemapChart(items, chartNumber), waffleChart(items, 10, 10, chartNumber), funnelChart(items, chartNumber), heatmapChart([0, 1, NaN, 3], 2, 2, [], [], chartNumber), radarChart([{ name: 'A', values: [2, 4, 6] }], ['X', 'Y', 'Z'], [], 10, chartNumber), scatterChart([{ name: 'A', points: [{ x: 1, y: 2 }, { x: 3, y: 4, size: 10 }] }], [], chartNumber, chartNumber, 'X', 'Y'), gaugeChart(76, 0, 100, 240, 5, [{ to: 80, tone: 'success' }], 90, true, '%', chartNumber), sankeyChart(['A', 'B'], [{ from: 0, to: 1, value: 10 }], chartNumber, 20)])
    finite(m);
const view = new CandleViewport();
view.sync(100);
equal(view.span, 100);
view.zoom(0.2, 1);
near(view.start, 80);
near(view.span, 20);
view.sync(110);
near(view.start, 90);
view.pan(-40);
view.sync(120);
near(view.start, 50);
view.show(2);
near(view.start, 2);
view.fit();
near(view.span, 120);
const candles: Candle[] = [];
for (let i = 0; i < 100000; i++)
    candles.push({ open: 10, high: 20 + i % 3, low: 5, close: 15, volume: 4 });
const large = new CandleViewport();
const candle = candleChart(candles, [], [], large, true, false, chartNumber, 'success', 'destructive');
finite(candle);
ok(candle.marks.length <= 880 && candle.marks.length > 0, 'pixel-column aggregation bounded');
ok(candle.marks[0].detail.includes('O 10') && candle.marks[0].detail.includes('C 15'));
console.log('chart models: pass');
