// The panel at the right: what is selected, and what can be done with it.
// On the storyboard: a sequence (its title in every language, where the visit starts, its links), a link (its label, how its target opens),
// or the project and how the storyboard works. On the table of a sequence: a medium (its place and times on the table, its caption and
// descriptions in every language side by side, its credit), a button or a hotspot, or the sequence itself.
// The advanced mode adds exact numbers and the selection as the file has it; it calls the same commands as the gestures.
import { createNodeRef, createEffect, NodeRef, For, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Sequence, Media, Item, Link, Point, View as SavedView, LIGHTS } from '../src/project';
import { project, lang, selected, selectedLink, selectedItem, shownMedia, opened, select, pick, nameIt, done, renameSelected, duplicateSelected, deleteSelection, startHere, setLinkLabel,
  setLinkTransition, setLinkOverlay, advanced, selectionJson, placeSelected, openSequence, retargetSelected, moveItem, resizeItem, rotateItem, timeItem, raiseItem, moveLink, timeLink,
  addLinkFrom, placeMedia, removeMediaCommand, setMediaText, setMediaCredit, setSequenceText, setSequenceDuration, openSettings, pointing, selectedPoint, pickPoint, openPoints, namePoint,
  setPointText, useView, setLight, retargetPoint, clearPointTarget, deletePoint, movePoint, pointedJson, narrate, chooseNext, clearNext, setMediaFile, setMediaLoop, lengthOf, listen } from './state';
import { currentView, showView } from './points';
import { Ico, Action, Segmented, LangField, LangColumns, PlainField, NumberField, Heading, ACCENT, MUTED, WARN, kindIndex } from './widgets';
import * as L from './strings';
import { t, f } from './strings';

function say(s: Sequence | null): string { return s === null ? '' : project().say(s.title, lang()); }
function count(n: i32, one: i32, many: i32): string { return n === 1 ? t(one) : f(many, `${n}`); }
function hint(first: boolean): string { return t(first ? L.REQUIRED : L.NOT_TRANSLATED); }
/** The width of one language column in the wide panel of the table view: the columns of every language share it. */
function column(): number { const n = project().languages.length; return Math.floor((408 - (n - 1) * 8) / n); }

/** The selection as the file has it, read only (advanced mode): what an agency checks, and what a support request quotes. */
function Written(): i32 {
  return <View className="flex-col gap-2">
    <Heading label={t(L.IN_FILE)} />
    <TextArea readOnly wrap={false} className="font-mono text-[11px] text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-md p-2" style={{ height: 190 }} value={selectionJson()} />
  </View>;
}
/** The links of the selected sequence: a click selects one. */
function LinkList(p: { onPick: (l: Link) => void }): i32 {
  const links = (): Link[] => { const s = selected(); project(); return s === null ? [] : s.links; };
  return <View className="flex-col gap-1">
    <For each={links()}>{(l: Link, i: i32) => <Button className="flex-row items-center justify-start gap-2 h-8 px-2 rounded-md cursor-pointer bg-zinc-950 border border-zinc-800 hover:border-zinc-600"
      onClick={() => p.onPick(l)}>
      <Ico name={(project(), l.on.length > 0) ? 'mouse-pointer-click' : 'arrow-right'} size={13} color={MUTED} />
      <Text className="truncate text-xs text-zinc-100" style={{ width: 138 }}>{project().say(l.label, lang())}</Text>
      <Text className="truncate text-xs text-right text-zinc-500" style={{ width: 100 }}>{say(project().sequence(l.to))}</Text>
    </Button>}</For>
  </View>;
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
  return <View className="flex-col gap-5 p-4">
    <View className="flex-col gap-1">
      <Heading label={t(L.SEQUENCE)} />
      <Text className="text-lg font-bold text-zinc-100 truncate">{say(selected())}</Text>
    </View>
    <View className="flex-col gap-2">
      <Heading label={t(L.TITLE)} />
      <For each={project().languages}>{(language: string, i: i32) => {
        const ref = createNodeRef();
        if (i === 0) titleField = ref;
        return <LangField language={language} value={() => title(language)} placeholder={hint(i === 0)} field={ref} onInput={(v: string) => renameSelected(language, v)} onDone={done} />;
      }}</For>
    </View>
    <View className="flex-row"><Action icon="layers" label={t(L.OPEN_SEQUENCE)} look="primary" onClick={() => { const s = selected(); if (s !== null) openSequence(s); }} /></View>
    <View className="flex-col gap-2">
      <Heading label={t(L.VISIT)} />
      <Show when={isStart()}>
        <View className="flex-row items-center gap-2 h-8 px-3 rounded-md bg-zinc-800">
          <Ico name="flag" size={14} color={ACCENT} />
          <Text className="text-xs text-zinc-100">{t(L.STARTS_HERE)}</Text>
        </View>
      </Show>
      <Show when={!isStart()}>
        <View className="flex-row"><Action icon="flag" label={t(L.START_HERE)} look="plain" onClick={startHere} /></View>
      </Show>
      <Show when={!isStart() && incoming() === 0}>
        <View className="flex-row items-center gap-2">
          <Ico name="triangle-alert" size={14} color={WARN} />
          <Text className="text-xs text-orange-300" style={{ width: 262 }}>{t(L.NO_LINK_HERE)}</Text>
        </View>
      </Show>
      <Show when={incoming() > 0}><Text className="text-xs text-zinc-400">{count(incoming(), L.ONE_LEADS_HERE, L.N_LEAD_HERE)}</Text></Show>
    </View>
    <View className="flex-col gap-2">
      <Heading label={t(L.LINKS_OUT)} />
      <Show when={none()}><Text className="text-xs text-zinc-500">{t(L.NO_LINK_YET)}</Text></Show>
      <LinkList onPick={(l: Link) => select(selected(), l)} />
    </View>
    <View className="flex-row gap-2">
      <Action icon="copy" label={t(L.DUPLICATE)} look="plain" onClick={duplicateSelected} />
      <Action icon="trash" label={t(L.DELETE)} look="danger" onClick={deleteSelection} />
    </View>
    <Show when={advanced()}>
      <View className="flex-col gap-2">
        <Heading label={t(L.PLACE)} />
        <View className="flex-row gap-3">
          <NumberField label="X" value={() => { const s = selected(); project(); return s === null ? 0 : s.storyX; }} onCommit={(v: number) => { const s = selected(); if (s !== null) placeSelected(v, s.storyY); }} onDone={done} />
          <NumberField label="Y" value={() => { const s = selected(); project(); return s === null ? 0 : s.storyY; }} onCommit={(v: number) => { const s = selected(); if (s !== null) placeSelected(s.storyX, v); }} onDone={done} />
        </View>
      </View>
    </Show>
    <Show when={advanced()}><Written /></Show>
  </View>;
}

/** A link: on the storyboard and, with its times and its place, on the table of its sequence. */
function LinkPanel(): i32 {
  const link = (): Link | null => { project(); return selectedLink(); };
  const label = (language: string): string => { const l = link(); return l === null ? '' : l.label.get(language) ?? ''; };
  const target = (): Sequence | null => { const l = link(); return l === null ? null : project().sequence(l.to); };
  const spot = (): boolean => { const l = link(); return l !== null && l.on.length > 0; };
  return <View className="flex-col gap-5 p-4">
    <View className="flex-col gap-1">
      <Heading label={t(L.LINK)} />
      <View className="flex-row items-center gap-2 h-7">
        <Text className="truncate text-sm font-bold text-zinc-100" style={{ maxWidth: 125 }}>{say(selected())}</Text>
        <Ico name="arrow-right" size={14} color={ACCENT} />
        <Text className="truncate text-sm font-bold text-zinc-100" style={{ maxWidth: 125 }}>{say(target())}</Text>
      </View>
      <Text className="text-xs text-zinc-500">{t(spot() ? L.HOTSPOT_WHAT : L.LINK_WHAT)}</Text>
    </View>
    <View className="flex-col gap-2">
      <Heading label={t(L.BUTTON_LABEL)} />
      <For each={project().languages}>{(language: string, i: i32) =>
        <LangField language={language} value={() => label(language)} placeholder={hint(i === 0)} field={createNodeRef()} onInput={(v: string) => setLinkLabel(language, v)} onDone={done} />}</For>
    </View>
    <View className="flex-col gap-2">
      <Heading label={t(L.LEADS_TO)} />
      <View className="flex-row items-center gap-2">
        <Text className="grow truncate text-sm text-zinc-100" style={{ width: 150 }}>{say(target())}</Text>
        <View className="w-[110] flex-row"><Action icon="pencil" label={t(L.CHANGE)} look="plain" onClick={retargetSelected} /></View>
      </View>
    </View>
    <View className="flex-col gap-2">
      <Heading label={t(L.TARGET_OPENS)} />
      <Segmented options={['replace', 'overlay']} labels={[t(L.IN_PLACE), t(L.OVER_IT)]} value={() => { const l = link(); return l !== null && l.overlay ? 'overlay' : 'replace'; }}
        onPick={(v: string) => setLinkOverlay(v === 'overlay')} />
      <Text className="text-xs text-zinc-500">{t(L.OVER_WHAT)}</Text>
    </View>
    <View className="flex-col gap-2">
      <Heading label={t(L.TRANSITION)} />
      <Segmented options={['fade', 'slide', 'none']} labels={[t(L.FADE), t(L.SLIDE), t(L.NONE)]} value={() => { const l = link(); return l === null ? 'fade' : l.transition; }} onPick={setLinkTransition} />
    </View>
    <Show when={opened() !== null}>
      <View className="flex-col gap-2">
        <Heading label={t(L.TIMES)} />
        <View className="flex-row gap-3">
          <NumberField label={t(L.FROM)} value={() => { const l = link(); return l === null ? 0 : l.at; }} onCommit={(v: number) => { const l = link(); if (l !== null) timeLink(l, v, l.until); }} onDone={done} />
          <NumberField label={t(L.UNTIL)} value={() => { const l = link(); return l === null ? 0 : l.until; }} onCommit={(v: number) => { const l = link(); if (l !== null) timeLink(l, l.at, v); }} onDone={done} />
        </View>
        <Text className="text-xs text-zinc-500">{t(L.UNTIL_END)}</Text>
      </View>
    </Show>
    <Show when={opened() !== null && advanced()}>
      <View className="flex-col gap-2">
        <Heading label={t(L.POSITION)} />
        <View className="flex-row gap-3">
          <NumberField label="X" value={() => { const l = link(); return l === null ? 0 : l.x; }} onCommit={(v: number) => { const l = link(); if (l !== null) moveLink(l, v, l.y); }} onDone={done} />
          <NumberField label="Y" value={() => { const l = link(); return l === null ? 0 : l.y; }} onCommit={(v: number) => { const l = link(); if (l !== null) moveLink(l, l.x, v); }} onDone={done} />
        </View>
      </View>
    </Show>
    <View className="flex-row"><Action icon="trash" label={t(L.DELETE_LINK)} look="danger" onClick={deleteSelection} /></View>
    <Show when={advanced()}><Written /></Show>
  </View>;
}

function Tip(p: { icon: string; text: string }): i32 {
  return <View className="flex-row gap-3">
    <Ico name={p.icon} size={15} color={MUTED} />
    <Text className="text-xs text-zinc-400" style={{ width: 258 }}>{p.text}</Text>
  </View>;
}
/** Every command has a key; the advanced mode lists them. */
const KEYS: string[] = ['N', 'Enter', 'O', 'S', 'Ctrl D', 'Delete', 'Ctrl Z', 'Shift Ctrl Z', 'Ctrl S', 'Shift Ctrl S', 'Ctrl O', 'Ctrl N', 'Ctrl 0', 'Ctrl + / -', 'L', 'Ctrl E', 'Escape', 'P', 'W', 'Ctrl ,', 'Ctrl A', 'Ctrl X / C / V', 'Arrows'];
const KEY_DOES: i32[] = [L.KEY_NEW_SEQUENCE, L.KEY_NAME, L.KEY_OPEN_SEQUENCE, L.KEY_START, L.DUPLICATE, L.KEY_DELETE, L.UNDO, L.REDO, L.SAVE, L.SAVE_AS, L.KEY_OPEN, L.KEY_NEW, L.KEY_FIT, L.KEY_ZOOM,
  L.KEY_LANGUAGE, L.KEY_ADVANCED, L.KEY_ESCAPE, L.KEY_PLAY, L.KEY_WINDOW, L.KEY_SETTINGS, L.SELECT_ALL, L.KEY_CLIPBOARD, L.KEY_NUDGE];
function ProjectPanel(): i32 {
  const links = (): i32 => { let n: i32 = 0; for (const s of project().sequences) n += s.links.length; return n; };
  return <View className="flex-col gap-5 p-4">
    <View className="flex-col gap-1">
      <Heading label={t(L.PROJECT)} />
      <Text className="text-lg font-bold text-zinc-100">{project().say(project().title, lang())}</Text>
      <Text className="text-xs text-zinc-400">{`${count(project().sequences.length, L.ONE_SEQUENCE, L.N_SEQUENCES)}, ${count(links(), L.ONE_LINK, L.N_LINKS)}, ${count(project().media.length, L.ONE_MEDIUM, L.N_MEDIA)}`}</Text>
    </View>
    <View className="flex-row"><Action icon="settings" label={t(L.SETTINGS)} look="plain" onClick={() => openSettings('project')} /></View>
    <View className="flex-col gap-3">
      <Heading label={t(L.HOW)} />
      <Tip icon="mouse-pointer-click" text={t(L.TIP_CREATE)} />
      <Tip icon="link" text={t(L.TIP_LINK)} />
      <Tip icon="layers" text={t(L.TIP_DASHED)} />
      <Tip icon="flag" text={t(L.TIP_START)} />
      <Tip icon="triangle-alert" text={t(L.TIP_LOST)} />
      <Tip icon="pencil" text={t(L.TIP_EDIT)} />
    </View>
    <Show when={advanced()}>
      <View className="flex-col gap-2">
        <Heading label={t(L.KEYS)} />
        {KEYS.map((key: string, i: i32) => <View className="flex-row items-center gap-3">
          <Text className="w-[92] text-[11px] font-bold text-zinc-300">{key}</Text>
          <Text className="text-xs text-zinc-400">{t(KEY_DOES[i])}</Text>
        </View>)}
      </View>
    </Show>
  </View>;
}

// ---------------------------------------------------------------- on the table of a sequence

function fileOf(m: Media | null): string { return m === null ? '' : `${t(L.FILE)}: ${m.file}`; }
function textOf(m: Media | null, field: string, language: string): string {
  if (m === null) return '';
  const text = field === 'title' ? m.title : field === 'description' ? m.description : field === 'audioDescription' ? m.audioDescription : field === 'transcript' ? m.transcript : m.text;
  return text.get(language) ?? '';
}
/** A text of the shown medium in every language, side by side. */
function MediaText(p: { label: string; field: string; rows: i32 }): i32 {
  return <View className="flex-col gap-1">
    <Heading label={p.label} />
    <LangColumns rows={p.rows} width={column} first={null} value={(language: string) => textOf(shownMedia(), p.field, language)} placeholder={(first: boolean) => p.field === 'title' || p.field === 'text' ? hint(first) : first ? '' : t(L.NOT_TRANSLATED)}
      onInput={(language: string, v: string) => setMediaText(p.field, language, v)} onDone={done} />
  </View>;
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
  const pointable = (): boolean => { const x = m(); return x !== null && (x.kind === 'model' || x.kind === 'panorama'); };
  const pointCount = (): i32 => { const x = m(); project(); return x === null ? 0 : x.points.length; };
  const kind = (): string => { const x = m(); return x === null ? '' : x.kind; };
  const timed = (): boolean => kind() === 'audio' || kind() === 'video';
  const named = (field: string): string => {
    const x = m();
    project();
    return x === null ? '' : field === 'file' ? x.file : field === 'subtitles' ? x.subtitles : field === 'poster' ? x.poster : x.texture;
  };
  const lasts = (): string => { const x = m(), d = x === null ? 0 : lengthOf(x); return d > 0 ? f(L.LASTS, `${d}`) : t(L.LASTS_UNKNOWN); };
  return <View className="flex-col gap-5 p-4">
    <View className="flex-col gap-1">
      <Heading label={t(L.KIND_NAMES[Math.max(0, kindIndex(m()))])} />
      <Text className="text-lg font-bold text-zinc-100 truncate">{textOf(m(), 'title', lang()).length > 0 ? textOf(m(), 'title', lang()) : textOf(m(), 'title', project().languages[0])}</Text>
      <Show when={!isText()}><Text className="truncate text-xs text-zinc-500">{fileOf(m())}</Text></Show>
    </View>
    <Show when={pointable()}>
      <View className="flex-col gap-2">
        <View className="flex-row"><Action icon="map-pin" label={t(L.POINTS_OPEN)} look="primary" onClick={() => { const x = m(); if (x !== null) openPoints(x); }} /></View>
        <Text className="text-xs text-zinc-500" style={{ width: 400 }}>{pointCount() === 0 ? t(L.NO_POINT_YET) : count(pointCount(), L.ONE_POINT, L.N_POINTS)}</Text>
      </View>
    </Show>
    <Show when={it() !== null}>
      <View className="flex-col gap-2">
        <Heading label={t(L.ON_TABLE)} />
        <View className="flex-row gap-2">
          <Action icon="chevron-up" label={t(L.FORWARD)} look="plain" onClick={() => { const i = it(); if (i !== null) raiseItem(i, 1); }} />
          <Action icon="chevron-down" label={t(L.BACKWARD)} look="plain" onClick={() => { const i = it(); if (i !== null) raiseItem(i, -1); }} />
          <Action icon="trash" label={t(L.OFF_TABLE)} look="danger" onClick={deleteSelection} />
        </View>
        <Text className="text-[11px] text-zinc-400">{t(L.TIMES)}</Text>
        <View className="flex-row gap-3">
          <NumberField label={t(L.FROM)} value={() => num((i: Item) => i.at)} onCommit={(v: number) => { const i = it(); if (i !== null) timeItem(i, v, i.until); }} onDone={done} />
          <NumberField label={t(L.UNTIL)} value={() => num((i: Item) => i.until)} onCommit={(v: number) => { const i = it(); if (i !== null) timeItem(i, i.at, v); }} onDone={done} />
        </View>
        <Text className="text-xs text-zinc-500">{t(L.UNTIL_END)}</Text>
        <View className="flex-row"><Action icon="mouse-pointer-click" label={t(L.ADD_HOTSPOT)} look="plain" onClick={() => addLinkFrom(it())} /></View>
      </View>
    </Show>
    <Show when={it() !== null && advanced()}>
      <View className="flex-col gap-2">
        <Heading label={t(L.POSITION)} />
        <View className="flex-row gap-3">
          <NumberField label="X" value={() => num((i: Item) => i.x)} onCommit={(v: number) => { const i = it(); if (i !== null) moveItem(i, v, i.y); }} onDone={done} />
          <NumberField label="Y" value={() => num((i: Item) => i.y)} onCommit={(v: number) => { const i = it(); if (i !== null) moveItem(i, i.x, v); }} onDone={done} />
          <NumberField label={t(L.ROTATION)} value={() => num((i: Item) => i.rotation)} onCommit={(v: number) => { const i = it(); if (i !== null) rotateItem(i, v); }} onDone={done} />
        </View>
        <View className="flex-row gap-3">
          <NumberField label={t(L.WIDTH)} value={() => num((i: Item) => i.width)} onCommit={(v: number) => { const i = it(); if (i !== null) resizeItem(i, v, i.height); }} onDone={done} />
          <NumberField label={t(L.HEIGHT)} value={() => num((i: Item) => i.height)} onCommit={(v: number) => { const i = it(); if (i !== null) resizeItem(i, i.width, v); }} onDone={done} />
        </View>
        <Text className="text-xs text-zinc-500">{f(L.HEIGHT_AUTO, `${project().table.width}`, `${project().table.height}`)}</Text>
      </View>
    </Show>
    <Show when={it() === null}>
      <View className="flex-row"><Action icon="plus" label={t(L.PUT_ON_TABLE)} look="primary" onClick={() => { const x = m(); if (x !== null) placeMedia(x, project().table.width / 2, project().table.height / 2); }} /></View>
    </Show>
    <MediaText label={t(L.CAPTION)} field="title" rows={1} />
    <Show when={isText()}><MediaText label={t(L.BODY)} field="text" rows={4} /></Show>
    <MediaText label={t(L.DESCRIPTION)} field="description" rows={4} />
    <MediaText label={t(L.AUDIO_DESCRIPTION)} field="audioDescription" rows={3} />
    <Show when={timed()}><MediaText label={t(L.TRANSCRIPT)} field="transcript" rows={3} /></Show>
    <View className="flex-col gap-2">
      <Heading label={t(L.CREDIT)} />
      <PlainField label={t(L.CREATOR)} value={() => credit('creator')} placeholder="" onInput={(v: string) => setMediaCredit('creator', v)} onDone={done} />
      <Show when={!isText()}>
        <View className="flex-col gap-2">
          <PlainField label={t(L.SOURCE)} value={() => credit('source')} placeholder={t(L.REQUIRED)} onInput={(v: string) => setMediaCredit('source', v)} onDone={done} />
          <PlainField label={t(L.LICENCE)} value={() => credit('licence')} placeholder={t(L.REQUIRED)} onInput={(v: string) => setMediaCredit('licence', v)} onDone={done} />
          <PlainField label={t(L.INSTITUTION)} value={() => credit('institution')} placeholder="" onInput={(v: string) => setMediaCredit('institution', v)} onDone={done} />
          <PlainField label={t(L.CREDIT_LINE)} value={() => credit('line')} placeholder="" onInput={(v: string) => setMediaCredit('line', v)} onDone={done} />
        </View>
      </Show>
    </View>
    <Show when={timed() || (advanced() && kind() === 'model')}>
      <View className="flex-col gap-2">
        <Heading label={t(L.FILES)} />
        <Show when={timed()}>
          <View className="flex-col gap-2">
            <Text className="text-xs text-zinc-300">{lasts()}</Text>
            <Show when={kind() === 'audio'}><View className="flex-row"><Action icon="volume-2" label={t(L.LISTEN)} look="plain" onClick={() => listen(m())} /></View></Show>
            <Show when={kind() === 'video'}><Text className="text-xs text-zinc-500" style={{ width: 400 }}>{t(L.FILM_VIEW)}</Text></Show>
            <Text className="text-xs text-zinc-500" style={{ width: 400 }}>{t(L.FILES_WHAT)}</Text>
          </View>
        </Show>
        <PlainField label={t(L.FILE)} value={() => named('file')} placeholder={t(L.REQUIRED)} onInput={(v: string) => setMediaFile('file', v)} onDone={done} />
        <Show when={timed()}><PlainField label={t(L.SUBTITLES)} value={() => named('subtitles')} placeholder="" onInput={(v: string) => setMediaFile('subtitles', v)} onDone={done} /></Show>
        <Show when={kind() === 'model'}><PlainField label={t(L.MODEL_TEXTURE)} value={() => named('texture')} placeholder="" onInput={(v: string) => setMediaFile('texture', v)} onDone={done} /></Show>
        <Show when={kind() === 'video'}>
          <View className="flex-col gap-2">
            <PlainField label={t(L.POSTER)} value={() => named('poster')} placeholder="" onInput={(v: string) => setMediaFile('poster', v)} onDone={done} />
            <Text className="text-[11px] text-zinc-400">{t(L.LOOP)}</Text>
            <Segmented options={['once', 'loop']} labels={[t(L.LOOP_ONCE), t(L.LOOP_AGAIN)]} value={() => { const x = m(); project(); return x !== null && x.loop ? 'loop' : 'once'; }} onPick={(v: string) => setMediaLoop(v === 'loop')} />
          </View>
        </Show>
      </View>
    </Show>
    <View className="flex-row"><Action icon="trash" label={t(L.REMOVE_FROM_PROJECT)} look="danger" onClick={() => { const x = m(); if (x !== null) removeMediaCommand(x); }} /></View>
  </View>;
}
/** The open sequence itself: its title and introduction in every language, its buttons. */
function TablePanel(): i32 {
  const s = (): Sequence | null => { project(); return selected(); };
  const none = (): boolean => { const x = s(); return x === null || x.links.length === 0; };
  const sounds = (): Media[] => project().media.filter((x: Media) => x.kind === 'audio');
  const said = (x: Media): boolean => { const q = s(); return q !== null && q.narration === x.id; };
  const narration = (): Media | null => { const q = s(); return q === null || q.narration.length === 0 ? null : project().medium(q.narration); };
  const next = (): Sequence | null => { const q = s(); return q === null || q.next.length === 0 ? null : project().sequence(q.next); };
  return <View className="flex-col gap-5 p-4">
    <View className="flex-col gap-1">
      <Heading label={t(L.SEQUENCE)} />
      <Text className="text-lg font-bold text-zinc-100 truncate">{say(selected())}</Text>
      <Text className="text-xs text-zinc-500">{t(L.SEQUENCE_HINT)}</Text>
    </View>
    <View className="flex-col gap-1">
      <Heading label={t(L.TITLE)} />
      <LangColumns rows={1} width={column} first={null} value={(language: string) => { const x = s(); return x === null ? '' : x.title.get(language) ?? ''; }} placeholder={hint}
        onInput={(language: string, v: string) => renameSelected(language, v)} onDone={done} />
    </View>
    <View className="flex-col gap-1">
      <Heading label={t(L.INTRODUCTION)} />
      <LangColumns rows={3} width={column} first={null} value={(language: string) => { const x = s(); return x === null ? '' : x.text.get(language) ?? ''; }} placeholder={(first: boolean) => first ? '' : t(L.NOT_TRANSLATED)}
        onInput={(language: string, v: string) => setSequenceText(language, v)} onDone={done} />
    </View>
    <View className="flex-col gap-2">
      <Heading label={t(L.BUTTONS)} />
      <Show when={none()}><Text className="text-xs text-zinc-500">{t(L.NO_BUTTON_YET)}</Text></Show>
      <LinkList onPick={(l: Link) => pick(null, l, null)} />
      <View className="flex-row"><Action icon="plus" label={t(L.ADD_BUTTON)} look="plain" onClick={() => addLinkFrom(null)} /></View>
    </View>
    <View className="flex-col gap-2">
      <Text className="text-[11px] text-zinc-400">{t(L.DURATION)}</Text>
      <View className="flex-row"><NumberField label="" value={() => { const x = s(); return x === null ? 0 : x.duration; }} onCommit={setSequenceDuration} onDone={done} /></View>
    </View>
    <View className="flex-col gap-2">
      <Heading label={t(L.NARRATION)} />
      <Text className="text-xs text-zinc-500" style={{ width: 400 }}>{t(sounds().length === 0 ? L.NO_SOUND_YET : L.NARRATION_WHAT)}</Text>
      <View className="flex-col gap-1">
        <For each={sounds()}>{(x: Media, i: i32) => <Button className={`flex-row items-center justify-start gap-2 h-8 px-2 rounded-md cursor-pointer border ${said(x) ? 'bg-zinc-800 border-amber-400' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-600'}`}
          onClick={() => narrate(x)}>
          <Ico name="volume-2" size={13} color={said(x) ? ACCENT : MUTED} />
          <Text className="truncate text-xs text-zinc-100" style={{ width: 280 }}>{(project(), project().say(x.title, lang()))}</Text>
          <Text className="truncate text-xs text-right text-zinc-500" style={{ width: 80 }}>{f(L.SECONDS, `${lengthOf(x)}`)}</Text>
        </Button>}</For>
      </View>
      <Show when={narration() !== null}><View className="flex-row"><Action icon="volume-2" label={t(L.LISTEN)} look="plain" onClick={() => listen(narration())} /></View></Show>
    </View>
    <View className="flex-col gap-2">
      <Heading label={t(L.THEN)} />
      <Text className="text-xs text-zinc-300" style={{ width: 400 }}>{next() === null ? t(L.THEN_NOTHING) : say(next())}</Text>
      <View className="flex-row gap-2">
        <Action icon="arrow-right" label={t(L.CHOOSE_SEQUENCE)} look="plain" onClick={chooseNext} />
        <Show when={next() !== null}><Action icon="unlink" label={t(L.NO_LINK)} look="plain" onClick={clearNext} /></Show>
      </View>
      <Text className="text-xs text-zinc-500" style={{ width: 400 }}>{t(L.THEN_WHAT)}</Text>
    </View>
    <Show when={advanced()}><Written /></Show>
  </View>;
}

// ---------------------------------------------------------------- points of interest (points.tsx has the middle of the window)

/** A view in words: how far the object is turned and tilted, and its distance or the field of view of a panorama. */
function viewText(v: SavedView, panorama: boolean): string {
  return `${f(L.VIEW_MODEL, `${v.yaw}`, `${v.pitch}`)}, ${panorama ? f(L.VIEW_FOV, `${v.fov}`) : f(L.VIEW_DISTANCE, `${v.distance}`)}`;
}
function reachOf(v: SavedView, panorama: boolean): number { return panorama ? v.fov : v.distance; }
/** "Use this view" (what the author sees now becomes the view of the selection) and "Show it". */
function ViewButtons(p: { of: () => SavedView | null; panorama: () => boolean }): i32 {
  return <View className="flex-row gap-2">
    <Action icon="crosshair" label={t(L.USE_VIEW)} look="plain" onClick={() => { const v = currentView(); useView(v[0], v[1], v[2]); }} />
    <Action icon="eye" label={t(L.SHOW_VIEW)} look="plain" onClick={() => { const v = p.of(); if (v !== null) showView(v.yaw, v.pitch, reachOf(v, p.panorama())); }} />
  </View>;
}
/** The model or the panorama being pointed: its points, how it is first seen, its lighting. */
function PointsPanel(): i32 {
  const m = (): Media | null => { project(); return pointing(); };
  const points = (): Point[] => { const x = m(); return x === null ? [] : x.points; };
  const panorama = (): boolean => { const x = m(); return x !== null && x.kind === 'panorama'; };
  const leads = (q: Point): string => { project(); return say(q.to.length > 0 ? project().sequence(q.to) : null); };
  return <View className="flex-col gap-5 p-4">
    <View className="flex-col gap-1">
      <Heading label={t(L.KIND_NAMES[Math.max(0, kindIndex(m()))])} />
      <Text className="text-lg font-bold text-zinc-100 truncate">{textOf(m(), 'title', lang()).length > 0 ? textOf(m(), 'title', lang()) : textOf(m(), 'title', project().languages[0])}</Text>
      <Text className="truncate text-xs text-zinc-500">{fileOf(m())}</Text>
    </View>
    <View className="flex-col gap-2">
      <Heading label={t(L.POINTS)} />
      <Show when={points().length === 0}><Text className="text-xs text-zinc-500" style={{ width: 400 }}>{t(L.NO_POINT_YET)}</Text></Show>
      <View className="flex-col gap-1">
        <For each={points()}>{(q: Point, i: i32) => <Button className="flex-row items-center justify-start gap-2 h-8 px-2 rounded-md cursor-pointer bg-zinc-950 border border-zinc-800 hover:border-zinc-600"
          onClick={() => pickPoint(q)}>
          <View className="w-[18] h-[18] items-center justify-center rounded-full bg-zinc-800 border border-zinc-500"><Text className="text-[10px] font-bold text-zinc-100">{`${points().indexOf(q) + 1}`}</Text></View>
          <Text className="truncate text-xs text-zinc-100" style={{ width: 210 }}>{(project(), project().say(q.title, lang()))}</Text>
          <Show when={(project(), q.to.length > 0)}><Ico name="arrow-right" size={13} color={MUTED} /></Show>
          <Text className="truncate text-xs text-zinc-500" style={{ width: 120 }}>{leads(q)}</Text>
        </Button>}</For>
      </View>
    </View>
    <View className="flex-col gap-2">
      <Heading label={t(L.OPENING_VIEW)} />
      <Text className="text-xs text-zinc-500" style={{ width: 400 }}>{t(L.OPENING_WHAT)}</Text>
      <Text className="text-xs text-zinc-300">{(() => { const x = m(); return x === null ? '' : viewText(x.view, panorama()); })()}</Text>
      <ViewButtons of={() => { const x = m(); return x === null ? null : x.view; }} panorama={panorama} />
    </View>
    <Show when={!panorama()}>
      <View className="flex-col gap-2">
        <Heading label={t(L.LIGHT)} />
        <Segmented options={LIGHTS} labels={L.LIGHT_NAMES.map((k: i32) => t(k))} value={() => { const x = m(); return x === null ? 'studio' : x.light; }} onPick={setLight} />
      </View>
    </Show>
    <Show when={advanced()}>
      <View className="flex-col gap-2">
        <Heading label={t(L.IN_FILE)} />
        <TextArea readOnly wrap={false} className="font-mono text-[11px] text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-md p-2" style={{ height: 260 }} value={pointedJson()} />
      </View>
    </Show>
  </View>;
}

let pointName: NodeRef | null = null, named: i32 = 0;
/** One point of interest: its name and what visitors read, in every language, the view it opens with and the sequence its card leads to. */
function PointPanel(): i32 {
  const q = (): Point | null => { project(); return selectedPoint(); };
  const panorama = (): boolean => { const x = pointing(); return x !== null && x.kind === 'panorama'; };
  const words = (field: string, language: string): string => { const x = q(); return x === null ? '' : (field === 'title' ? x.title : x.text).get(language) ?? ''; };
  const target = (): Sequence | null => { const x = q(); return x === null || x.to.length === 0 ? null : project().sequence(x.to); };
  const at = (k: i32): number => { const x = q(); return x === null ? 0 : x.at[k]; };
  const place = (k: i32, v: number): void => { const x = q(); if (x === null) return; const to = x.at.slice(); to[k] = v; movePoint(x, to); };
  const ref = createNodeRef();
  pointName = ref;
  // a new point is named at once: the caret goes to its name, all of it selected
  createEffect(() => {
    const asked = namePoint();
    if (asked === named) return;
    named = asked;
    queueMicrotask(() => {
      const field = pointName;
      if (field === null || field.node < 0) return;
      ui.focusNode(field.node);
      ui.select(field.node, 0, ui.getValue(field.node).length);
    });
  });
  return <View className="flex-col gap-5 p-4">
    <View className="flex-col gap-1">
      <Heading label={t(L.POINT)} />
      <Text className="text-lg font-bold text-zinc-100 truncate">{(() => { const x = q(); return x === null ? '' : project().say(x.title, lang()); })()}</Text>
    </View>
    <View className="flex-row"><Action icon="list" label={t(L.ALL_POINTS)} look="plain" onClick={() => pickPoint(null)} /></View>
    <View className="flex-col gap-1">
      <Heading label={t(L.POINT_TITLE)} />
      <LangColumns rows={1} width={column} first={ref} value={(language: string) => words('title', language)} placeholder={hint} onInput={(language: string, v: string) => setPointText('title', language, v)} onDone={done} />
    </View>
    <View className="flex-col gap-1">
      <Heading label={t(L.POINT_TEXT)} />
      <LangColumns rows={4} width={column} first={null} value={(language: string) => words('text', language)} placeholder={(first: boolean) => first ? '' : t(L.NOT_TRANSLATED)}
        onInput={(language: string, v: string) => setPointText('text', language, v)} onDone={done} />
    </View>
    <View className="flex-col gap-2">
      <Heading label={t(L.POINT_VIEW)} />
      <Text className="text-xs text-zinc-500" style={{ width: 400 }}>{t(L.POINT_VIEW_WHAT)}</Text>
      <Text className="text-xs text-zinc-300">{(() => { const x = q(); return x === null ? '' : viewText(x.view, panorama()); })()}</Text>
      <ViewButtons of={() => { const x = q(); return x === null ? null : x.view; }} panorama={panorama} />
    </View>
    <View className="flex-col gap-2">
      <Heading label={t(L.POINT_LEADS)} />
      <Show when={target() === null}><Text className="text-xs text-zinc-500">{t(L.POINT_NOWHERE)}</Text></Show>
      <Show when={target() !== null}>
        <View className="flex-row items-center gap-2 h-8 px-3 rounded-md bg-zinc-800">
          <Ico name="arrow-right" size={14} color={ACCENT} />
          <Text className="truncate text-sm text-zinc-100" style={{ maxWidth: 340 }}>{say(target())}</Text>
        </View>
      </Show>
      <View className="flex-row gap-2">
        <Action icon="arrow-right" label={t(L.CHOOSE_SEQUENCE)} look="plain" onClick={retargetPoint} />
        <Show when={target() !== null}><Action icon="unlink" label={t(L.NO_LINK)} look="plain" onClick={clearPointTarget} /></Show>
      </View>
    </View>
    <Show when={advanced()}>
      <View className="flex-col gap-2">
        <Heading label={t(panorama() ? L.DIRECTION : L.PLACE_ON_OBJECT)} />
        <View className="flex-row gap-3">
          <NumberField label="X" value={() => at(0)} onCommit={(v: number) => place(0, v)} onDone={done} />
          <NumberField label="Y" value={() => at(1)} onCommit={(v: number) => place(1, v)} onDone={done} />
          <NumberField label="Z" value={() => at(2)} onCommit={(v: number) => place(2, v)} onDone={done} />
        </View>
      </View>
    </Show>
    <View className="flex-row"><Action icon="trash" label={t(L.DELETE_POINT)} look="danger" onClick={deletePoint} /></View>
  </View>;
}

export function Inspector(): i32 {
  return <ScrollView className={`shrink-0 flex-col bg-zinc-900 border-l border-zinc-800 ${opened() !== null ? 'w-[440]' : 'w-[320]'}`}>
    <Show when={pointing() !== null && selectedPoint() === null}><PointsPanel /></Show>
    <Show when={pointing() !== null && selectedPoint() !== null}><PointPanel /></Show>
    <Show when={pointing() === null && opened() === null && selected() !== null && selectedLink() === null}><SequencePanel /></Show>
    <Show when={pointing() === null && selected() !== null && selectedLink() !== null}><LinkPanel /></Show>
    <Show when={pointing() === null && opened() === null && selected() === null}><ProjectPanel /></Show>
    <Show when={pointing() === null && opened() !== null && selectedLink() === null && shownMedia() !== null}><MediaPanel /></Show>
    <Show when={pointing() === null && opened() !== null && selectedLink() === null && shownMedia() === null}><TablePanel /></Show>
  </ScrollView>;
}
