// Now playing: a cover in the track's colours, the title, a spectrum that dances while playing, a seek slider and the transport buttons.
import * as lv from 'zinc:lvgl';
import { COLOR_ACCENT, COLOR_MUTED, COLOR_MUTED_TEXT, COLOR_TEXT, SYMBOL_AUDIO, SYMBOL_NEXT, SYMBOL_PAUSE, SYMBOL_PLAY, SYMBOL_PREV } from '../constants';
import { row, text } from '../components/ui';
import { TRACKS, clockText, rand, seek, skip, state, togglePlay } from '../state';

const BARS: i32 = 24;
let cover: i32 = 0;
let status: i32 = 0;
let title: i32 = 0;
let artist: i32 = 0;
let count: i32 = 0;
let spectrum: i32 = 0;
let bars: i32 = 0;
let position: i32 = 0;
let elapsed: i32 = 0;
let remaining: i32 = 0;
let play: i32 = 0;
let playIcon: i32 = 0;
let shownTrack: i32 = -1;
let shownPlaying: boolean = false;
let clock: number = 0;
let level: number = 0;

function roundButton(parent: i32, symbol: string, size: i32, rgb: i32): i32 {
  const b = lv.button(parent, symbol);
  lv.size(b, size, size);
  lv.radius(b, size / 2, 0);
  lv.style(b, lv.SHADOW_WIDTH, 0, 0);
  if (rgb >= 0) lv.bg(b, rgb, 0);
  else lv.style(b, lv.BG_OPA, 0, 0);
  return b;
}

function showTrack(): void {
  const t = TRACKS[state.track];
  lv.color(cover, lv.BG_COLOR, t.from, 0);
  lv.color(cover, lv.BG_GRAD_COLOR, t.to, 0);
  lv.setText(title, t.title);
  lv.setText(artist, t.artist);
  lv.setText(count, 'Track ' + (state.track + 1) + ' of ' + TRACKS.length);
  shownTrack = state.track;
}

function showPlaying(): void {
  lv.setText(status, state.playing ? 'NOW PLAYING' : 'PAUSED');
  lv.textColor(status, state.playing ? COLOR_ACCENT : COLOR_MUTED_TEXT, 0);
  lv.setText(playIcon, state.playing ? SYMBOL_PAUSE : SYMBOL_PLAY);
  shownPlaying = state.playing;
}

export function buildMusic(page: i32): void {
  const head = row(page);
  lv.flex(head, lv.FLEX_ROW, lv.FLEX_START, lv.FLEX_CENTER);
  lv.gap(head, 10, 10);
  cover = lv.obj(head);
  lv.size(cover, 88, 88);
  lv.radius(cover, 10, 0);
  lv.style(cover, lv.BORDER_WIDTH, 0, 0);
  lv.style(cover, lv.BG_OPA, 255, 0);
  lv.style(cover, lv.BG_GRAD_DIR, lv.GRAD_VER, 0);
  lv.flag(cover, lv.FLAG_SCROLLABLE, false);
  const note = text(cover, SYMBOL_AUDIO, 28, 0xffffff);
  lv.align(note, lv.ALIGN_CENTER, 0, 0);
  const info = lv.obj(head);
  lv.size(info, 0, lv.SIZE_CONTENT);
  lv.grow(info, 1);
  lv.style(info, lv.BG_OPA, 0, 0);
  lv.style(info, lv.BORDER_WIDTH, 0, 0);
  lv.pad(info, 0);
  lv.gap(info, 2, 0);
  lv.flex(info, lv.FLEX_COLUMN, lv.FLEX_START, lv.FLEX_START);
  lv.flag(info, lv.FLAG_SCROLLABLE, false);
  status = text(info, '', 12, COLOR_MUTED_TEXT);
  title = text(info, '', 20, COLOR_TEXT);
  artist = text(info, '', 14, COLOR_MUTED_TEXT);
  count = text(info, '', 12, COLOR_MUTED_TEXT);

  spectrum = lv.chart(page, lv.CHART_BAR, BARS, 0, 100);
  lv.size(spectrum, lv.pct(100), 34);
  lv.style(spectrum, lv.BG_OPA, 0, 0);
  lv.style(spectrum, lv.BORDER_WIDTH, 0, 0);
  lv.pad(spectrum, 0);
  lv.style(spectrum, lv.PAD_COLUMN, 2, lv.PART_MAIN);
  lv.style(spectrum, lv.LINE_WIDTH, 0, lv.PART_MAIN);   // no division lines
  lv.radius(spectrum, 2, lv.PART_ITEMS);
  bars = lv.chartSeries(spectrum, COLOR_ACCENT);
  for (let i = 0; i < BARS; i++) lv.chartPush(spectrum, bars, 4);

  position = lv.slider(page, 0, 1000, 0);
  lv.size(position, lv.pct(100), 6);
  lv.on(position, lv.EVENT_VALUE_CHANGED, () => seek(lv.value(position) / 1000));
  const times = row(page);
  elapsed = text(times, '', 12, COLOR_MUTED_TEXT);
  remaining = text(times, '', 12, COLOR_MUTED_TEXT);

  const transport = row(page);
  lv.flex(transport, lv.FLEX_ROW, lv.FLEX_CENTER, lv.FLEX_CENTER);
  lv.gap(transport, 24, 24);
  const prev = roundButton(transport, SYMBOL_PREV, 40, -1);
  play = roundButton(transport, SYMBOL_PLAY, 52, COLOR_ACCENT);
  playIcon = lv.buttonLabel(play);
  const next = roundButton(transport, SYMBOL_NEXT, 40, -1);
  lv.on(prev, lv.EVENT_CLICKED, () => skip(-1));
  lv.on(play, lv.EVENT_CLICKED, () => togglePlay());
  lv.on(next, lv.EVENT_CLICKED, () => skip(1));
  showTrack();
  showPlaying();
  updateMusic(1);
}

export function updateMusic(dt: number): void {
  if (shownTrack !== state.track) showTrack();
  if (shownPlaying !== state.playing) showPlaying();
  // the spectrum: one new bar a frame while playing, settling when paused
  level += ((state.playing ? 1 : 0) - level) * Math.min(1, dt * 4);
  if (level > 0.02) lv.chartPush(spectrum, bars, Math.round(4 + level * (20 + 76 * rand())));
  clock += dt;
  if (clock < 0.25) return;
  clock = 0;
  const t = TRACKS[state.track];
  lv.setValue(position, Math.round(state.position * 1000 / t.seconds), false);
  lv.setText(elapsed, clockText(state.position));
  lv.setText(remaining, '-' + clockText(t.seconds - state.position));
}
