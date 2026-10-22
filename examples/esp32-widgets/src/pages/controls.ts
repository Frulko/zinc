// Controls: the input widgets on one page that scrolls with LVGL's inertia and elastic ends. Buttons, sliders, switches, check boxes, radio
// buttons, a spinner with a progress bar, and a PIN keypad (an LVGL button matrix: one object for twelve keys).
import * as lv from 'zinc:lvgl';
import { COLOR_ACCENT, COLOR_DANGER, COLOR_GOOD, COLOR_MUTED, COLOR_MUTED_TEXT, COLOR_TEXT, PIN_CODE } from '../constants';
import { badge, card, caption, kitButton, row, text } from '../components/ui';
import { pressKey, state } from '../state';

const QUALITY: string[] = ['Low', 'Mid', 'High'];
let tapsLabel: i32 = 0;
let syncLabel: i32 = 0;
let syncBar: i32 = 0;
let keypad: i32 = 0;
let pinStatus: i32 = 0;
let dots: i32[] = [];
let radios: i32[] = [];
let clock: number = 0;

function showTaps(): void { lv.setText(tapsLabel, state.taps + ' taps'); }

function showPin(): void {
  for (let i = 0; i < dots.length; i++) lv.bg(dots[i], state.unlocked ? COLOR_GOOD : i < state.pin.length ? COLOR_ACCENT : COLOR_MUTED, 0);
  lv.setText(pinStatus, state.unlocked ? 'Unlocked' : 'Code: ' + PIN_CODE);
  lv.textColor(pinStatus, state.unlocked ? COLOR_GOOD : COLOR_MUTED_TEXT, 0);
}

function sliderRow(parent: i32, name: string, value: i32, step: i32): void {
  const head = row(parent);
  text(head, name, 12, COLOR_TEXT);
  const shown = text(head, '' + value, 12, COLOR_MUTED_TEXT);
  const s = lv.slider(parent, 0, 100, value);
  lv.size(s, lv.pct(100), 8);
  lv.on(s, lv.EVENT_VALUE_CHANGED, () => {
    let v = lv.value(s);
    if (step > 1) { v = Math.round(v / step) * step; lv.setValue(s, v, false); }
    lv.setText(shown, '' + v);
  });
}

function switchRow(parent: i32, name: string, on: boolean): void {
  const r = row(parent);
  text(r, name, 14, COLOR_TEXT);
  const s = lv.toggle(r, on);
  lv.size(s, 40, 22);
}

export function buildControls(page: i32): void {
  dots = []; radios = [];
  // buttons
  const buttons = card(page);
  const head = row(buttons);
  caption(head, 'BUTTONS');
  tapsLabel = badge(head, '', 0x1e3a8a, 0xbfdbfe);
  showTaps();
  const actions = row(buttons);
  const tap = kitButton(actions, 'Tap me', COLOR_ACCENT, false);
  lv.grow(tap, 1);
  const reset = kitButton(actions, 'Reset', 0, true);
  const del = kitButton(actions, 'Del', COLOR_DANGER, false);
  lv.on(tap, lv.EVENT_CLICKED, () => { state.taps++; showTaps(); });
  lv.on(reset, lv.EVENT_CLICKED, () => { state.taps = 0; showTaps(); });
  lv.on(del, lv.EVENT_CLICKED, () => { state.taps = Math.max(0, state.taps - 1); showTaps(); });

  // sliders
  const sliders = card(page);
  caption(sliders, 'SLIDERS');
  sliderRow(sliders, 'Volume', 60, 1);
  sliderRow(sliders, 'Warmth (steps of 10)', 40, 10);

  // toggles, check boxes, radio buttons
  const toggles = card(page);
  caption(toggles, 'TOGGLES');
  switchRow(toggles, 'Wi-Fi', true);
  switchRow(toggles, 'Bluetooth', false);
  lv.checkbox(toggles, 'Notifications', true);
  lv.checkbox(toggles, 'Automatic updates', false);
  caption(toggles, 'QUALITY');
  const quality = row(toggles);
  for (let i = 0; i < QUALITY.length; i++) {
    const r = lv.checkbox(quality, QUALITY[i], i === 1);
    lv.radius(r, 9, lv.PART_INDICATOR);   // a round box: a radio button
    radios.push(r);
    lv.on(r, lv.EVENT_VALUE_CHANGED, () => {
      for (let j = 0; j < radios.length; j++) lv.state(radios[j], lv.STATE_CHECKED, radios[j] === r);
    });
  }

  // activity
  const activity = card(page);
  caption(activity, 'ACTIVITY');
  const line = row(activity);
  lv.flex(line, lv.FLEX_ROW, lv.FLEX_START, lv.FLEX_CENTER);
  const spin = lv.spinner(line);
  lv.size(spin, 28, 28);
  lv.style(spin, lv.ARC_WIDTH, 4, lv.PART_MAIN);
  lv.style(spin, lv.ARC_WIDTH, 4, lv.PART_INDICATOR);
  const column = lv.obj(line);
  lv.size(column, 0, lv.SIZE_CONTENT);
  lv.grow(column, 1);
  lv.style(column, lv.BG_OPA, 0, 0);
  lv.style(column, lv.BORDER_WIDTH, 0, 0);
  lv.pad(column, 0);
  lv.gap(column, 4, 0);
  lv.flex(column, lv.FLEX_COLUMN, lv.FLEX_START, lv.FLEX_START);
  lv.flag(column, lv.FLAG_SCROLLABLE, false);
  syncLabel = text(column, 'Syncing', 12, COLOR_TEXT);
  syncBar = lv.bar(column, 0, 100, 0);
  lv.size(syncBar, lv.pct(100), 6);

  // the PIN keypad
  const pin = card(page);
  const pinHead = row(pin);
  caption(pinHead, 'KEYPAD');
  pinStatus = text(pinHead, '', 12, COLOR_MUTED_TEXT);
  const dotRow = row(pin);
  lv.flex(dotRow, lv.FLEX_ROW, lv.FLEX_CENTER, lv.FLEX_CENTER);
  lv.gap(dotRow, 8, 8);
  for (let i = 0; i < 4; i++) {
    const d = lv.obj(dotRow);
    lv.size(d, 12, 12);
    lv.radius(d, 6, 0);
    lv.style(d, lv.BORDER_WIDTH, 0, 0);
    dots.push(d);
  }
  keypad = lv.buttonMatrix(pin, '1|2|3\n4|5|6\n7|8|9\nC|0|OK');
  lv.size(keypad, lv.pct(100), 156);
  lv.pad(keypad, 0);
  lv.gap(keypad, 6, 6);
  lv.style(keypad, lv.BG_OPA, 0, 0);
  lv.style(keypad, lv.BORDER_WIDTH, 0, 0);
  lv.radius(keypad, 6, lv.PART_ITEMS);
  lv.on(keypad, lv.EVENT_VALUE_CHANGED, () => {
    const i = lv.selected(keypad);
    if (i < 0) return;
    pressKey(lv.buttonText(keypad, i));
    showPin();
  });
  showPin();
}

export function updateControls(dt: number): void {
  clock += dt;
  if (clock < 0.1) return;
  clock = 0;
  const pct = Math.round(state.sync * 100);
  lv.setValue(syncBar, pct, false);
  lv.setText(syncLabel, 'Syncing ' + pct + '%');
}
