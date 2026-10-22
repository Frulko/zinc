// Dashboard: an arc gauge with three readings beside it, and a streaming line chart. The gauge eases toward each new value and the line
// moves 30 times a second between the samples, so nothing jumps; LVGL redraws only the gauge, the values that changed and the chart. The
// line's points are the state's, so the page shows the last four seconds when it is built again.
import * as lv from 'zinc:lvgl';
import { COLOR_ACCENT, COLOR_BORDER, COLOR_COOL, COLOR_GOOD, COLOR_HOT, COLOR_MUTED, COLOR_MUTED_TEXT, COLOR_TEXT } from '../constants';
import { badge, card, row, text } from '../components/ui';
import { HISTORY, clockText, state } from '../state';

let gauge: i32 = 0;
let gaugeValue: i32 = 0;
let temperature: i32 = 0;
let humidity: i32 = 0;
let uptime: i32 = 0;
let throughput: i32 = 0;
let chart: i32 = 0;
let series: i32 = 0;
let shownLoad: i32 = -1;
let shownPercent: i32 = -1;
let shownReadings: i32 = -1;
let shownSecond: i32 = -1;
let shownPoints: i32 = 0;

function reading(parent: i32, name: string, dot: i32): i32 {
  const box = lv.obj(parent);
  lv.size(box, lv.pct(100), lv.SIZE_CONTENT);
  lv.style(box, lv.BG_OPA, 0, 0);
  lv.style(box, lv.BORDER_WIDTH, 0, 0);
  lv.pad(box, 0);
  lv.gap(box, 0, 5);
  lv.flex(box, lv.FLEX_ROW_WRAP, lv.FLEX_START, lv.FLEX_CENTER);
  lv.flag(box, lv.FLAG_SCROLLABLE, false);
  const d = lv.obj(box);
  lv.size(d, 6, 6);
  lv.radius(d, 3, 0);
  lv.bg(d, dot, 0);
  lv.style(d, lv.BORDER_WIDTH, 0, 0);
  const n = text(box, name, 12, COLOR_MUTED_TEXT);
  lv.grow(n, 1);
  const v = text(box, '', 14, COLOR_TEXT);
  lv.size(v, lv.pct(100), lv.SIZE_CONTENT);
  return v;
}

export function buildDashboard(page: i32): void {
  shownLoad = -1; shownPercent = -1; shownReadings = -1; shownSecond = -1;
  const top = card(page);
  lv.flex(top, lv.FLEX_ROW, lv.FLEX_START, lv.FLEX_CENTER);
  gauge = lv.arc(top, 0, 1000, 420);   // tenths of a percent: the arc moves by less than a pixel a frame
  lv.size(gauge, 92, 92);
  lv.flag(gauge, lv.FLAG_CLICKABLE, false);
  lv.style(gauge, lv.ARC_WIDTH, 8, lv.PART_MAIN);
  lv.style(gauge, lv.ARC_WIDTH, 8, lv.PART_INDICATOR);
  lv.color(gauge, lv.ARC_COLOR, COLOR_MUTED, lv.PART_MAIN);
  lv.color(gauge, lv.ARC_COLOR, COLOR_ACCENT, lv.PART_INDICATOR);
  lv.style(gauge, lv.BG_OPA, 0, lv.PART_KNOB);
  lv.pad(gauge, 0);
  gaugeValue = text(gauge, '', 20, COLOR_TEXT);
  lv.align(gaugeValue, lv.ALIGN_CENTER, 0, 0);
  const readings = lv.obj(top);
  lv.size(readings, 0, lv.SIZE_CONTENT);
  lv.grow(readings, 1);
  lv.style(readings, lv.BG_OPA, 0, 0);
  lv.style(readings, lv.BORDER_WIDTH, 0, 0);
  lv.pad(readings, 0);
  lv.gap(readings, 6, 0);
  lv.flex(readings, lv.FLEX_COLUMN, lv.FLEX_START, lv.FLEX_START);
  lv.flag(readings, lv.FLAG_SCROLLABLE, false);
  temperature = reading(readings, 'Temperature', COLOR_HOT);
  humidity = reading(readings, 'Humidity', COLOR_COOL);
  uptime = reading(readings, 'Uptime', COLOR_GOOD);

  const bottom = card(page);
  if (lv.width() > lv.height()) lv.size(bottom, lv.pct(100), 132);   // turned: the page scrolls, the chart keeps its height
  else lv.grow(bottom, 1);
  const head = row(bottom);
  text(head, 'Throughput', 12, COLOR_MUTED_TEXT);
  throughput = text(head, '', 14, COLOR_TEXT);
  lv.grow(throughput, 1);
  badge(head, 'Live', 0x064e3b, 0x6ee7b7);
  chart = lv.chart(bottom, lv.CHART_LINE, HISTORY, 0, 100);   // about 1.7 px a point
  lv.size(chart, lv.pct(100), 0);
  lv.grow(chart, 1);
  lv.style(chart, lv.BG_OPA, 0, 0);
  lv.style(chart, lv.BORDER_WIDTH, 0, 0);
  lv.pad(chart, 0);
  lv.color(chart, lv.LINE_COLOR, COLOR_BORDER, lv.PART_MAIN);
  lv.style(chart, lv.WIDTH, 0, lv.PART_INDICATOR);   // no dot on each point
  lv.style(chart, lv.HEIGHT, 0, lv.PART_INDICATOR);
  lv.style(chart, lv.LINE_WIDTH, 2, lv.PART_ITEMS);
  series = lv.chartSeries(chart, COLOR_ACCENT);
  shownPoints = state.points - HISTORY;
  updateDashboard(0);
}

export function updateDashboard(dt: number): void {
  const load = Math.round(state.load.value * 1000);
  if (load !== shownLoad) { lv.setValue(gauge, load, false); shownLoad = load; }
  const percent = Math.round(load / 10);
  if (percent !== shownPercent) { lv.setText(gaugeValue, percent + '%'); shownPercent = percent; }
  if (state.readings !== shownReadings) {
    lv.setText(temperature, state.temperature.toFixed(1) + '°C');
    lv.setText(humidity, state.humidity + ' %');
    lv.setText(throughput, state.throughput + ' kB/s');
    shownReadings = state.readings;
  }
  const second = Math.floor(state.uptime);
  if (second !== shownSecond) { lv.setText(uptime, clockText(state.uptime)); shownSecond = second; }
  if (shownPoints < state.points - HISTORY) shownPoints = state.points - HISTORY;
  for (; shownPoints < state.points; shownPoints++) lv.chartPush(chart, series, Math.round(state.history[(shownPoints + HISTORY) % HISTORY]));
}
