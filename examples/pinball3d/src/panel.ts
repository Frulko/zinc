// The score panel: the items the layout of the table names, each in its box, drawn with zinc:gfx over or beside the 3D
// view. What an item shows comes from the game; where, how big and in what colour comes from the table.
import { rect, font, drawText, textWidth, imageWidth, imageHeight, drawImageRect } from 'zinc:gfx';
import { PanelItemDef } from './format/table';
import { Game, Phase } from './game';
import { View } from './view';
import { rgb } from './scene';
import { tableImage } from './images';

// The sizes text is drawn in. A size is baked into the program only when the program names it (zinc bakes fonts from
// the source), so a table's sizes are rounded to the nearest of these.
const SIZES: i32[] = [10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 96];
let FONTS: i32[] = [], BOLD: i32[] = [];
/** The fonts, asked for at the first frame: the window must be open. */
function fonts(): void {
  if (FONTS.length > 0) return;
  FONTS = [font('sans', 10), font('sans', 12), font('sans', 14), font('sans', 16), font('sans', 18), font('sans', 20), font('sans', 22), font('sans', 24),
    font('sans', 28), font('sans', 32), font('sans', 36), font('sans', 40), font('sans', 44), font('sans', 48), font('sans', 56), font('sans', 64), font('sans', 72), font('sans', 96)];
  BOLD = [font('sans-bold', 10), font('sans-bold', 12), font('sans-bold', 14), font('sans-bold', 16), font('sans-bold', 18), font('sans-bold', 20), font('sans-bold', 22),
    font('sans-bold', 24), font('sans-bold', 28), font('sans-bold', 32), font('sans-bold', 36), font('sans-bold', 40), font('sans-bold', 44), font('sans-bold', 48), font('sans-bold', 56),
    font('sans-bold', 64), font('sans-bold', 72), font('sans-bold', 96)];
}

function nearest(px: number): i32 {
  let best = 0;
  for (let i = 1; i < SIZES.length; i++) if (Math.abs(SIZES[i] - px) < Math.abs(SIZES[best] - px)) best = i;
  return best;
}
/** 1234567 as 1,234,567. */
export function grouped(n: number): string {
  let s = `${Math.round(n)}`, out = '';
  while (s.length > 3) { out = `,${s.slice(s.length - 3)}${out}`; s = s.slice(0, s.length - 3); }
  return s + out;
}

function line(v: View, item: PanelItemDef, text: string, row: i32, bold: boolean): void {
  const k = nearest(item.size * v.scale), f = bold ? BOLD[k] : FONTS[k], size = SIZES[k];
  const w = textWidth(f, text, 0), bw = v.w(item.box);
  const x = v.x(item.box) + (item.align === 'right' ? bw - w : item.align === 'center' ? (bw - w) / 2 : 0);
  drawText(f, Math.round(x), v.y(item.box) + row * Math.round(size * 1.25), text, rgb(item.color), 255, 0);
}
function label(v: View, item: PanelItemDef): void {
  if (item.label === '') return;
  const k = nearest(Math.max(10, item.size * 0.38) * v.scale), w = textWidth(FONTS[k], item.label, 1), bw = v.w(item.box);
  const x = v.x(item.box) + (item.align === 'right' ? bw - w : item.align === 'center' ? (bw - w) / 2 : 0);
  drawText(FONTS[k], Math.round(x), v.y(item.box) - Math.round(SIZES[k] * 1.3), item.label, 0x7080a0, 255, 1);
}

/** The backglass: the panel's image fills the box, keeping its proportions; what does not fit is cut, centred. */
function backglass(v: View, g: Game, file: string, box: number[]): void {
  const im = tableImage(g.table.source, file);
  if (im < 0) return;
  const iw = imageWidth(im), ih = imageHeight(im), bw = v.w(box), bh = v.h(box);
  const k = Math.max(bw / iw, bh / ih), sw = bw / k, sh = bh / k;
  drawImageRect(im, (iw - sw) / 2, (ih - sh) / 2, sw, sh, v.x(box), v.y(box), bw, bh);
}

/** Draws the panel of the view's layout for the state of the game. `hint`: the line that says how to play. */
export function drawPanel(v: View, g: Game, hint: string): void {
  const p = v.layout.panel, rules = g.rules, t = g.table.def;
  fonts();
  if (p.box[2] > 0 && p.box[3] > 0) {
    rect(v.x(p.box), v.y(p.box), v.w(p.box), v.h(p.box), rgb(p.color));
    if (p.image !== '') backglass(v, g, p.image, p.box);
  }
  const play = g.phase === Phase.Play, step = rules.currentStep();
  for (const item of p.items) {
    // what the item says now; an item with nothing to say shows nothing, not even its caption
    let text = '', bold = true;
    if (item.show === 'title') text = t.name;
    else if (item.show === 'score') text = grouped(rules.score);
    else if (item.show === 'ball') { bold = false; if (play) text = `${rules.ball} / ${t.rules.balls}${rules.extraBalls > 0 ? `  +${rules.extraBalls}` : ''}`; }
    else if (item.show === 'rank') { bold = false; if (play) text = rules.rankName(); }
    else if (item.show === 'mission') { if (play) text = rules.missionName(); }
    else if (item.show === 'step') { bold = false; if (play && step !== null) text = step.count > 1 ? `${step.text}  ${rules.stepCount} / ${step.count}` : step.text; }
    else if (item.show === 'message') {
      if (g.phase === Phase.Attract) { if (Math.floor(g.clock * 2) % 2 === 0) text = 'PRESS START'; }
      else if (rules.now < rules.messageUntil || g.phase === Phase.Over) text = rules.message;
    } else if (item.show === 'bonus') { bold = false; if (play) text = `${grouped(rules.bonus)}  x${rules.multiplier}`; }
    else if (item.show === 'hint') { bold = false; text = hint; }
    else if (item.show === 'highScores') {
      if (play) continue;
      label(v, item);
      for (let i = 0; i < g.highScores.length; i++) line(v, item, `${g.highScores[i]}   ${grouped(g.highValues[i])}`, i, false);
      continue;
    }
    if (text === '') continue;
    label(v, item);
    line(v, item, text, 0, bold);
  }
}
