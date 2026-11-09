/** @jsxHelpers zinc:ui/kit/host */
import * as ui from 'zinc:ui';
import { componentSignal } from 'zinc:ui/kit/host';
import { LineChart, BarChart, DonutChart, Heatmap, CandlestickChart, RadialGauge, useQuietTheme, setThemeAccent } from 'zinc:ui/kit';
import { equal, ok } from 'zinc:assert';
useQuietTheme();
setThemeAccent('blue');
let frame: i32 = 0, picked: i32 = -1, series: i32 = -1, picks: i32 = 0;
let clear: () => void = () => { }, restore: () => void = () => { };
export function App(): i32 {
    const [empty, setEmpty] = componentSignal(false), [load, setLoad] = componentSignal<number>(70);
    clear = () => { setEmpty(true); setLoad(40); };
    restore = () => { setEmpty(false); setLoad(90); };
    const select = (i: i32, s: i32): void => { picked = i; series = s; picks++; };
    return <View className="flex-col gap-2 p-2">
    <View className="flex-row gap-3"><LineChart label="Series" width={310} height={120} labels={['Mon', 'Tue', 'Wed']} series={() => empty() ? [] : [{ name: 'Builds', values: [10, 20, 30] }]} onSelect={select}/><BarChart label="Bars" width={310} height={120} series={() => [{ name: 'Up', values: [4, -2] }, { name: 'Down', values: [3, -5] }]} stacked onSelect={select}/></View>
    <View className="flex-row gap-3"><DonutChart label="Share" width={310} height={120} items={() => [{ label: 'Linux', value: 2 }, { label: 'Mac', value: 1 }]} onSelect={select}/><Heatmap label="Heat" width={310} height={120} rows={2} columns={2} values={() => [1, 2, 3, 4]} onSelect={select}/></View>
    <View className="flex-row gap-3"><CandlestickChart label="Prices" width={310} height={120} candles={() => [{ open: 10, high: 20, low: 5, close: 15, volume: 20 }, { open: 15, high: 18, low: 12, close: 13, volume: 10 }, { open: 13, high: 21, low: 12, close: 20, volume: 30 }, { open: 20, high: 22, low: 19, close: 21, volume: 25 }]} onSelect={select}/><RadialGauge label="Load" width={310} height={120} value={load} unit="%" target={80}/></View>
  </View>;
}
function find(h: i32, label: string): i32 {
    const node = ui.inspectNode(h);
    if (node === null)
        return -1;
    if (node.label.startsWith(label + '. '))
        return h;
    for (const child of node.children) {
        const result = find(child, label);
        if (result >= 0)
            return result;
    }
    return -1;
}
export function advance(dt: number): void {
    frame++;
    if (frame === 2) {
        const chart = find(ui.rootNode(), 'Series');
        ok(chart >= 0, 'actual chart focus target');
        ui.focusNode(chart);
        ui.sendKey('Home');
        ui.sendKey('ArrowRight');
        ui.sendKey('Enter');
        equal(picked, 1);
        equal(series, 0);
        equal(picks, 1, 'same-frame live inspection');
        ui.sendKey('End');
        ui.sendKey(' ');
        equal(picked, 2);
        ui.sendKey('Escape');
    }
    if (frame === 3) {
        const chart = find(ui.rootNode(), 'Bars');
        ui.focusNode(chart);
        ui.sendKey('End');
        ui.sendKey('Enter');
        equal(picked, 1, 'stacked bars retain sample index');
        const share = find(ui.rootNode(), 'Share');
        ui.focusNode(share);
        ui.sendKey('Home');
        ui.sendKey('ArrowRight');
        ui.sendKey('Enter');
        equal(picked, 1, 'donut keyboard segment');
        const heat = find(ui.rootNode(), 'Heat');
        ui.focusNode(heat);
        ui.sendKey('End');
        ui.sendKey('Enter');
        equal(picked, 3, 'heatmap keyboard cell');
    }
    if (frame === 4) {
        const chart = find(ui.rootNode(), 'Series'), box = ui.screenBox(chart);
        ui.pointerAt(box[0] + box[2] * 0.53, box[1] + box[3] * 0.4, false);
        ui.pointerAt(box[0] + box[2] * 0.53, box[1] + box[3] * 0.4, true);
        ui.pointerAt(box[0] + box[2] * 0.53, box[1] + box[3] * 0.4, false);
    }
    if (frame === 5) {
        equal(picked, 1, 'pointer shares model hit geometry');
        const chart = find(ui.rootNode(), 'Prices');
        ui.focusNode(chart);
        ui.sendKey('+');
        ui.sendKey('+');
        ui.sendKey('Home');
        ui.sendKey('End');
        ui.sendKey('Enter');
        equal(picked, 3, 'zoomed global End follows original index');
        ui.sendKey('0');
        ui.sendKey('End');
        ui.sendKey('Enter');
        equal(picked, 3, 'candlestick fit and inspect');
        clear();
        ui.systemSignal('reducemotion 1');
    }
    if (frame === 6) {
        const chart = find(ui.rootNode(), 'Series');
        ok(ui.inspectNode(chart)!.label.includes('No data'), 'empty replacement clears data');
        ui.focusNode(chart);
        const before = picks;
        ui.sendKey('Enter');
        equal(picks, before, 'empty chart has no stale activation');
        restore();
    }
    if (frame === 7) {
        const chart = find(ui.rootNode(), 'Series');
        ui.focusNode(chart);
        ui.sendKey('Home');
        ui.sendKey('Enter');
        equal(picked, 0, 'data returns after empty state');
        ok(ui.inspectNode(find(ui.rootNode(), 'Load'))!.label.includes('90%'), 'live reduced-motion gauge reports final value');
        ui.destroy(ui.rootNode());
        console.log('kit charts: pass');
    }
}
