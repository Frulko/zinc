/** @jsxHelpers ./host */
// zinc:ui/kit — Keyboard: an on-screen keyboard for touch devices (kiosks, Pi touch screens, reMarkable, ESP32 panels).
//
//   <Keyboard />                                   shows itself while a text field has the focus, slides away after
//   <Keyboard layouts={['fr', 'en', 'de']} />      the 🌐 key ({lang}) cycles through these (keyboard-layouts.ts)
//   <Keyboard mode="always" onKey={(k) => ...} />  always visible; onKey sees every key (also without a field)
//
// It types into the focused field through the real keyboard path (ui.insertText / ui.sendKey), so onInput, undo,
// selection and Enter behave as with a physical keyboard; pressing a key never takes the focus (keepFocus).
// The field's inputMode picks the layout: numeric / decimal / tel get a digit pad, email and url add @ / . keys.
// Touch behaviour: a bubble previews the pressed key, a long press offers accents (slide onto one and release),
// backspace repeats while held, shift is one-shot and a double tap locks capitals.
// Everything is overridable: sizes (keyHeight, gap), classes (class, keyClass, specialKeyClass, accentClass),
// captions (via the layout), and custom layouts (registerLayout).
import { createSignal, createNodeRef, NodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme } from './theme';
import { KeyboardLayout, layoutOf, SYMBOLS, SYMBOLS2, NUMERIC, DECIMAL, PHONE, withBottom } from './keyboard-layouts';

export interface KeyboardProps {
  /** Layout ids the {lang} key cycles through (default: ['en']). */
  layouts?: string[];
  /** 'auto' (default): visible while a text field has the focus. 'always': always visible. */
  mode?: string;
  /** Called with every key: a character, or 'Backspace', 'Enter', 'Shift', 'Layout:<id>', 'Hide'... */
  onKey?: (key: string) => void;
  keyHeight?: number;
  gap?: number;
  class?: string;
  keyClass?: string;
  specialKeyClass?: string;
  /** Classes of the long-press accent popup. */
  accentClass?: string;
  /** Preview bubble above the pressed key (default true). */
  preview?: boolean;
}

class Key {
  token: string;     // the character, or 'shift', 'bksp'... for {special} keys
  label: string;
  width: number;     // in key units
  special: boolean;
  constructor(token: string, label: string, width: number, special: boolean) { this.token = token; this.label = label; this.width = width; this.special = special; }
}
class Row { keys: Key[]; constructor(keys: Key[]) { this.keys = keys; } }

const LONG_PRESS_MS: number = 380;
const REPEAT_DELAY_MS: number = 420;
const REPEAT_MS: number = 55;

export function Keyboard(props: KeyboardProps): i32 {
  const ids = props.layouts ?? ['en'];
  const keyH = props.keyHeight ?? 44, gap = props.gap ?? 6;
  const [layoutIx, setLayoutIx] = createSignal<i32>(0);
  const [page, setPage] = createSignal<i32>(0);            // 0 letters, 1 symbols, 2 more symbols
  const [shift, setShift] = createSignal<i32>(0);          // 0 off, 1 one-shot, 2 caps lock
  const [fieldMode, setFieldMode] = createSignal<i32>(0);  // inputMode of the focused field (ui.fieldMode)
  const [shown, setShown] = createSignal<boolean>(props.mode === 'always');
  const [bubble, setBubble] = createSignal<string>('');    // preview text ('' hidden)
  const [bubbleX, setBubbleX] = createSignal<number>(0);
  const [bubbleY, setBubbleY] = createSignal<number>(0);
  const [bubbleW, setBubbleW] = createSignal<number>(0);
  const [accents, setAccents] = createSignal<string[]>([]);   // long-press variants on screen
  const [accentIx, setAccentIx] = createSignal<i32>(0);
  const [accX, setAccX] = createSignal<number>(0);
  const [accY, setAccY] = createSignal<number>(0);
  const root = createNodeRef();
  const always = props.mode === 'always';
  let lastShiftAt: number = -1000;
  let pressToken: string = '';
  let pressedAt: number = 0;
  let longTimer: i32 = -1;
  let repeatTimer: i32 = -1;
  const cellW: number = keyH * 0.9;

  const layout = (): KeyboardLayout => layoutOf(ids[layoutIx() % ids.length]);
  const emit = (k: string): void => { const f = props.onKey; if (f !== undefined) f(k); };

  function enterLabel(l: KeyboardLayout): string {
    const m = fieldMode();
    return m === 6 ? l.search : m === 7 ? '⏎' : l.enter;
  }
  function specialLabel(t: string, l: KeyboardLayout): string {
    if (t === 'shift') return shift() === 2 ? '⇪' : '⇧';
    if (t === 'bksp') return '⌫';
    if (t === 'enter') return enterLabel(l);
    if (t === 'space') return l.name;
    if (t === 'sym') return '123';
    if (t === 'sym2') return '#+=';
    if (t === 'abc') return l.id === 'ru' ? 'АБВ' : l.id === 'el' ? 'ΑΒΓ' : 'ABC';
    if (t === 'lang') return ids.length > 1 ? layoutOf(ids[(layoutIx() + 1) % ids.length]).id.toUpperCase() : l.id.toUpperCase();
    if (t === 'hide') return '⌄';
    if (t === 'left') return '←';
    if (t === 'right') return '→';
    if (t === 'tab') return '⇥';
    return t;
  }
  function parse(line: string, upper: boolean, l: KeyboardLayout): Row {
    const keys: Key[] = [];
    for (const part of line.split(' ')) {
      if (part === '') continue;
      if (part.startsWith('{') && part.endsWith('}')) {
        const body = part.slice(1, part.length - 1), c = body.indexOf(':');
        const t = c > 0 ? body.slice(0, c) : body, w = c > 0 ? parseFloat(body.slice(c + 1)) : 1;
        keys.push(new Key(t, specialLabel(t, l), w, true));
      } else {
        const ch = upper ? part.toUpperCase() : part;
        keys.push(new Key(ch, ch, 1, false));
      }
    }
    return new Row(keys);
  }
  /** The rows on screen: digit pads for numeric fields, else the current page of the current layout. */
  function rows(): Row[] {
    const l = layout(), m = fieldMode(), p = page(), up = shift() > 0;
    let src: string[];
    if (m === 1) src = NUMERIC;
    else if (m === 2) src = DECIMAL;
    else if (m === 3) src = PHONE;
    else if (p === 1) src = SYMBOLS;
    else if (p === 2) src = SYMBOLS2;
    else src = withBottom(up && l.shiftRows.length > 0 ? l.shiftRows : l.rows, m);
    const upper = p === 0 && (m === 0 || m >= 4) && up && l.shiftRows.length === 0;   // letters: capitals while shifted
    return src.map((line: string) => parse(line, upper, l));
  }

  // ---- showing and hiding (auto mode): follow the focus, slide in from the bottom
  async function place(): Promise<void> {
    const n = ui.inspectNode(root.node);
    const h = n !== null ? n.lh : 280;
    if (shown()) { await ui.animate(root.node, 'translateY', 0, 220, 'out', 0); return; }
    await ui.animate(root.node, 'translateY', h, 180, 'in', 0);
    if (!shown()) ui.setNumber(root.node, 'hidden', 1);
  }
  if (!always) ui.onFocusChange((h: i32) => {
    const f = ui.focusedField();
    if (f >= 0) { setFieldMode(ui.fieldMode(f)); if (!shown()) { setShown(true); ui.setNumber(root.node, 'hidden', 0); ui.setNumber(root.node, 'translateY', 320); place(); } }
    else if (shown()) { setShown(false); place(); }
  });

  // ---- key actions
  function typeChar(ch: string): void {
    if (ui.focusedField() >= 0) ui.insertText(ch);
    emit(ch);
    if (shift() === 1) setShift(0);
  }
  function press(k: Key): void {
    if (!k.special) { typeChar(k.token); return; }
    const t = k.token;
    if (t === 'shift') {
      const now = ui.now();
      if (shift() === 0) setShift(now - lastShiftAt < 350 ? 2 : 1);
      else setShift(shift() === 1 && now - lastShiftAt < 350 ? 2 : 0);
      lastShiftAt = now;
      emit('Shift');
    } else if (t === 'bksp') { ui.sendKey('Backspace'); emit('Backspace'); }
    else if (t === 'enter') { ui.sendKey('Enter'); emit('Enter'); }
    else if (t === 'space') typeChar(' ');
    else if (t === 'sym') { setPage(1); }
    else if (t === 'sym2') { setPage(2); }
    else if (t === 'abc') { setPage(0); }
    else if (t === 'lang') { setLayoutIx((layoutIx() + 1) % ids.length); setPage(0); emit(`Layout:${layout().id}`); }
    else if (t === 'hide') { ui.focusNode(-1); emit('Hide'); }
    else if (t === 'left') ui.sendKey('ArrowLeft');
    else if (t === 'right') ui.sendKey('ArrowRight');
    else if (t === 'tab') ui.sendKey('Tab');
  }
  function clearTimers(): void {
    if (longTimer >= 0) { clearTimeout(longTimer); longTimer = -1; }
    if (repeatTimer >= 0) { clearInterval(repeatTimer); repeatTimer = -1; }
  }
  /** Box of a node relative to the keyboard. */
  function rel(h: i32): number[] {
    const b = ui.screenBox(h), r = ui.screenBox(root.node);
    return [b[0] - r[0], b[1] - r[1], b[2], b[3]];
  }
  function down(k: Key, node: NodeRef): void {
    clearTimers();
    pressToken = k.token; pressedAt = ui.now();
    const box = rel(node.node);
    if (!k.special && (props.preview ?? true)) { setBubble(k.label); setBubbleW(Math.max(box[2] + 16, keyH)); setBubbleX(box[0] + box[2] / 2); setBubbleY(box[1]); }
    if (k.token === 'bksp') {
      press(k);   // backspace acts on press and repeats while held
      longTimer = setTimeout(() => { repeatTimer = setInterval(() => press(k), REPEAT_MS); }, REPEAT_DELAY_MS);
      return;
    }
    const variants = k.special ? '' : (layout().accents.get(k.token.toLowerCase()) ?? '');
    if (variants !== '') longTimer = setTimeout(() => {
      const list: string[] = [];
      const upper = k.token !== k.token.toLowerCase();
      for (const ch of variants) list.push(upper ? ch.toUpperCase() : ch);
      setBubble('');
      setAccents(list); setAccentIx(0);
      setAccX(box[0]); setAccY(box[1] - keyH - 8);
    }, LONG_PRESS_MS);
  }
  function move(e: ui.PointerEvent): void {
    if (accents().length === 0) return;
    const r = ui.screenBox(root.node);
    const i: i32 = Math.floor((e.gx - r[0] - accX()) / cellW);
    setAccentIx(Math.max(0, Math.min(accents().length - 1, i)));
  }
  function up(k: Key): void {
    clearTimers();
    setBubble('');
    const list = accents();
    if (list.length > 0) { typeChar(list[accentIx()]); setAccents([]); return; }
    if (k.token !== 'bksp' && k.token === pressToken) press(k);
    pressToken = '';
  }

  // ---- views
  const baseKey = (): string => `items-center justify-center rounded-lg shadow-sm`;
  const letterClass = (): string => props.keyClass ?? `bg-${theme().card} text-${theme().foreground} active:bg-${theme().secondaryPressed}`;
  const specialClass = (k: Key): string => {
    if (k.token === 'enter') return props.specialKeyClass ?? `bg-${theme().accent} text-${theme().accentForeground} active:bg-${theme().primaryPressed}`;
    if (k.token === 'shift' && shift() > 0) return `bg-${theme().card} text-${theme().accent}`;
    return props.specialKeyClass ?? `bg-${theme().secondaryPressed} text-${theme().foreground} active:bg-${theme().border}`;
  };
  function KeyView(p: { k: Key }): i32 {
    const k = p.k, ref = createNodeRef();
    const size = k.special ? (k.token === 'space' || k.token === 'enter' ? 'text-sm' : 'text-base') : 'text-xl';
    return <View ref={ref} class={`${baseKey()} ${k.special ? specialClass(k) : letterClass()}`}
      style={{ height: keyH, width: 1, grow: Math.round(k.width * 10) }}
      onPointerDown={(e: ui.PointerEvent) => down(k, ref)}
      onPointerMove={(e: ui.PointerEvent) => move(e)}
      onPointerUp={(e: ui.PointerEvent) => up(k)}>
      <Text class={size}>{k.special ? specialLabel(k.token, layout()) : k.label}</Text>
    </View>;
  }
  function AccentView(p: { ch: string; index: i32 }): i32 {
    return <View class={`items-center justify-center rounded-md ${accentIx() === p.index ? `bg-${theme().accent} text-${theme().accentForeground}` : `text-${theme().foreground}`}`}
      style={{ width: cellW, height: keyH }}>
      <Text class="text-xl">{p.ch}</Text>
    </View>;
  }

  return <View ref={root} keepFocus class={`flex-col p-2 bg-${theme().muted} border-t border-${theme().border} ${props.class ?? ''}`}
    style={{ gap: gap, hidden: always ? 0 : 1 }}>
    {rows().map((r: Row) => <View class="flex-row justify-center" style={{ gap: gap }}>
      {r.keys.map((k: Key) => <KeyView k={k} />)}
    </View>)}
    <View class={`absolute items-center justify-center rounded-xl shadow-lg bg-${theme().card} text-${theme().foreground}`}
      style={{ hidden: bubble() === '' ? 1 : 0, left: bubbleX() - bubbleW() / 2, top: bubbleY() - keyH - 12, width: bubbleW(), height: keyH + 8 }}>
      <Text class="text-3xl">{bubble()}</Text>
    </View>
    <View class={`absolute flex-row p-1 gap-1 rounded-xl shadow-lg border ${props.accentClass ?? `bg-${theme().card} border-${theme().border}`}`}
      style={{ hidden: accents().length === 0 ? 1 : 0, left: accX(), top: accY() }}>
      {accents().map((ch: string, i: i32) => <AccentView ch={ch} index={i} />)}
    </View>
  </View>;
}
