// Lottie: a vector animation (LottieFiles' JSON, made in After Effects) played by LVGL's Lottie widget, which ThorVG renders into a buffer
// of LOTTIE_SIZE x LOTTIE_SIZE pixels, 4 bytes each, every frame it changes. Pause it, play it again, and see what it costs a frame.
import * as lv from 'zinc:lvgl';
import { COLOR_ACCENT, COLOR_MUTED, COLOR_MUTED_TEXT, COLOR_TEXT, LOTTIE_SIZE, SYMBOL_PAUSE, SYMBOL_PLAY } from '../constants';
import { caption, card, infoRow, kitButton, row, text } from '../components/ui';
import { APPROVE } from '../lottie';
import { state } from '../state';

let anim: i32 = 0;
let playIcon: i32 = 0;
let playing: boolean = true;
let lvgl: i32 = 0;
let pixels: i32 = 0;
let clock: number = 0;

function showPlaying(): void { lv.setText(playIcon, playing ? SYMBOL_PAUSE : SYMBOL_PLAY); }

export function buildLottie(page: i32): void {
  playing = true; clock = 0.5;
  const stage = card(page);
  lv.flex(stage, lv.FLEX_COLUMN, lv.FLEX_CENTER, lv.FLEX_CENTER);
  anim = lv.lottie(stage, APPROVE, LOTTIE_SIZE, LOTTIE_SIZE);
  text(stage, 'Success', 14, COLOR_TEXT);
  text(stage, 'LottieFiles JSON, drawn by ThorVG', 12, COLOR_MUTED_TEXT);

  const controls = row(page);
  lv.flex(controls, lv.FLEX_ROW, lv.FLEX_CENTER, lv.FLEX_CENTER);
  lv.gap(controls, 12, 12);
  const play = lv.button(controls, SYMBOL_PAUSE);
  lv.size(play, 44, 44);
  lv.radius(play, 22, 0);
  lv.style(play, lv.SHADOW_WIDTH, 0, 0);
  lv.bg(play, COLOR_ACCENT, 0);
  playIcon = lv.buttonLabel(play);
  lv.on(play, lv.EVENT_CLICKED, () => { playing = !playing; lv.lottiePlay(anim, playing); showPlaying(); });
  const again = kitButton(controls, 'Replay', COLOR_MUTED, false);
  lv.on(again, lv.EVENT_CLICKED, () => { lv.lottieRestart(anim); playing = true; lv.lottiePlay(anim, true); showPlaying(); });

  const figures = card(page);
  caption(figures, 'A FRAME');
  infoRow(figures, 'Buffer', LOTTIE_SIZE + 'x' + LOTTIE_SIZE + ', ' + Math.round(LOTTIE_SIZE * LOTTIE_SIZE * 4 / 1024) + ' KiB');
  lvgl = infoRow(figures, 'LVGL and ThorVG', '');
  pixels = infoRow(figures, 'Pixels sent', '');
  showPlaying();
}

export function updateLottie(dt: number): void {
  clock += dt;
  if (clock < 0.5) return;
  clock = 0;
  lv.setText(lvgl, Math.round(state.lvglMs * 10) / 10 + ' ms');
  lv.setText(pixels, '' + state.pixels);
}
