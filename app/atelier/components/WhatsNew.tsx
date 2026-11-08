// What's new (ZN-774.24): after an update, once, a card in the corner (not a dialog: the window stays usable) with this version's lines of
// CHANGELOG.md (`zinc changelog`). The version seen last is kept in Atelier's marker file (~/.zinc/atelier.json, beside the tour's);
// a first launch only remembers it. "Don't show again" turns the card off (`whatsNew: false`); Help > What's New shows it any time.
import { createSignal } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme, bg, fg, bd } from 'zinc:editor';
import { zinc } from '../app/tools';
import { marker, saveMarker } from '../app/tour';
import { t } from '../app/text';

const [notes, setNotes] = createSignal<string[]>([]);
const MAX_LINES: i32 = 8, MAX_CHARS: i32 = 120;   // a card, not the whole release: `zinc changelog` and the release page have the rest

/** Reads what `zinc <args>` prints, then calls `done` with it ('' when it failed). */
function read(args: string[], done: (out: string) => void): void {
  let out = '';
  try {
    const p = zinc(args, '');
    p.onData((chunk: string, stderr: boolean) => { if (!stderr) out += chunk; });
    p.onExit((code: i32) => done(code === 0 ? out : ''));
  } catch (e) { done(''); }
}
/** The card's lines: the release's opening sentence, its theme headings and its bullets, without the Markdown marks. */
function linesOf(md: string): string[] {
  const out: string[] = [];
  for (const raw of md.split('\n')) {
    const l = raw.trim();
    if (l === '' || l.startsWith('## ') || l.startsWith('#### ')) continue;
    let x = (l.startsWith('### ') ? l.slice(4) : l.startsWith('- ') ? '• ' + l.slice(2) : l).split('`').join('').split('**').join('');
    if (x.length > MAX_CHARS) x = x.slice(0, x.lastIndexOf(' ', MAX_CHARS)) + ' …';
    out.push(x);
    if (out.length >= MAX_LINES) { out.push('…'); break; }
  }
  return out;
}
/** Shows this version's notes now (Help > What's New). */
export function showWhatsNew(): void { read(['changelog'], (md: string) => { if (md !== '') setNotes(linesOf(md)); }); }
/** At start: the card once after an update, unless turned off. */
export function checkWhatsNew(): void {
  const d = marker();
  if (d.whatsNew === false) return;
  read(['version'], (v: string) => {
    const version = v.trim();
    if (version === '') return;
    const seen: string = typeof d.seenVersion === 'string' ? d.seenVersion : '';
    if (seen === version) return;
    d.seenVersion = version;
    saveMarker(d);
    if (seen !== '') showWhatsNew();   // a first launch is not an update
  });
}
function off(): void { const d = marker(); d.whatsNew = false; saveMarker(d); setNotes([]); }

export function WhatsNew(): i32 {
  return <View className={`absolute right-[16] bottom-[44] w-[420] flex-col p-4 gap-1.5 rounded-2xl border shadow-xl ${bg(theme().elevated)} ${bd(theme().border)}`}
    style={{ hidden: notes().length === 0 ? 1 : 0 }} onPointerDown={() => {}}>
    <Text className={`text-[15px] font-semibold ${fg(theme().text)}`}>{t('atelier.whatsnew.title')}</Text>
    {notes().map((l: string) => <Text className={`text-[12px] leading-[17] ${fg(l.startsWith('• ') ? theme().text : theme().muted)}`}>{l}</Text>)}
    <View className="flex-row items-center justify-end gap-3 pt-2">
      <Text className={`text-[12px] font-medium cursor-pointer ${fg(theme().muted)}`} onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) off(); }}>{t('atelier.whatsnew.off')}</Text>
      <View className={`h-[28] px-3.5 rounded-full items-center justify-center cursor-pointer ${bg(theme().accent)}`} onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) setNotes([]); }}>
        <Text className={`text-[13px] font-semibold ${fg(theme().onAccent)}`}>{t('atelier.whatsnew.close')}</Text>
      </View>
    </View>
  </View>;
}
