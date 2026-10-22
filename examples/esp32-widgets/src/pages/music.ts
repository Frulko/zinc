// Now playing: a cover in the track's colours, the title, a spectrum analyser, a seek slider and the transport buttons. The spectrum is a
// row of bands that stay in place: each one jumps with the music and falls back slowly, louder on the bass side, and settles when paused.
import * as lv from 'zinc:lvgl';
import { COLOR_ACCENT, COLOR_MUTED_TEXT, COLOR_TEXT, SYMBOL_AUDIO, SYMBOL_NEXT, SYMBOL_PAUSE, SYMBOL_PLAY, SYMBOL_PREV } from '../constants';
import { buttonRow, row, text } from '../components/ui';
import { BARS, TRACKS, clockText, seek, skip, state, togglePlay } from '../state';

const IDLE: i32 = 6;   // a band's height at rest (2 px), so the analyser stays visible when paused
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
let playIcon: i32 = 0;
let shownTrack: i32 = -1;
let shownPlaying: boolean = false;
let shownSecond: i32 = -1;
let shownBars: i32[] = [];

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
  shownSecond = -1;
}

function showPlaying(): void {
  lv.setText(status, state.playing ? 'NOW PLAYING' : 'PAUSED');
  lv.textColor(status, state.playing ? COLOR_ACCENT : COLOR_MUTED_TEXT, 0);
  lv.setText(playIcon, state.playing ? SYMBOL_PAUSE : SYMBOL_PLAY);
  shownPlaying = state.playing;
}

export function buildMusic(page: i32): void {
  shownTrack = -1; shownPlaying = !state.playing; shownSecond = -1; shownBars = [];
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
  lv.size(spectrum, lv.pct(100), 40);
  lv.style(spectrum, lv.BG_OPA, 0, 0);
  lv.style(spectrum, lv.BORDER_WIDTH, 0, 0);
  lv.pad(spectrum, 0);
  lv.style(spectrum, lv.PAD_COLUMN, 2, lv.PART_MAIN);
  lv.style(spectrum, lv.LINE_WIDTH, 0, lv.PART_MAIN);   // no division lines
  lv.radius(spectrum, 2, lv.PART_ITEMS);
  bars = lv.chartSeries(spectrum, COLOR_ACCENT);
  for (let i = 0; i < BARS; i++) { lv.chartSet(spectrum, bars, i, IDLE); shownBars.push(IDLE); }

  position = lv.slider(page, 0, 1000, 0);
  lv.size(position, lv.pct(100), 6);
  lv.on(position, lv.EVENT_VALUE_CHANGED, () => { seek(lv.value(position) / 1000); shownSecond = -1; });
  const times = row(page);
  elapsed = text(times, '', 12, COLOR_MUTED_TEXT);
  remaining = text(times, '', 12, COLOR_MUTED_TEXT);

  const transport = buttonRow(page);
  lv.flex(transport, lv.FLEX_ROW, lv.FLEX_CENTER, lv.FLEX_CENTER);
  lv.gap(transport, 24, 24);
  const prev = roundButton(transport, SYMBOL_PREV, 40, -1);
  const play = roundButton(transport, SYMBOL_PLAY, 52, COLOR_ACCENT);
  playIcon = lv.buttonLabel(play);
  const next = roundButton(transport, SYMBOL_NEXT, 40, -1);
  lv.on(prev, lv.EVENT_CLICKED, () => skip(-1));
  lv.on(play, lv.EVENT_CLICKED, () => togglePlay());
  lv.on(next, lv.EVENT_CLICKED, () => skip(1));
  updateMusic(0);
}

export function updateMusic(dt: number): void {
  if (shownTrack !== state.track) showTrack();
  if (shownPlaying !== state.playing) showPlaying();
  for (let i = 0; i < BARS; i++) {
    const v = IDLE + Math.round(state.spectrum[i] * (100 - IDLE));
    if (v !== shownBars[i]) { lv.chartSet(spectrum, bars, i, v); shownBars[i] = v; }
  }
  const second = Math.floor(state.position);
  if (second === shownSecond) return;
  shownSecond = second;
  const t = TRACKS[state.track];
  lv.setValue(position, Math.round(state.position * 1000 / t.seconds), false);
  lv.setText(elapsed, clockText(state.position));
  lv.setText(remaining, '-' + clockText(t.seconds - state.position));
}
