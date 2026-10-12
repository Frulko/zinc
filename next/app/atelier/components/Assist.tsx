// What the language server says, over the editor: the completion popup under the name being typed (a kind mark and the
// label per row, the signature and the description of the selected row under the list), the signature of the call the
// caret is in above its line (the argument being typed in the accent colour, its description under it), and the card of
// the name the pointer rests on (its type, its doc). `stepAssist` places them once per frame from the editor's geometry.
import { createSignal } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { font, textWidth } from 'zinc:gfx';
import { theme, bg, fg, bd, Theme } from '../app/theme';
import { Buffer } from '../app/workspace';
import { popup, popupRow, setPopupRow, popupFrom, sig, hover, hoverFrom } from '../app/lsp';
import { Item, Sig, kindMark } from '../app/rpc';
import { segments } from '../app/fuzzy';
import { acceptCompletion } from '../app/cursors';

const FONT_PX: i32 = 14, PAD_LEFT: i32 = 14, PAD_TOP: i32 = 10;   // the editor's (Editor.tsx)
const ROW: i32 = 26, ROWS: i32 = 8, POPUP_W: i32 = 380, LABEL_X: i32 = 37;   // LABEL_X: where a row's label starts in the popup

// [left, top] of each card in the editor's pane, and the pane's size
const [popXY, setPopXY] = createSignal<number[]>([0, 0]);
const [sigXY, setSigXY] = createSignal<number[]>([0, 0, 200]);     // and its width
const [hovXY, setHovXY] = createSignal<number[]>([0, 0, 200]);
function put(get: () => number[], set: (v: number[]) => void, v: number[]): void {
  const o = get();
  for (let i = 0; i < v.length; i++) if (o[i] !== v[i]) { set(v); return; }
}

function docLines(doc: string, perLine: i32): i32 { return doc === '' ? 0 : Math.min(3, Math.ceil(doc.length / perLine) + (doc.indexOf('\n') >= 0 ? 1 : 0)); }
function chosen(): Item | null { const rows = popup(); return rows.length === 0 ? null : rows[Math.min(popupRow(), rows.length - 1)]; }
/** First row shown: the selected one stays in the window of ROWS rows. */
function firstRow(): i32 { return Math.max(0, Math.min(popupRow() - (ROWS >> 1), popup().length - ROWS)); }
function popupHeight(): number {
  const it = chosen();
  if (it === null) return 0;
  const info = (it as Item).detail !== '' || (it as Item).doc !== '';
  return 10 + Math.min(popup().length, ROWS) * ROW + (info ? 13 : 0) + ((it as Item).detail !== '' ? 20 : 0) + docLines((it as Item).doc, 50) * 17;
}
function sigDoc(s: Sig): string { return s.paramDoc !== '' ? s.paramDoc : s.doc; }

/** Once per frame: where the cards go, from the scroll and the geometry of the active editor. */
export function stepAssist(b: Buffer): void {
  const rows = popup(), s = sig(), hv = hover();
  if (rows.length === 0 && s === null && hv.length === 0) return;
  const h = b.node(), v = ui.editView(h), box = ui.screenBox(h), doc = b.doc, f = font('mono', FONT_PX), f12 = font('mono', 12);
  const paneH = v[3] + PAD_TOP, paneW = box[3] > 0 ? box[2] * paneH / box[3] : 800, lh = v[4];
  const xy = (off: i32): number[] => {
    const line = doc.lineOf(off);
    return [PAD_LEFT + v[6] + textWidth(f, doc.lines[line].slice(0, off - doc.starts[line]), 0) - v[0], PAD_TOP + line * lh - v[1]];
  };
  const caret = b.sels[2 * b.main + 1];
  if (rows.length > 0) {
    const p = xy(Math.max(0, popupFrom())), ph = popupHeight();
    const below = p[1] + lh + 2 + ph <= paneH || p[1] < ph;
    put(popXY, setPopXY, [Math.max(4, Math.min(paneW - POPUP_W - 4, p[0] - LABEL_X)), below ? p[1] + lh + 2 : p[1] - ph - 2]);
  }
  if (s !== null) {
    const sg = s as Sig, p = xy(caret), d = sigDoc(sg);
    const w = Math.min(paneW - 8, Math.max(textWidth(f12, sg.label, 0), Math.min(d.length, 60) * 6.4) + 26), sh = 30 + docLines(d, 60) * 17;
    const above = p[1] - sh - 4 >= 0;   // above the line: the popup hangs under it
    put(sigXY, setSigXY, [Math.max(4, Math.min(paneW - w - 4, p[0] - 13)), above ? p[1] - sh - 4 : p[1] + lh + 4, w]);
  }
  if (hv.length > 0 && hoverFrom() >= 0) {
    const p = xy(hoverFrom());
    const w = Math.min(paneW - 8, Math.max(textWidth(f12, hv[0], 0), Math.min(hv[1].length, 60) * 6.4) + 26), hh = 30 + docLines(hv[1], 60) * 17;
    put(hovXY, setHovXY, [Math.max(4, Math.min(paneW - w - 4, p[0] - 13)), p[1] + lh + 4 + hh <= paneH ? p[1] + lh + 4 : p[1] - hh - 4, w]);
  }
}

function markColor(t: Theme, kind: i32): i32 {
  return kind === 2 || kind === 3 ? t.fn : kind === 7 || kind === 8 || kind === 22 ? t.type : kind === 14 ? t.keyword : kind === 9 ? t.string : kind === 5 || kind === 10 ? t.number : t.muted;
}
function Row(props: { it: Item }): i32 {
  const it = props.it, on = (): boolean => popup().indexOf(it) === popupRow();
  const segs = segments(it.label, it.hits);
  return <View class={`flex-row items-center h-[26] px-1.5 gap-2 rounded-lg cursor-pointer ${on() ? bg(theme().selected) : ''}`}
    onPointerDown={(e: ui.PointerEvent) => { setPopupRow(popup().indexOf(it)); acceptCompletion(); }}>
    <View class={`w-[18] h-[18] rounded-md items-center justify-center ${bg(on() ? theme().elevated : theme().hover)}`}>
      <Text class={`text-[11px] font-semibold ${fg(markColor(theme(), it.kind))}`}>{kindMark(it.kind)}</Text>
    </View>
    <View class="flex-row">
      {segs.map((s: string, k: i32) => <Text class={`font-mono text-[13px] ${k % 2 === 1 ? `font-semibold ${fg(theme().accent)}` : fg(theme().text)}`}>{s}</Text>)}
    </View>
    <View class="grow shrink overflow-hidden h-[16] flex-row justify-end">
      <Text class={`font-mono text-[11px] ${fg(theme().faint)}`}>{it.detail.length > 30 ? '' : it.detail}</Text>
    </View>
  </View>;
}
const CARD = 'absolute flex-col rounded-xl border shadow-lg overflow-hidden';

export function Popup(): i32 {
  const info = (): Item => { const it = chosen(); return it === null ? new Item('', 0, '', '') : it as Item; };
  return <View class={`${CARD} w-[380] p-1 ${bg(theme().elevated)} ${bd(theme().border)}`}
    style={{ left: popXY()[0], top: popXY()[1], hidden: popup().length === 0 ? 1 : 0 }} onPointerDown={() => {}}>
    {popup().slice(firstRow(), firstRow() + ROWS).map((it: Item) => <Row it={it} />)}
    {(info().detail !== '' || info().doc !== '') && <View class={`flex-col mt-1 pt-1.5 px-2 pb-1 border-t ${bd(theme().borderSoft)}`}>
      {info().detail !== '' && <View class="h-[20] overflow-hidden"><Text class={`font-mono text-[12px] ${fg(theme().text)}`}>{info().detail}</Text></View>}
      {info().doc !== '' && <View class="overflow-hidden" style={{ height: docLines(info().doc, 50) * 17 }}><Text class={`text-[12px] leading-[17] ${fg(theme().muted)}`}>{info().doc}</Text></View>}
    </View>}
  </View>;
}

export function Signature(): i32 {
  const s = (): Sig => { const v = sig(); return v === null ? new Sig() : v as Sig; };
  return <View class={`${CARD} pointer-events-none px-3 py-1.5 ${bg(theme().elevated)} ${bd(theme().border)}`}
    style={{ left: sigXY()[0], top: sigXY()[1], width: sigXY()[2], hidden: sig() === null ? 1 : 0 }}>
    <View class="flex-row h-[18] overflow-hidden">
      <Text class={`font-mono text-[12px] ${fg(theme().muted)}`}>{s().label.slice(0, s().from)}</Text>
      <Text class={`font-mono text-[12px] font-semibold ${fg(theme().accent)}`}>{s().label.slice(s().from, s().to)}</Text>
      <Text class={`font-mono text-[12px] ${fg(theme().muted)}`}>{s().label.slice(s().to)}</Text>
    </View>
    {sigDoc(s()) !== '' && <View class="overflow-hidden" style={{ height: docLines(sigDoc(s()), 60) * 17 }}><Text class={`text-[12px] leading-[17] ${fg(theme().muted)}`}>{sigDoc(s())}</Text></View>}
  </View>;
}

export function Hover(): i32 {
  const code = (): string => hover().length > 0 ? hover()[0] : '';
  const text = (): string => hover().length > 1 ? hover()[1] : '';
  return <View class={`${CARD} pointer-events-none px-3 py-1.5 ${bg(theme().elevated)} ${bd(theme().border)}`}
    style={{ left: hovXY()[0], top: hovXY()[1], width: hovXY()[2], hidden: hover().length === 0 || popup().length > 0 ? 1 : 0 }}>
    <View class="h-[18] overflow-hidden"><Text class={`font-mono text-[12px] ${fg(theme().text)}`}>{code()}</Text></View>
    {text() !== '' && <View class="overflow-hidden" style={{ height: docLines(text(), 60) * 17 }}><Text class={`text-[12px] leading-[17] ${fg(theme().muted)}`}>{text()}</Text></View>}
  </View>;
}
