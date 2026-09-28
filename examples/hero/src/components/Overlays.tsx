// Layers above the app: toasts (bottom right), the modal dialog and the command palette.
// A dimmed backdrop closes the dialog / palette on click; the panels have an onClick of their own so that clicks
// inside them do not fall through to the backdrop (plain views are transparent to the pointer).
import { createSignal, createMemo, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme, Button, Kbd } from 'zinc:ui/kit';
import { Toast, toasts, dismiss, dialog, dialogT, closeDialog, Dialog, paletteOpen, paletteT, closePalette } from '../app/overlays';
import { COMMANDS, Command } from '../app/commands';

// ---- toasts
function toneDot(tone: string): string { return tone === 'success' ? 'bg-emerald-500' : tone === 'destructive' ? 'bg-rose-500' : `bg-${theme().accent}`; }

function ToastCard(props: { t: Toast }): i32 {
  const t = props.t;
  return <View class={`flex-row gap-3 p-4 rounded-xl border shadow-lg cursor-pointer bg-${theme().card} border-${theme().border}`}
    style={{ translateX: Math.round(t.enter.get() * 380), opacity: t.fade.get() }}
    onClick={() => dismiss(t)}>
    <View class={`w-2 h-2 mt-1.5 rounded-full ${toneDot(t.tone)}`} />
    <View class="flex-col gap-0.5 grow">
      <Text class={`text-sm font-semibold text-${theme().foreground}`}>{t.title}</Text>
      {t.body !== '' ? <Text class={`text-sm text-${theme().mutedForeground}`}>{t.body}</Text> : <View />}
    </View>
  </View>;
}

function Toasts(): i32 {
  return <View class="absolute right-6 bottom-6 w-[340] flex-col gap-2">
    {toasts().map((t: Toast) => <ToastCard t={t} />)}
  </View>;
}

// ---- modal dialog
function DialogPanel(props: { d: Dialog }): i32 {
  const d = props.d;
  return <View class={`flex-col gap-4 w-[440] p-6 rounded-2xl border shadow-xl bg-${theme().card} border-${theme().border}`}
    style={{ opacity: dialogT.get(), translateY: Math.round((1 - dialogT.get()) * 18) }}
    onClick={() => {}}>
    <Text class={`text-lg font-bold text-${theme().foreground}`}>{d.title}</Text>
    <Text class={`text-sm text-${theme().mutedForeground}`}>{d.body}</Text>
    <View class="flex-row justify-end gap-2 pt-2">
      <Button label="Cancel" variant="outline" onClick={() => closeDialog()} />
      <Button label={d.confirm} variant={d.destructive ? 'destructive' : 'default'} onClick={() => { d.onConfirm(); closeDialog(); }} />
    </View>
  </View>;
}

function Modal(): i32 {
  return <View class="absolute inset-0 items-center justify-center" style={{ hidden: dialog() === null ? 1 : 0 }}>
    <View class="absolute inset-0 bg-black" style={{ opacity: dialogT.get() * 0.45 }} onClick={() => closeDialog()} />
    {dialog() !== null ? <DialogPanel d={dialog() as Dialog} /> : <View />}
  </View>;
}

// ---- command palette: type to filter, arrows to choose, Enter to run
const [query, setQuery] = createSignal<string>('');
const [cursor, setCursor] = createSignal<i32>(0);
const matches = createMemo<Command[]>(() => {
  const q = query().trim().toLowerCase();
  return COMMANDS.filter((c: Command) => q === '' || c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
}, COMMANDS);
export const paletteInput = createNodeRef();

function run(c: Command): void { closePalette(); c.run(); }

function paletteKey(e: ui.KeyEvent): void {
  const n = matches().length;
  if (e.key === 'ArrowDown') { setCursor(n > 0 ? (cursor() + 1) % n : 0); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { setCursor(n > 0 ? (cursor() - 1 + n) % n : 0); e.preventDefault(); }
  else if (e.key === 'Enter') { if (n > 0) run(matches()[Math.min(cursor(), n - 1)]); e.preventDefault(); }
  else if (e.key === 'Escape') { closePalette(); e.preventDefault(); }
}

/** Resets the query and puts the caret in the search field (called when the palette opens). */
export function preparePalette(): void {
  setQuery('');
  setCursor(0);
  ui.focusNode(paletteInput.node);
}

function CommandRow(props: { c: Command }): i32 {
  const c = props.c;
  // rows are keyed by command, so the position is looked up (it changes as the query filters the list)
  const on = (): boolean => matches().indexOf(c) === cursor();
  return <View class={`flex-row items-center gap-3 h-10 px-3 rounded-lg cursor-pointer ${on() ? `bg-${theme().accentSoft}` : ''}`}
    onClick={() => run(c)} onPointerEnter={(e: ui.PointerEvent) => setCursor(matches().indexOf(c))}>
    <Text class={`text-xs font-semibold w-[76] text-${theme().mutedForeground}`}>{c.group}</Text>
    <Text class={`text-sm grow ${on() ? `text-${theme().accentSoftForeground}` : `text-${theme().foreground}`}`}>{c.label}</Text>
    {c.keys !== '' ? <Kbd label={c.keys} /> : <View />}
  </View>;
}

function Palette(): i32 {
  return <View class="absolute inset-0 items-center pt-24" style={{ hidden: paletteOpen() ? 0 : 1 }}>
    <View class="absolute inset-0 bg-black" style={{ opacity: paletteT.get() * 0.35 }} onClick={() => closePalette()} />
    <View class={`flex-col w-[560] rounded-2xl border shadow-xl bg-${theme().card} border-${theme().border}`}
      style={{ opacity: paletteT.get(), translateY: Math.round((1 - paletteT.get()) * -12) }} onClick={() => {}}>
      <View class={`flex-row items-center px-4 h-14 border-b border-${theme().border}`}>
        <Input ref={paletteInput} class={`grow text-base bg-transparent border-0 text-${theme().foreground}`} placeholder="Type a command or search…"
          value={query()} onInput={(v: string) => { setQuery(v); setCursor(0); }} onKeyDown={paletteKey} />
        <Kbd label="Esc" />
      </View>
      <ScrollView class="flex-col p-2 gap-0.5 h-[320]">
        {matches().map((c: Command) => <CommandRow c={c} />)}
      </ScrollView>
      <View class={`flex-row items-center gap-4 px-4 h-10 border-t border-${theme().border}`}>
        <Text class={`text-xs text-${theme().mutedForeground}`}>{`${matches().length} result${matches().length === 1 ? '' : 's'}`}</Text>
        <View class="grow" />
        <Text class={`text-xs text-${theme().mutedForeground}`}>↑↓ to choose · Enter to run</Text>
      </View>
    </View>
  </View>;
}

export function Overlays(): i32 {
  return <View class="absolute inset-0">
    <Toasts />
    <Modal />
    <Palette />
  </View>;
}
