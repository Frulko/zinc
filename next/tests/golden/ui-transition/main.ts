// Transitions on any animatable property and animate() on every style key (ZN-274), on the engine clock (ui.tick): the values at 0, 50 and 100% of
// 200 ms linear transitions started by classes (opacity, translate, colours, width) and a style number (rotate); a node's first style does not
// transition; a new end starts from where the property is; a group moves only its properties; animate() starts every key from its value (numbers,
// colours channel by channel, keywords half way). Over the tween budget of a small heap (--profile esp32: 8 at once, main.esp32.out) a change jumps
// to its end. Then, mounted: the opacity and translate of a state variant move with no layout (layout counter).
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';

const root = ui.createNode(ui.VIEW);
ui.setClass(root, 'flex-row gap-2 p-2 w-full bg-white');
function box(cls: string): i32 { const h = ui.createNode(ui.VIEW); ui.setClass(h, cls); ui.insert(root, h, -1); return h; }
function r3(v: number): number { return Math.round(v * 1000) / 1000; }
const LIN = 'transition-all duration-200 ease-linear ';

// classes and a style number, sampled at 0, 50 and 100%
const a = box(LIN + 'w-20 h-10 opacity-100 text-[#000000] border border-[#000000]');
ui.setNumber(a, 'rotate', 0);
ui.tick(0);
ui.setClass(a, LIN + 'w-40 h-10 opacity-50 translate-y-2 text-white border border-white');
ui.setNumber(a, 'rotate', 90);
function sample(tag: string): void {
  console.log(tag, 'opacity', r3(ui.getNumber(a, 'opacity')), 'translateY', ui.getNumber(a, 'translateY'), 'rotate', ui.getNumber(a, 'rotate'),
    'color', ui.getNumber(a, 'color'), 'borderColor', ui.getNumber(a, 'borderColor'), 'width', ui.getNumber(a, 'width'));
}
ui.tick(0); sample('0%');
ui.tick(100); sample('50%');
ui.tick(100); sample('100%');

// the first style of a node does not transition; a new end mid-way starts from the value shown
const f = box(LIN + 'opacity-50');
ui.tick(100);
console.log('first style: opacity', r3(ui.getNumber(f, 'opacity')));
ui.setClass(f, LIN + 'opacity-100'); ui.tick(0); ui.tick(100);
console.log('half way to 1: opacity', r3(ui.getNumber(f, 'opacity')));
ui.setClass(f, LIN + 'opacity-50'); ui.tick(0); ui.tick(100);
console.log('back to 0.5 from there, half way: opacity', r3(ui.getNumber(f, 'opacity')));
ui.tick(1000);

// a group transitions its properties only
const g = box('transition-opacity duration-200 ease-linear opacity-100');
ui.tick(0);
ui.setClass(g, 'transition-opacity duration-200 ease-linear opacity-0 translate-x-4');
ui.tick(0); ui.tick(100);
console.log('transition-opacity, half way: opacity', r3(ui.getNumber(g, 'opacity')), 'translateX', ui.getNumber(g, 'translateX'));
ui.tick(1000);

// animate() on every key: from the value it has, half way at 100 of 200 ms
const NUMERIC: string[] = ['opacity', 'translateX', 'x', 'translateY', 'y', 'scale', 'rotate', 'skewX', 'skewY', 'scaleX', 'scaleY', 'width', 'height', 'minWidth', 'maxWidth',
  'minHeight', 'maxHeight', 'aspectRatio', 'widthPercent', 'heightPercent', 'basis', 'flexBasis', 'basisPercent', 'grow', 'shrink', 'flexShrink', 'padding', 'paddingTop',
  'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'gap', 'rowGap', 'columnGap', 'top', 'left', 'right', 'bottom',
  'borderWidth', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'radius', 'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius',
  'borderBottomRightRadius', 'borderBottomLeftRadius', 'fontSize', 'lineHeight', 'letterSpacing', 'shadowOffsetX', 'shadowOffsetY', 'shadowOpacity', 'shadowRadius', 'elevation',
  'backgroundAlpha', 'colorAlpha', 'borderAlpha', 'paddingTopPercent', 'marginLeftPercent', 'gapPercent', 'maxWidthPercent', 'topPercent'];
const KEYWORD: string[] = ['flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'position', 'overflow', 'fontWeight', 'textAlign', 'hidden', 'alignSelf', 'alignContent',
  'borderStyle', 'numberOfLines', 'marginAuto', 'boxSizing', 'shadowLevel', 'keepFocus', 'inputMode'];
const COLOUR: string[] = ['backgroundColor', 'bg', 'color', 'borderColor', 'shadowColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'];
let bad = '';
function tween(key: string, from: number, to: number, early: number, half: number): void {
  const h = ui.createNode(ui.VIEW);
  ui.setNumber(h, key, from);
  ui.animate(h, key, to, 200, 'linear', 0);
  ui.tick(80);
  const v0 = ui.getNumber(h, key);
  ui.tick(20);
  const v1 = ui.getNumber(h, key);
  ui.tick(100);
  const v2 = ui.getNumber(h, key);
  if (Math.abs(v0 - early) > 0.001 || Math.abs(v1 - half) > 0.001 || v2 !== to) bad += ` ${key}(${v0} ${v1} ${v2})`;
  ui.destroy(h);
}
for (const k of NUMERIC) tween(k, 10, 30, 18, 20);
for (const k of KEYWORD) tween(k, 0, 1, 0, 1);
for (const k of COLOUR) tween(k, 0x000000, 0xffffff, 0x666666, 0x808080);
console.log('animate:', NUMERIC.length, 'numeric,', KEYWORD.length, 'keyword,', COLOUR.length, 'colour keys', bad === '' ? 'ok' : 'wrong:' + bad);

// the tween budget: nine properties change at once; on a small heap the ninth (margin-top) and a tenth tween (animate) take their end at once
const c = box(LIN + 'w-20 h-10 opacity-100');
const d = box('w-4 h-4 opacity-100');
ui.tick(0);
ui.setClass(c, LIN + 'w-40 h-20 opacity-50 translate-x-2 translate-y-2 rounded-lg pt-4 pl-4 mt-4');
ui.tick(0);
ui.animate(d, 'opacity', 0, 200, 'linear', 0);
ui.tick(100);
console.log('nine at once, half way: opacity', r3(ui.getNumber(c, 'opacity')), 'translate', ui.getNumber(c, 'translateX'), ui.getNumber(c, 'translateY'), 'radius', ui.getNumber(c, 'borderRadius'),
  'size', ui.getNumber(c, 'width'), ui.getNumber(c, 'height'), 'padding', ui.getNumber(c, 'paddingTop'), ui.getNumber(c, 'paddingLeft'), 'margin-top', ui.getNumber(c, 'marginTop'));
console.log('a tenth tween (animate), half way: opacity', r3(ui.getNumber(d, 'opacity')));
ui.tick(1000);

// mounted: a state variant's opacity and translate move on the frames, with no layout
const s = box('w-10 h-10 bg-slate-500 transition duration-200 ease-linear data-[state=open]:opacity-40 data-[state=open]:translate-x-2');
let fr = 0, l0 = 0;
ui.mount(root, 0xffffff, (dt: number) => {
  fr++;
  if (fr === 2) ui.setAttr(s, 'data-state', 'open');
  if (fr === 3) l0 = ui.layoutCount();
  if (fr === 8) {
    const o = ui.getNumber(s, 'opacity'), x = ui.getNumber(s, 'translateX');
    console.log('state variant moving:', o < 1 && o > 0.4, x > 0 && x < 8, 'layouts while it moves', ui.layoutCount() - l0);
  }
  if (fr === 20) {
    console.log('state variant ended: opacity', r3(ui.getNumber(s, 'opacity')), 'translateX', ui.getNumber(s, 'translateX'), 'layouts', ui.layoutCount() - l0);
    quit();
  }
});
