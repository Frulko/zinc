// The tour over the window (app/tour.ts has its steps): everything but the part a step is about is dimmed and does not take the
// pointer, the part keeps working, and a card beside it says what it is, with Next, Back and Skip. Steps that ask for something go on
// by themselves once it is done: open an example, run it, fix the mistake the tour put in the code (the tour takes it back if the
// step is left with it). The language card comes first on a first launch.
import { createSignal, createEffect, createNodeRef, untrack } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme, bg, fg, bd } from 'zinc:editor';
import { STEPS, tourStep, stepId, nextStep, backStep, endTour } from '../app/tour';
import { active, Buffer, sketchDir, saveAll } from '../app/workspace';
import { check, runCount } from '../app/tools';
import { setStartOpen, openDocs } from '../app/commands';
import { setText } from 'zinc:editor';
import { t, LANGUAGES, languageName, lang, setLanguage } from '../app/text';
import { runRef, engineRef, paletteRef } from './Header';
import { examplesRef, helloRef, stylesRef, templatesRef, openExample } from './Start';
import { editorRef } from './Editor';
import { consoleRef } from './Console';
import { Glyph } from './Controls';
import { I_CHECK } from './icons';

// ---- what the steps do
let sketchAt = '', runsAt: i32 = 0;
let broken: Buffer | null = null;   // the file the error step put a mistake in
const RIGHT = 'clear(', WRONG = 'clearr(';
function swap(b: Buffer, from: string, to: string): boolean {
  const text = b.text(), at = text.indexOf(from);
  if (at < 0) return false;
  setText(b, text.slice(0, at) + to + text.slice(at + from.length));
  saveAll(); check();
  return true;
}
/** The mistake of the error step: a call misspelt (Hello's `clear(` becomes `clearr(`); none in a sketch without that call. */
function breakCode(): void { const b = active(); if (b !== null && swap(b as Buffer, RIGHT, WRONG)) broken = b; }
/** Takes the mistake back: Fix it for me, or a step left with it. */
function restore(): void { if (broken !== null) { const b = broken as Buffer; broken = null; swap(b, WRONG, RIGHT); } }
export function fixCode(): void { restore(); nextStep(); }

createEffect(() => { const id = stepId(); untrack<i32>(() => { enter(id); return 0; }); });   // a step's own changes (the sketch it opens) do not enter it again
function enter(id: string): void {
  if (id !== 'error') restore();
  if (id === '') { if (sketchDir() !== '') setStartOpen(false); return; }
  if (id === 'welcome' || id === 'example' || id === 'templates') setStartOpen(true);
  else if (id !== 'language') { if (sketchDir() === '') openExample('hello'); setStartOpen(false); }   // the next steps are about a sketch
  sketchAt = sketchDir(); runsAt = runCount();
  if (id === 'error') breakCode();
}

/** The parts of the window a step is about. */
function targets(id: string): i32[] {
  if (id === 'welcome') return [examplesRef.node];
  if (id === 'example') return [helloRef.node];
  if (id === 'editor' || id === 'completion') return [editorRef.node];
  if (id === 'run') return [runRef.node];
  if (id === 'console') return [consoleRef.node];
  if (id === 'error') return [editorRef.node, consoleRef.node];
  if (id === 'palette') return [paletteRef.node];
  if (id === 'devices') return [engineRef.node];
  if (id === 'templates') return [stylesRef.node, templatesRef.node];   // where a new sketch's style and a template are chosen
  return [];
}
/** The box around a step's parts: [x, y, w, h], empty when it has none. */
export function stepBox(id: string): number[] {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const h of targets(id)) {
    if (h < 0) continue;
    const b = ui.screenBox(h);
    if (b[2] <= 0 || b[3] <= 0) continue;
    x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[0] + b[2]); y1 = Math.max(y1, b[1] + b[3]);
  }
  const W = size()[0], H = size()[1];
  if (H > 0) { x1 = Math.min(x1, W - PAD); y1 = Math.min(y1, H - PAD); }   // a part that goes on below the window (the examples): what is seen of it
  return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : [];
}

// ---- where things are drawn, measured once per frame
const rootRef = createNodeRef(), cardRef = createNodeRef();
const [box, setBox] = createSignal<number[]>([]);
const [size, setSize] = createSignal<number[]>([0, 0]);
const [cardH, setCardH] = createSignal<number[]>([0]);
function put(get: () => number[], set: (v: number[]) => void, v: number[]): void {
  const o = get();
  if (o.length !== v.length) { set(v); return; }
  for (let i = 0; i < v.length; i++) if (o[i] !== v[i]) { set(v); return; }
}
/** Once per frame: the steps that wait for something, then the box of the part shown. */
export function stepTour(): void {
  const id = stepId();
  if (id === '') return;
  if (id === 'example' && sketchDir() !== sketchAt) { nextStep(); return; }
  if (id === 'run' && runCount() > runsAt) { nextStep(); return; }
  if (id === 'error' && broken !== null && (broken as Buffer).text().indexOf(WRONG) < 0) { broken = null; saveAll(); check(); nextStep(); return; }
  if (rootRef.node >= 0) { const r = ui.screenBox(rootRef.node); put(size, setSize, [r[2], r[3]]); }
  if (cardRef.node >= 0) put(cardH, setCardH, [ui.screenBox(cardRef.node)[3]]);
  put(box, setBox, stepBox(id));
}
/** `[tour] <step> <x> <y> <w> <h>` of the part shown (scripted sessions), `[tour] off` without a tour. */
export function tourLine(): string {
  const id = stepId();
  if (id === '') return '[tour] off';
  const b = stepBox(id);
  return `[tour] ${id} ` + (b.length === 0 ? '-' : b.map((v: number) => `${Math.round(v)}`).join(' '));
}

// ---- the overlay
const PAD = 6, CW = 380;
function Shade(props: { at: () => number[] }): i32 {
  return <View className={`absolute ${bg(0x000000)}`} onPointerDown={() => {}}
    style={{ left: props.at()[0], top: props.at()[1], width: Math.max(0, props.at()[2]), height: Math.max(0, props.at()[3]), opacity: 0.38 }} />;
}
function Btn(props: { label: () => string; onPress: () => void; accent?: boolean }): i32 {
  const accent = props.accent ?? false;
  return <View className={`h-[30] px-3.5 rounded-full items-center justify-center cursor-pointer ${accent ? bg(theme().accent) : `hover:${bg(theme().hover)}`}`}
    onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) props.onPress(); }}>
    <Text className={`text-[13px] font-semibold ${fg(accent ? theme().onAccent : theme().text)}`}>{props.label()}</Text>
  </View>;
}
function Languages(): i32 {
  return <View className="flex-col gap-0.5 py-1">
    {LANGUAGES.map((code: string) => <View className={`flex-row items-center h-[32] px-3 rounded-lg cursor-pointer ${lang() === code ? bg(theme().selected) : `hover:${bg(theme().hover)}`}`}
      onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) setLanguage(code); }}>
      <Text className={`grow text-[14px] ${fg(theme().text)}`}>{languageName(code)}</Text>
      {lang() === code && <Glyph kind={I_CHECK} size={14} color={() => theme().accent} back={() => theme().selected} />}
    </View>)}
  </View>;
}
/** Where the card goes: under the part, else above it, else inside its lower corner; in the middle when there is no part. Its height is
 *  the one measured at the last frame. */
function cardAt(id: string): number[] {
  const b = box(), W = size()[0], H = size()[1], ch = cardH()[0] > 0 ? cardH()[0] : 220;
  if (b.length === 0) return [(W - CW) / 2, Math.max(16, (H - ch) / 2)];
  const x = Math.max(16, Math.min(W - CW - 16, b[0]));
  if (b[1] + b[3] + PAD + 12 + ch <= H) return [x, b[1] + b[3] + PAD + 12];
  if (b[1] - PAD - 12 - ch >= 0) return [x, b[1] - PAD - 12 - ch];
  return [Math.max(16, b[0] + b[2] - CW - 16), Math.max(16, b[1] + b[3] - ch - 16)];
}
function Card(): i32 {
  const id = (): string => stepId();
  const waits = (): boolean => id() === 'example' || id() === 'run' || id() === 'error';
  return <View ref={cardRef} className={`absolute w-[380] flex-col p-4 gap-1.5 rounded-2xl border shadow-xl ${bg(theme().elevated)} ${bd(theme().border)}`}
    style={{ left: cardAt(id())[0], top: cardAt(id())[1] }} onPointerDown={() => {}}>
    <View className="flex-row items-center">
      <Text className={`grow text-[12px] ${fg(theme().faint)}`}>{id() === 'language' ? '' : t('atelier.tour.progress', ['step', `${tourStep()}`, 'count', `${STEPS.length - 1}`])}</Text>
      <Text className={`text-[12px] font-medium cursor-pointer ${fg(theme().muted)}`} onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) endTour(true); }}>{t('atelier.tour.skip')}</Text>
    </View>
    <Text className={`text-[16px] font-semibold ${fg(theme().text)}`}>{t(`atelier.tour.${id()}.title`)}</Text>
    <Text className={`text-[13px] leading-[19] ${fg(theme().text)}`}>{t(`atelier.tour.${id()}.text`)}</Text>
    {id() === 'language' && <Languages />}
    {waits() && <Text className={`text-[12px] ${fg(theme().muted)}`}>{t('atelier.tour.or_next')}</Text>}
    <View className="flex-row items-center justify-end gap-1 pt-2">
      {tourStep() > 1 && <Btn label={() => t('atelier.tour.back')} onPress={() => backStep()} />}
      {id() === 'error' && <Btn label={() => t('atelier.tour.fix')} onPress={() => fixCode()} />}
      {id() === 'templates' && <Btn label={() => t('atelier.start.learn_link')} onPress={() => openDocs('docs/learn/')} />}
      <Btn accent label={() => t(id() === 'language' ? 'atelier.tour.continue' : id() === 'templates' ? 'atelier.tour.finish' : 'atelier.tour.next')} onPress={() => nextStep()} />
    </View>
  </View>;
}

export function Tour(): i32 {
  // the four shades around the part, and a ring on it; without a part one shade covers the window
  const b = (): number[] => box().length === 4 ? [box()[0] - PAD, box()[1] - PAD, box()[2] + 2 * PAD, box()[3] + 2 * PAD] : [0, size()[1], 0, 0];
  const W = (): number => size()[0], H = (): number => size()[1];
  return <View ref={rootRef} className="absolute inset-0" style={{ hidden: tourStep() < 0 ? 1 : 0 }}>
    <Shade at={() => [0, 0, W(), b()[1]]} />
    <Shade at={() => [0, b()[1] + b()[3], W(), H() - b()[1] - b()[3]]} />
    <Shade at={() => [0, b()[1], b()[0], b()[3]]} />
    <Shade at={() => [b()[0] + b()[2], b()[1], W() - b()[0] - b()[2], b()[3]]} />
    {box().length === 4 && <View className={`absolute rounded-[16] border-2 ${bd(theme().accent)}`} style={{ left: b()[0], top: b()[1], width: b()[2], height: b()[3] }} />}
    {tourStep() >= 0 && <Card />}
  </View>;
}
