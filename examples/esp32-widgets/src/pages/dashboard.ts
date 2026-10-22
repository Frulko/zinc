// Dashboard: an arc gauge with three readings beside it, and a streaming line chart. The values change four times a second, so LVGL redraws
// only the gauge, the three values and the chart.
import * as lv from 'zinc:lvgl';
import { COLOR_ACCENT, COLOR_BORDER, COLOR_COOL, COLOR_GOOD, COLOR_HOT, COLOR_MUTED, COLOR_MUTED_TEXT, COLOR_TEXT } from '../constants';
import { badge, card, row, text } from '../components/ui';
import { clockText, state } from '../state';

const REFRESH: number = 0.25;
let gauge: i32 = 0;
let gaugeValue: i32 = 0;
let temperature: i32 = 0;
let humidity: i32 = 0;
let uptime: i32 = 0;
let throughput: i32 = 0;
let chart: i32 = 0;
let series: i32 = 0;
let clock: number = 0;

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
  const top = card(page);
  lv.flex(top, lv.FLEX_ROW, lv.FLEX_START, lv.FLEX_CENTER);
  gauge = lv.arc(top, 0, 100, 42);
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
  lv.grow(bottom, 1);
  const head = row(bottom);
  text(head, 'Throughput', 12, COLOR_MUTED_TEXT);
  throughput = text(head, '', 14, COLOR_TEXT);
  lv.grow(throughput, 1);
  badge(head, 'Live', 0x064e3b, 0x6ee7b7);
  chart = lv.chart(bottom, lv.CHART_LINE, 40, 0, 240);
  lv.size(chart, lv.pct(100), 0);
  lv.grow(chart, 1);
  lv.style(chart, lv.BG_OPA, 0, 0);
  lv.style(chart, lv.BORDER_WIDTH, 0, 0);
  lv.pad(chart, 0);
  lv.color(chart, lv.LINE_COLOR, COLOR_BORDER, lv.PART_MAIN);
  lv.style(chart, lv.WIDTH, 0, lv.PART_INDICATOR);
  lv.style(chart, lv.HEIGHT, 0, lv.PART_INDICATOR);
  lv.style(chart, lv.LINE_WIDTH, 2, lv.PART_ITEMS);
  series = lv.chartSeries(chart, COLOR_ACCENT);
  for (let i = 0; i < 40; i++) lv.chartPush(chart, series, 120);
  updateDashboard(REFRESH);
}

export function updateDashboard(dt: number): void {
  clock += dt;
  if (clock < REFRESH) return;
  clock = 0;
  const load = Math.round(state.load);
  lv.setValue(gauge, load, false);
  lv.setText(gaugeValue, load + '%');
  lv.setText(temperature, Math.round(state.temperature * 10) / 10 + '\u00B0C');
  lv.setText(humidity, state.humidity + ' %');
  lv.setText(uptime, clockText(state.uptime));
  lv.setText(throughput, state.throughput + ' kB/s');
  lv.chartPush(chart, series, state.throughput);
}
