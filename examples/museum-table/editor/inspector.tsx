// The panel at the right: what is selected, and what can be done with it.
// On the storyboard: a sequence (its title in every language, where the visit starts, its links), a link (its label, how its target opens),
// or the project and how the storyboard works. On the table of a sequence: a medium (its place and times on the table, its caption and
// descriptions in every language side by side, its credit), a button or a hotspot, or the sequence itself.
// The advanced mode adds exact numbers and the selection as the file has it; it calls the same commands as the gestures.
import { createNodeRef, createEffect, NodeRef, For, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Sequence, Media, Item, Link } from '../src/project';
import { project, lang, selected, selectedLink, selectedItem, shownMedia, opened, select, pick, nameIt, done, renameSelected, duplicateSelected, deleteSelection, startHere, setLinkLabel,
  setLinkTransition, setLinkOverlay, advanced, selectionJson, placeSelected, openSequence, retargetSelected, moveItem, resizeItem, rotateItem, timeItem, raiseItem, moveLink, timeLink,
  addLinkFrom, placeMedia, removeMediaCommand, setMediaText, setMediaCredit, setSequenceText, setSequenceDuration } from './state';
import { Ico, Action, Segmented, LangField, LangColumns, PlainField, NumberField, Heading, ACCENT, MUTED, WARN, kindIndex } from './widgets';
import * as L from './strings';
import { t, f } from './strings';

function say(s: Sequence | null): string { return s === null ? '' : project().say(s.title, lang()); }
function count(n: i32, one: i32, many: i32): string { return n === 1 ? t(one) : f(many, `${n}`); }
function hint(first: boolean): string { return t(first ? L.REQUIRED : L.NOT_TRANSLATED); }
/** The width of one language column in the wide panel of the table view. */
const COLUMN = 200;

/** The selection as the file has it, read only (advanced mode): what an agency checks, and what a support request quotes. */
function Written(): i32 {
  return <view class="flex-col gap-2">
    <Heading label={t(L.IN_FILE)} />
    <textarea readOnly wrap={false} class="font-mono text-[11px] text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-md p-2" style={{ height: 190 }} value={selectionJson()} />
  </view>;
}
/** The links of the selected sequence: a click selects one. */
function LinkList(p: { onPick: (l: Link) => void }): i32 {
  const links = (): Link[] => { const s = selected(); project(); return s === null ? [] : s.links; };
  return <view class="flex-col gap-1">
    <For each={links()}>{(l: Link, i: i32) => <button class="flex-row items-center justify-start gap-2 h-8 px-2 rounded-md cursor-pointer bg-zinc-950 border border-zinc-800 hover:border-zinc-600"
      onClick={() => p.onPick(l)}>
      <Ico name={(project(), l.on.length > 0) ? 'mouse-pointer-click' : 'arrow-right'} size={13} color={MUTED} />
      <text class="truncate text-xs text-zinc-100" style={{ width: 138 }}>{project().say(l.label, lang())}</text>
      <text class="truncate text-xs text-right text-zinc-500" style={{ width: 100 }}>{say(project().sequence(l.to))}</text>
    </button>}</For>
  </view>;
}

// ---------------------------------------------------------------- on the storyboard

let titleField: NodeRef | null = null, answered: i32 = 0;
function SequencePanel(): i32 {
  const title = (language: string): string => { const s = selected(); project(); return s === null ? '' : s.title.get(language) ?? ''; };
  const incoming = (): i32 => {
    const s = selected();
    let n: i32 = 0;
    if (s !== null) for (const other of project().sequences) for (const l of other.links) if (l.to === s.id && other !== s) n++;
    return n;
  };
  const isStart = (): boolean => { const s = selected(); return s !== null && project().start === s.id; };
  const none = (): boolean => { const s = selected(); project(); return s === null || s.links.length === 0; };
  // a new sequence is named at once: the caret goes to its title, all of it selected
  createEffect(() => {
    const asked = nameIt();
    if (asked === answered) return;   // the panel is also built when a sequence is merely selected
    answered = asked;
    queueMicrotask(() => {
      const field = titleField;
      if (field === null || field.node < 0) return;
      ui.focusNode(field.node);
      ui.select(field.node, 0, ui.getValue(field.node).length);
    });
  });
  return <view class="flex-col gap-5 p-4">
    <view class="flex-col gap-1">
      <Heading label={t(L.SEQUENCE)} />
      <text class="text-lg font-bold text-zinc-100 truncate">{say(selected())}</text>
    </view>
    <view class="flex-col gap-2">
      <Heading label={t(L.TITLE)} />
      <For each={project().languages}>{(language: string, i: i32) => {
        const ref = createNodeRef();
        if (i === 0) titleField = ref;
        return <LangField language={language} value={() => title(language)} placeholder={hint(i === 0)} field={ref} onInput={(v: string) => renameSelected(language, v)} onDone={done} />;
      }}</For>
    </view>
    <view class="flex-row"><Action icon="layers" label={t(L.OPEN_SEQUENCE)} look="primary" onClick={() => { const s = selected(); if (s !== null) openSequence(s); }} /></view>
    <view class="flex-col gap-2">
      <Heading label={t(L.VISIT)} />
      <Show when={isStart()}>
        <view class="flex-row items-center gap-2 h-8 px-3 rounded-md bg-zinc-800">
          <Ico name="flag" size={14} color={ACCENT} />
          <text class="text-xs text-zinc-100">{t(L.STARTS_HERE)}</text>
        </view>
      </Show>
      <Show when={!isStart()}>
        <view class="flex-row"><Action icon="flag" label={t(L.START_HERE)} look="plain" onClick={startHere} /></view>
      </Show>
      <Show when={!isStart() && incoming() === 0}>
        <view class="flex-row items-center gap-2">
          <Ico name="triangle-alert" size={14} color={WARN} />
          <text class="text-xs text-orange-300" style={{ width: 262 }}>{t(L.NO_LINK_HERE)}</text>
        </view>
      </Show>
      <Show when={incoming() > 0}><text class="text-xs text-zinc-400">{count(incoming(), L.ONE_LEADS_HERE, L.N_LEAD_HERE)}</text></Show>
    </view>
    <view class="flex-col gap-2">
      <Heading label={t(L.LINKS_OUT)} />
      <Show when={none()}><text class="text-xs text-zinc-500">{t(L.NO_LINK_YET)}</text></Show>
      <LinkList onPick={(l: Link) => select(selected(), l)} />
    </view>
    <view class="flex-row gap-2">
      <Action icon="copy" label={t(L.DUPLICATE)} look="plain" onClick={duplicateSelected} />
      <Action icon="trash" label={t(L.DELETE)} look="danger" onClick={deleteSelection} />
    </view>
    <Show when={advanced()}>
      <view class="flex-col gap-2">
        <Heading label={t(L.PLACE)} />
        <view class="flex-row gap-3">
          <NumberField label="X" value={() => { const s = selected(); project(); return s === null ? 0 : s.storyX; }} onCommit={(v: number) => { const s = selected(); if (s !== null) placeSelected(v, s.storyY); }} onDone={done} />
          <NumberField label="Y" value={() => { const s = selected(); project(); return s === null ? 0 : s.storyY; }} onCommit={(v: number) => { const s = selected(); if (s !== null) placeSelected(s.storyX, v); }} onDone={done} />
        </view>
      </view>
    </Show>
    <Show when={advanced()}><Written /></Show>
  </view>;
}

/** A link: on the storyboard and, with its times and its place, on the table of its sequence. */
function LinkPanel(): i32 {
  const link = (): Link | null => { project(); return selectedLink(); };
  const label = (language: string): string => { const l = link(); return l === null ? '' : l.label.get(language) ?? ''; };
  const target = (): Sequence | null => { const l = link(); return l === null ? null : project().sequence(l.to); };
  const spot = (): boolean => { const l = link(); return l !== null && l.on.length > 0; };
  return <view class="flex-col gap-5 p-4">
    <view class="flex-col gap-1">
      <Heading label={t(L.LINK)} />
      <view class="flex-row items-center gap-2 h-7">
        <text class="truncate text-sm font-bold text-zinc-100" style={{ maxWidth: 125 }}>{say(selected())}</text>
        <Ico name="arrow-right" size={14} color={ACCENT} />
        <text class="truncate text-sm font-bold text-zinc-100" style={{ maxWidth: 125 }}>{say(target())}</text>
      </view>
      <text class="text-xs text-zinc-500">{t(spot() ? L.HOTSPOT_WHAT : L.LINK_WHAT)}</text>
    </view>
    <view class="flex-col gap-2">
      <Heading label={t(L.BUTTON_LABEL)} />
      <For each={project().languages}>{(language: string, i: i32) =>
        <LangField language={language} value={() => label(language)} placeholder={hint(i === 0)} field={createNodeRef()} onInput={(v: string) => setLinkLabel(language, v)} onDone={done} />}</For>
    </view>
    <view class="flex-col gap-2">
      <Heading label={t(L.LEADS_TO)} />
      <view class="flex-row items-center gap-2">
        <text class="grow truncate text-sm text-zinc-100" style={{ width: 150 }}>{say(target())}</text>
        <view class="w-[110] flex-row"><Action icon="pencil" label={t(L.CHANGE)} look="plain" onClick={retargetSelected} /></view>
      </view>
    </view>
    <view class="flex-col gap-2">
      <Heading label={t(L.TARGET_OPENS)} />
      <Segmented options={['replace', 'overlay']} labels={[t(L.IN_PLACE), t(L.OVER_IT)]} value={() => { const l = link(); return l !== null && l.overlay ? 'overlay' : 'replace'; }}
        onPick={(v: string) => setLinkOverlay(v === 'overlay')} />
      <text class="text-xs text-zinc-500">{t(L.OVER_WHAT)}</text>
    </view>
    <view class="flex-col gap-2">
      <Heading label={t(L.TRANSITION)} />
      <Segmented options={['fade', 'slide', 'none']} labels={[t(L.FADE), t(L.SLIDE), t(L.NONE)]} value={() => { const l = link(); return l === null ? 'fade' : l.transition; }} onPick={setLinkTransition} />
    </view>
    <Show when={opened() !== null}>
      <view class="flex-col gap-2">
        <Heading label={t(L.TIMES)} />
        <view class="flex-row gap-3">
          <NumberField label={t(L.FROM)} value={() => { const l = link(); return l === null ? 0 : l.at; }} onCommit={(v: number) => { const l = link(); if (l !== null) timeLink(l, v, l.until); }} onDone={done} />
          <NumberField label={t(L.UNTIL)} value={() => { const l = link(); return l === null ? 0 : l.until; }} onCommit={(v: number) => { const l = link(); if (l !== null) timeLink(l, l.at, v); }} onDone={done} />
        </view>
        <text class="text-xs text-zinc-500">{t(L.UNTIL_END)}</text>
      </view>
    </Show>
    <Show when={opened() !== null && advanced()}>
      <view class="flex-col gap-2">
        <Heading label={t(L.POSITION)} />
        <view class="flex-row gap-3">
          <NumberField label="X" value={() => { const l = link(); return l === null ? 0 : l.x; }} onCommit={(v: number) => { const l = link(); if (l !== null) moveLink(l, v, l.y); }} onDone={done} />
          <NumberField label="Y" value={() => { const l = link(); return l === null ? 0 : l.y; }} onCommit={(v: number) => { const l = link(); if (l !== null) moveLink(l, l.x, v); }} onDone={done} />
        </view>
      </view>
    </Show>
    <view class="flex-row"><Action icon="trash" label={t(L.DELETE_LINK)} look="danger" onClick={deleteSelection} /></view>
    <Show when={advanced()}><Written /></Show>
  </view>;
}

function Tip(p: { icon: string; text: string }): i32 {
  return <view class="flex-row gap-3">
    <Ico name={p.icon} size={15} color={MUTED} />
    <text class="text-xs text-zinc-400" style={{ width: 258 }}>{p.text}</text>
  </view>;
}
/** Every command has a key; the advanced mode lists them. */
const KEYS: string[] = ['N', 'Enter', 'O', 'S', 'Ctrl D', 'Delete', 'Ctrl Z', 'Shift Ctrl Z', 'Ctrl S', 'Shift Ctrl S', 'Ctrl O', 'Ctrl N', 'Ctrl 0', 'Ctrl + / -', 'L', 'Ctrl E', 'Escape'];
const KEY_DOES: i32[] = [L.KEY_NEW_SEQUENCE, L.KEY_NAME, L.KEY_OPEN_SEQUENCE, L.KEY_START, L.DUPLICATE, L.KEY_DELETE, L.UNDO, L.REDO, L.SAVE, L.SAVE_AS, L.KEY_OPEN, L.KEY_NEW, L.KEY_FIT, L.KEY_ZOOM,
  L.KEY_LANGUAGE, L.KEY_ADVANCED, L.KEY_ESCAPE];
function ProjectPanel(): i32 {
  const links = (): i32 => { let n: i32 = 0; for (const s of project().sequences) n += s.links.length; return n; };
  return <view class="flex-col gap-5 p-4">
    <view class="flex-col gap-1">
      <Heading label={t(L.PROJECT)} />
      <text class="text-lg font-bold text-zinc-100">{project().say(project().title, lang())}</text>
      <text class="text-xs text-zinc-400">{`${count(project().sequences.length, L.ONE_SEQUENCE, L.N_SEQUENCES)}, ${count(links(), L.ONE_LINK, L.N_LINKS)}, ${count(project().media.length, L.ONE_MEDIUM, L.N_MEDIA)}`}</text>
    </view>
    <view class="flex-col gap-3">
      <Heading label={t(L.HOW)} />
      <Tip icon="mouse-pointer-click" text={t(L.TIP_CREATE)} />
      <Tip icon="link" text={t(L.TIP_LINK)} />
      <Tip icon="layers" text={t(L.TIP_DASHED)} />
      <Tip icon="flag" text={t(L.TIP_START)} />
      <Tip icon="triangle-alert" text={t(L.TIP_LOST)} />
      <Tip icon="pencil" text={t(L.TIP_EDIT)} />
    </view>
    <Show when={advanced()}>
      <view class="flex-col gap-2">
        <Heading label={t(L.KEYS)} />
        {KEYS.map((key: string, i: i32) => <view class="flex-row items-center gap-3">
          <text class="w-[92] text-[11px] font-bold text-zinc-300">{key}</text>
          <text class="text-xs text-zinc-400">{t(KEY_DOES[i])}</text>
        </view>)}
      </view>
    </Show>
  </view>;
}

// ---------------------------------------------------------------- on the table of a sequence

function fileOf(m: Media | null): string { return m === null ? '' : `${t(L.FILE)}: ${m.file}`; }
function textOf(m: Media | null, field: string, language: string): string {
  if (m === null) return '';
  const text = field === 'title' ? m.title : field === 'description' ? m.description : field === 'audioDescription' ? m.audioDescription : m.text;
  return text.get(language) ?? '';
}
/** A text of the shown medium in every language, side by side. */
function MediaText(p: { label: string; field: string; rows: i32 }): i32 {
  return <view class="flex-col gap-1">
    <Heading label={p.label} />
    <LangColumns rows={p.rows} width={COLUMN} value={(language: string) => textOf(shownMedia(), p.field, language)} placeholder={(first: boolean) => p.field === 'title' || p.field === 'text' ? hint(first) : first ? '' : t(L.NOT_TRANSLATED)}
      onInput={(language: string, v: string) => setMediaText(p.field, language, v)} onDone={done} />
  </view>;
}
function MediaPanel(): i32 {
  const m = shownMedia;
  const it = (): Item | null => { project(); return selectedItem(); };
  const isText = (): boolean => { const x = m(); return x !== null && x.kind === 'text'; };
  const credit = (field: string): string => {
    const x = m();
    if (x === null) return '';
    return field === 'creator' ? x.creator : field === 'source' ? x.credit.source : field === 'licence' ? x.credit.licence : field === 'institution' ? x.credit.institution : x.credit.line;
  };
  const num = (get: (i: Item) => number): number => { const i = it(); return i === null ? 0 : get(i); };
  return <view class="flex-col gap-5 p-4">
    <view class="flex-col gap-1">
      <Heading label={t(L.KIND_NAMES[Math.max(0, kindIndex(m()))])} />
      <text class="text-lg font-bold text-zinc-100 truncate">{textOf(m(), 'title', lang()).length > 0 ? textOf(m(), 'title', lang()) : textOf(m(), 'title', project().languages[0])}</text>
      <Show when={!isText()}><text class="truncate text-xs text-zinc-500">{fileOf(m())}</text></Show>
    </view>
    <Show when={it() !== null}>
      <view class="flex-col gap-2">
        <Heading label={t(L.ON_TABLE)} />
        <view class="flex-row gap-2">
          <Action icon="chevron-up" label={t(L.FORWARD)} look="plain" onClick={() => { const i = it(); if (i !== null) raiseItem(i, 1); }} />
          <Action icon="chevron-down" label={t(L.BACKWARD)} look="plain" onClick={() => { const i = it(); if (i !== null) raiseItem(i, -1); }} />
          <Action icon="trash" label={t(L.OFF_TABLE)} look="danger" onClick={deleteSelection} />
        </view>
        <text class="text-[11px] text-zinc-400">{t(L.TIMES)}</text>
        <view class="flex-row gap-3">
          <NumberField label={t(L.FROM)} value={() => num((i: Item) => i.at)} onCommit={(v: number) => { const i = it(); if (i !== null) timeItem(i, v, i.until); }} onDone={done} />
          <NumberField label={t(L.UNTIL)} value={() => num((i: Item) => i.until)} onCommit={(v: number) => { const i = it(); if (i !== null) timeItem(i, i.at, v); }} onDone={done} />
        </view>
        <text class="text-xs text-zinc-500">{t(L.UNTIL_END)}</text>
        <view class="flex-row"><Action icon="mouse-pointer-click" label={t(L.ADD_HOTSPOT)} look="plain" onClick={() => addLinkFrom(it())} /></view>
      </view>
    </Show>
    <Show when={it() !== null && advanced()}>
      <view class="flex-col gap-2">
        <Heading label={t(L.POSITION)} />
        <view class="flex-row gap-3">
          <NumberField label="X" value={() => num((i: Item) => i.x)} onCommit={(v: number) => { const i = it(); if (i !== null) moveItem(i, v, i.y); }} onDone={done} />
          <NumberField label="Y" value={() => num((i: Item) => i.y)} onCommit={(v: number) => { const i = it(); if (i !== null) moveItem(i, i.x, v); }} onDone={done} />
          <NumberField label={t(L.ROTATION)} value={() => num((i: Item) => i.rotation)} onCommit={(v: number) => { const i = it(); if (i !== null) rotateItem(i, v); }} onDone={done} />
        </view>
        <view class="flex-row gap-3">
          <NumberField label={t(L.WIDTH)} value={() => num((i: Item) => i.width)} onCommit={(v: number) => { const i = it(); if (i !== null) resizeItem(i, v, i.height); }} onDone={done} />
          <NumberField label={t(L.HEIGHT)} value={() => num((i: Item) => i.height)} onCommit={(v: number) => { const i = it(); if (i !== null) resizeItem(i, i.width, v); }} onDone={done} />
        </view>
        <text class="text-xs text-zinc-500">{f(L.HEIGHT_AUTO, `${project().table.width}`, `${project().table.height}`)}</text>
      </view>
    </Show>
    <Show when={it() === null}>
      <view class="flex-row"><Action icon="plus" label={t(L.PUT_ON_TABLE)} look="primary" onClick={() => { const x = m(); if (x !== null) placeMedia(x, project().table.width / 2, project().table.height / 2); }} /></view>
    </Show>
    <MediaText label={t(L.CAPTION)} field="title" rows={1} />
    <Show when={isText()}><MediaText label={t(L.BODY)} field="text" rows={4} /></Show>
    <MediaText label={t(L.DESCRIPTION)} field="description" rows={4} />
    <MediaText label={t(L.AUDIO_DESCRIPTION)} field="audioDescription" rows={3} />
    <view class="flex-col gap-2">
      <Heading label={t(L.CREDIT)} />
      <PlainField label={t(L.CREATOR)} value={() => credit('creator')} placeholder="" onInput={(v: string) => setMediaCredit('creator', v)} onDone={done} />
      <Show when={!isText()}>
        <view class="flex-col gap-2">
          <PlainField label={t(L.SOURCE)} value={() => credit('source')} placeholder={t(L.REQUIRED)} onInput={(v: string) => setMediaCredit('source', v)} onDone={done} />
          <PlainField label={t(L.LICENCE)} value={() => credit('licence')} placeholder={t(L.REQUIRED)} onInput={(v: string) => setMediaCredit('licence', v)} onDone={done} />
          <PlainField label={t(L.INSTITUTION)} value={() => credit('institution')} placeholder="" onInput={(v: string) => setMediaCredit('institution', v)} onDone={done} />
          <PlainField label={t(L.CREDIT_LINE)} value={() => credit('line')} placeholder="" onInput={(v: string) => setMediaCredit('line', v)} onDone={done} />
        </view>
      </Show>
    </view>
    <view class="flex-row"><Action icon="trash" label={t(L.REMOVE_FROM_PROJECT)} look="danger" onClick={() => { const x = m(); if (x !== null) removeMediaCommand(x); }} /></view>
  </view>;
}
/** The open sequence itself: its title and introduction in every language, its buttons. */
function TablePanel(): i32 {
  const s = (): Sequence | null => { project(); return selected(); };
  const none = (): boolean => { const x = s(); return x === null || x.links.length === 0; };
  return <view class="flex-col gap-5 p-4">
    <view class="flex-col gap-1">
      <Heading label={t(L.SEQUENCE)} />
      <text class="text-lg font-bold text-zinc-100 truncate">{say(selected())}</text>
      <text class="text-xs text-zinc-500">{t(L.SEQUENCE_HINT)}</text>
    </view>
    <view class="flex-col gap-1">
      <Heading label={t(L.TITLE)} />
      <LangColumns rows={1} width={COLUMN} value={(language: string) => { const x = s(); return x === null ? '' : x.title.get(language) ?? ''; }} placeholder={hint}
        onInput={(language: string, v: string) => renameSelected(language, v)} onDone={done} />
    </view>
    <view class="flex-col gap-1">
      <Heading label={t(L.INTRODUCTION)} />
      <LangColumns rows={3} width={COLUMN} value={(language: string) => { const x = s(); return x === null ? '' : x.text.get(language) ?? ''; }} placeholder={(first: boolean) => first ? '' : t(L.NOT_TRANSLATED)}
        onInput={(language: string, v: string) => setSequenceText(language, v)} onDone={done} />
    </view>
    <view class="flex-col gap-2">
      <Heading label={t(L.BUTTONS)} />
      <Show when={none()}><text class="text-xs text-zinc-500">{t(L.NO_BUTTON_YET)}</text></Show>
      <LinkList onPick={(l: Link) => pick(null, l, null)} />
      <view class="flex-row"><Action icon="plus" label={t(L.ADD_BUTTON)} look="plain" onClick={() => addLinkFrom(null)} /></view>
    </view>
    <view class="flex-col gap-2">
      <text class="text-[11px] text-zinc-400">{t(L.DURATION)}</text>
      <view class="flex-row"><NumberField label="" value={() => { const x = s(); return x === null ? 0 : x.duration; }} onCommit={setSequenceDuration} onDone={done} /></view>
    </view>
    <Show when={advanced()}><Written /></Show>
  </view>;
}

export function Inspector(): i32 {
  return <scroll class={`shrink-0 flex-col bg-zinc-900 border-l border-zinc-800 ${opened() !== null ? 'w-[440]' : 'w-[320]'}`}>
    <Show when={opened() === null && selected() !== null && selectedLink() === null}><SequencePanel /></Show>
    <Show when={selected() !== null && selectedLink() !== null}><LinkPanel /></Show>
    <Show when={opened() === null && selected() === null}><ProjectPanel /></Show>
    <Show when={opened() !== null && selectedLink() === null && shownMedia() !== null}><MediaPanel /></Show>
    <Show when={opened() !== null && selectedLink() === null && shownMedia() === null}><TablePanel /></Show>
  </scroll>;
}
