// The settings of the project: what its file holds beside the sequences and the media. Five sections at the left (the project and its
// languages, the theme, the table and the kiosk, accessibility, the guided visits), the form of one in the middle and, at the right, a live
// sample: a sequence, played by the table's own player with the settings as they are (preview.tsx).
import { createSignal, createNodeRef, createEffect, NodeRef, For, Show, batch } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Sequence, Presentation, Colours } from '../src/project';
import { COLOURS } from './doc';
import { project, lang, settings, openSettings, closeSettings, done, advanced, setProjectTitle, addLanguage, removeLanguageCommand, setColour, setThemeFile, filesEnding, setNumber, setFlag, setUpdateUrl,
  setTextSizes, tour, setTour, addPresentation, renamePresentation, deletePresentation, addStepCommand, removeStep, moveStep, setAttract, nameTour } from './state';
import { Ico, Tool, Action, Segmented, LangColumns, PlainField, NumberField, ColourField, Heading, ACCENT, MUTED } from './widgets';
import { SamplePane } from './preview';
import * as L from './strings';
import { t, f, LANGUAGE_NAMES } from './strings';

const SECTIONS: string[] = ['project', 'theme', 'table', 'access', 'tours'];
const SECTION_ICON: string[] = ['landmark', 'palette', 'monitor', 'accessibility', 'route'];
/** The width of the form, and of one language column in it. */
const FORM = 500;
function column(): number { const n = project().languages.length; return Math.floor((FORM - 32 - (n - 1) * 8) / n); }
function hint(first: boolean): string { return t(first ? L.REQUIRED : L.NOT_TRANSLATED); }
function say(s: Sequence | null): string { return s === null ? '' : project().say(s.title, lang()); }

/** A group of settings: its heading, a line that says what they are for, the settings. */
function Group(p: { title: string; what: string; children: () => i32 }): i32 {
  return <view class="flex-col gap-2">
    <Heading label={p.title} />
    {p.what.length > 0 ? <text class="text-xs text-zinc-500" style={{ width: FORM - 32 }}>{p.what}</text> : <view />}
    {p.children()}
  </view>;
}
/** One setting: what it is with its control at the right, and under them what it does. */
function Setting(p: { label: string; what: string; children: () => i32 }): i32 {
  return <view class="flex-col gap-1">
    <view class="flex-row items-center gap-3">
      <text class="grow text-xs font-bold text-zinc-100">{p.label}</text>
      {p.children()}
    </view>
    {p.what.length > 0 ? <text class="text-[11px] text-zinc-500" style={{ width: FORM - 32 }}>{p.what}</text> : <view />}
  </view>;
}
/** A switch: yes or no. */
function YesNo(p: { value: () => boolean; onPick: (on: boolean) => void }): i32 {
  return <view class="w-[110] shrink-0"><Segmented options={['yes', 'no']} labels={[t(L.YES), t(L.NO)]} value={() => p.value() ? 'yes' : 'no'} onPick={(v: string) => p.onPick(v === 'yes')} /></view>;
}
function colourIn(c: Colours, name: string): i32 {
  return name === 'background' ? c.background : name === 'paper' ? c.paper : name === 'ink' ? c.ink : name === 'text' ? c.text : name === 'muted' ? c.muted : c.accent;
}
/** The six colours of the theme, or of the high-contrast mode. */
function Palette(p: { contrast: boolean }): i32 {
  return <view class="flex-col gap-1">
    {COLOURS.map((name: string, i: i32) => <ColourField label={t(L.COLOUR_NAMES[i])} hint={t(L.COLOUR_HINTS[i])}
      value={() => colourIn(p.contrast ? project().accessibility.highContrast : project().theme, name)} onCommit={(c: i32) => setColour(p.contrast, name, c)} onDone={done} />)}
  </view>;
}

// ---------------------------------------------------------------- the project and its languages

function ProjectForm(): i32 {
  const [code, setCode] = createSignal<string>('');
  const offered = (): string[] => { const have = project().languages, out: string[] = []; for (let i = 0; i < LANGUAGE_NAMES.length; i += 2) if (have.indexOf(LANGUAGE_NAMES[i]) < 0) out.push(LANGUAGE_NAMES[i]); return out; };
  return <view class="flex-col gap-6">
    <Group title={t(L.PROJECT_NAME)} what="">
      <LangColumns rows={1} width={column} first={null} value={(language: string) => project().title.get(language) ?? ''} placeholder={hint}
        onInput={(language: string, v: string) => setProjectTitle(language, v)} onDone={done} />
    </Group>
    <Show when={advanced()}>
      <PlainField label={t(L.PROJECT_ID)} value={() => project().id} placeholder={t(L.REQUIRED)} onInput={(v: string) => setProjectTitle('', v)} onDone={done} />
    </Show>
    <Group title={t(L.LANGUAGES)} what={t(L.LANGUAGES_WHAT)}>
      <view class="flex-col gap-1">
        <For each={project().languages}>{(language: string, i: i32) => <view class="flex-row items-center gap-2 h-9 px-2 rounded-md bg-zinc-950 border border-zinc-800">
          <view class="w-[34] h-6 items-center justify-center rounded bg-zinc-800"><text class="text-[11px] font-bold text-zinc-300">{language.toUpperCase()}</text></view>
          <text class="grow text-sm text-zinc-100">{L.languageName(language)}</text>
          <Show when={project().languages[0] === language}><text class="text-[11px] text-zinc-500">{t(L.DEFAULT_LANGUAGE)}</text></Show>
          <Show when={project().languages[0] !== language}>
            <button class="flex-row items-center justify-center w-[26] h-[26] rounded cursor-pointer bg-zinc-950 hover:bg-red-950" onClick={() => removeLanguageCommand(language)}><Ico name="x" size={13} color={MUTED} /></button>
          </Show>
        </view>}</For>
      </view>
      <text class="text-[11px] text-zinc-400 mt-2">{t(L.ADD_LANGUAGE)}</text>
      <view class="flex-row flex-wrap gap-2">
        <For each={offered()}>{(language: string, i: i32) => <button class="flex-row items-center gap-[6] h-8 px-3 rounded-md cursor-pointer bg-zinc-900 border border-zinc-700 hover:bg-zinc-800"
          onClick={() => { addLanguage(language); }}>
          <Ico name="plus" size={13} color={ACCENT} />
          <text class="text-xs font-bold text-zinc-100">{L.languageName(language)}</text>
        </button>}</For>
      </view>
      <view class="flex-row items-center gap-2">
        <input class="grow h-8 px-2 rounded-md bg-zinc-950 border border-zinc-700 text-sm text-zinc-100 focus:border-amber-400" placeholder={t(L.LANGUAGE_CODE)} value={code()} onInput={setCode} />
        <view class="w-[110] flex-row"><Action icon="plus" label={t(L.ADD)} look="plain" onClick={() => { if (addLanguage(code())) setCode(''); }} /></view>
      </view>
    </Group>
  </view>;
}

// ---------------------------------------------------------------- the theme

/** The names to choose among, with the one the file has now when it is not one of them (a file that left the folder). */
function offer(names: string[], now: string): string[] { return names.indexOf(now) >= 0 ? names : names.concat([now]); }
/** One name among a few, each a button: a family or a file of the folder (`none`: what the empty name is called). */
function OneOf(p: { label: string; options: string[]; none: string; value: () => string; onPick: (v: string) => void }): i32 {
  return <view class="flex-col gap-1">
    <text class="text-[11px] text-zinc-400">{p.label}</text>
    <scroll class="flex-row flex-wrap gap-1" style={{ maxHeight: 104 }}>
      {p.options.map((name: string, i: i32) => <button class={`flex-row items-center h-7 px-2 rounded-md cursor-pointer border ${p.value() === name ? 'bg-zinc-800 border-amber-400' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-600'}`}
        onClick={() => p.onPick(name)}>
        <text class="truncate text-xs text-zinc-100" style={{ maxWidth: 200 }}>{name.length > 0 ? name : p.none}</text>
      </button>)}
    </scroll>
  </view>;
}
function ThemeForm(): i32 {
  const fonts = ['sans', 'sans-bold', 'mono'].concat(filesEnding(['ttf']));
  return <view class="flex-col gap-6">
    <Group title={t(L.COLOURS)} what={t(L.COLOURS_WHAT)}><Palette contrast={false} /></Group>
    <Group title={t(L.FONTS)} what={t(L.FONTS_WHAT)}>
      <OneOf label={t(L.FONT_TEXT)} options={offer(fonts, project().theme.font)} none="" value={() => project().theme.font} onPick={(v: string) => { setThemeFile('font', v); done(); }} />
      <OneOf label={t(L.FONT_TITLE)} options={offer(fonts, project().theme.titleFont)} none="" value={() => project().theme.titleFont} onPick={(v: string) => { setThemeFile('titleFont', v); done(); }} />
      <OneOf label={t(L.LOGO)} options={offer([''].concat(filesEnding(['png', 'jpg', 'jpeg', 'webp'])), project().theme.logo)} none={t(L.NO_LOGO)} value={() => project().theme.logo}
        onPick={(v: string) => { setThemeFile('logo', v); done(); }} />
    </Group>
  </view>;
}

// ---------------------------------------------------------------- the table and the kiosk

function TableForm(): i32 {
  const loop = (): string => { const k = project().kiosk; for (const r of project().presentations) if (r.id === k.attract) return project().say(r.title, lang()); return ''; };
  return <view class="flex-col gap-6">
    <Group title={t(L.TABLE)} what="">
      <Setting label={t(L.VISITORS)} what={t(L.VISITORS_WHAT)}><NumberField label="" value={() => project().table.visitors} onCommit={(v: number) => setNumber('visitors', v)} onDone={done} /></Setting>
      <Setting label={t(L.REACH)} what={f(L.REACH_WHAT, `${project().table.width}`)}><NumberField label="" value={() => project().table.reach} onCommit={(v: number) => setNumber('reach', v)} onDone={done} /></Setting>
    </Group>
    <Group title={t(L.IDLE)} what={t(L.ATTRACT_WHAT)}>
      <Setting label={t(L.ATTRACT_AFTER)} what={loop().length > 0 ? f(L.ATTRACT_IS, loop()) : t(L.ATTRACT_NONE)}>
        <NumberField label="" value={() => project().kiosk.attractAfter} onCommit={(v: number) => setNumber('attractAfter', v)} onDone={done} />
      </Setting>
      <Setting label={t(L.RESET_AFTER)} what=""><NumberField label="" value={() => project().kiosk.resetAfter} onCommit={(v: number) => setNumber('resetAfter', v)} onDone={done} /></Setting>
    </Group>
    <Group title={t(L.KIOSK)} what="">
      <Setting label={t(L.FULLSCREEN)} what={t(L.FULLSCREEN_WHAT)}><YesNo value={() => project().kiosk.fullscreen} onPick={(on: boolean) => setFlag('fullscreen', on)} /></Setting>
      <Setting label={t(L.STATISTICS)} what={t(L.STATISTICS_WHAT)}><YesNo value={() => project().kiosk.statistics} onPick={(on: boolean) => setFlag('statistics', on)} /></Setting>
      <PlainField label={t(L.UPDATE_URL)} value={() => project().kiosk.updateUrl} placeholder="https://" onInput={setUpdateUrl} onDone={done} />
    </Group>
  </view>;
}

// ---------------------------------------------------------------- accessibility

/** At most this many text sizes: a visitor steps through them with one button. */
const SIZES = 5;
function AccessForm(): i32 {
  const sizes = (): number[] => project().accessibility.textSizes;
  const change = (i: i32, v: number): void => { const to = sizes().slice(); to[i] = v; setTextSizes(to); };
  return <view class="flex-col gap-6">
    <Group title={t(L.TEXT_SIZES)} what={t(L.TEXT_SIZES_WHAT)}>
      <view class="flex-row flex-wrap gap-2">
        {[0, 1, 2, 3, 4].map((i: i32) => <Show when={i < sizes().length}>
          <NumberField label={`${i + 1}`} value={() => i < sizes().length ? sizes()[i] : 1} onCommit={(v: number) => change(i, v)} onDone={done} />
        </Show>)}
      </view>
      <view class="flex-row gap-2">
        <Show when={sizes().length < SIZES}>
          <Action icon="plus" label={t(L.ADD_SIZE)} look="plain" onClick={() => { const s = sizes(); setTextSizes(s.concat([Math.min(3, Math.round((s[s.length - 1] + 0.3) * 100) / 100)])); done(); }} />
        </Show>
        <Show when={sizes().length > 1}><Action icon="minus" label={t(L.REMOVE_SIZE)} look="plain" onClick={() => { setTextSizes(sizes().slice(0, sizes().length - 1)); done(); }} /></Show>
      </view>
    </Group>
    <Group title={t(L.HIGH_CONTRAST)} what={t(L.HIGH_CONTRAST_WHAT)}><Palette contrast={true} /></Group>
  </view>;
}

// ---------------------------------------------------------------- guided visits

/** The height of a step of a path, with the gap under it. */
const ROW = 36;
/** The step being dragged (-1 for none) and how far, in pixels. */
const [dragged, setDragged] = createSignal<i32>(-1);
const [dragBy, setDragBy] = createSignal<number>(0);
let dragFrom: number = 0;

/** The path of the presentation being edited: its steps in order, each dragged by its grip to another place. */
function Steps(): i32 {
  const path = (): string[] => { const r = tour(); project(); return r === null ? [] : r.path; };
  const places = (): i32[] => { const out: i32[] = []; for (let i = 0; i < path().length; i++) out.push(i); return out; };
  const drop = (i: i32): void => {
    const to: i32 = Math.max(0, Math.min(path().length - 1, Math.round((i * ROW + dragBy()) / ROW)));
    batch(() => { setDragged(-1); setDragBy(0); moveStep(i, to); });
  };
  return <view class="relative" style={{ height: path().length * ROW }}>
    <For each={places()}>{(i: i32, k: i32) => <view class={`absolute left-0 right-0 flex-row items-center gap-2 h-8 px-2 rounded-md border ${dragged() === i ? 'bg-zinc-800 border-amber-400' : 'bg-zinc-950 border-zinc-800'}`}
      style={{ top: i * ROW + (dragged() === i ? dragBy() : 0) }}>
      <view class="w-[18] h-6 items-center justify-center cursor-grab"
        onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) { dragFrom = e.gy; batch(() => { setDragBy(0); setDragged(i); }); } }}
        onPointerMove={(e: ui.PointerEvent) => { if (dragged() === i) setDragBy(e.gy - dragFrom); }}
        onPointerUp={(e: ui.PointerEvent) => { if (dragged() === i) drop(i); }}>
        <Ico name="grip-vertical" size={14} color={MUTED} />
      </view>
      <text class="w-[18] text-[11px] font-bold text-zinc-500">{`${i + 1}`}</text>
      <text class="grow truncate text-sm text-zinc-100">{i < path().length ? say(project().sequence(path()[i])) : ''}</text>
      <Show when={path().length > 1}>
        <button class="flex-row items-center justify-center w-[26] h-[26] rounded cursor-pointer bg-zinc-950 hover:bg-red-950" onClick={() => removeStep(i)}><Ico name="x" size={13} color={MUTED} /></button>
      </Show>
    </view>}</For>
  </view>;
}

let tourTitle: NodeRef | null = null, namedTour: i32 = 0;
function ToursForm(): i32 {
  const title = (language: string): string => { const r = tour(); project(); return r === null ? '' : r.title.get(language) ?? ''; };
  const steps = (r: Presentation): string => { project(); return r.path.length === 1 ? t(L.ONE_STEP) : f(L.N_STEPS, `${r.path.length}`); };
  const ref = createNodeRef();
  tourTitle = ref;
  // a new guided visit is named at once
  createEffect(() => {
    const asked = nameTour();
    if (asked === namedTour) return;
    namedTour = asked;
    queueMicrotask(() => {
      const field = tourTitle;
      if (field === null || field.node < 0) return;
      ui.focusNode(field.node);
      ui.select(field.node, 0, ui.getValue(field.node).length);
    });
  });
  return <view class="flex-col gap-6">
    <Group title={t(L.TOURS)} what={t(L.TOURS_WHAT)}>
      <Show when={project().presentations.length === 0}><text class="text-xs text-zinc-500">{t(L.NO_TOUR_YET)}</text></Show>
      <view class="flex-col gap-1">
        <For each={project().presentations}>{(r: Presentation, i: i32) => <button class={`flex-row items-center justify-start gap-2 h-9 px-2 rounded-md cursor-pointer border ${tour() === r ? 'bg-zinc-800 border-amber-400' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-600'}`}
          onClick={() => setTour(r)}>
          <Ico name="route" size={14} color={ACCENT} />
          <text class="grow truncate text-sm text-zinc-100" style={{ width: 280 }}>{(project(), project().say(r.title, lang()))}</text>
          <text class="text-[11px] text-zinc-500">{steps(r)}</text>
        </button>}</For>
      </view>
      <view class="flex-row"><Action icon="plus" label={t(L.NEW_TOUR)} look="plain" onClick={addPresentation} /></view>
    </Group>
    <Show when={tour() !== null}>
      <view class="flex-col gap-6">
        <Group title={t(L.TITLE)} what="">
          <LangColumns rows={1} width={column} first={ref} value={title} placeholder={hint} onInput={(language: string, v: string) => renamePresentation(language, v)} onDone={done} />
        </Group>
        <Group title={t(L.PATH)} what={t(L.PATH_WHAT)}>
          <Steps />
          <view class="flex-row"><Action icon="plus" label={t(L.ADD_STEP)} look="plain" onClick={addStepCommand} /></view>
        </Group>
        <Setting label={t(L.IS_ATTRACT)} what={t(L.IS_ATTRACT_WHAT)}>
          <YesNo value={() => { const r = tour(); return r !== null && project().kiosk.attract === r.id; }} onPick={setAttract} />
        </Setting>
        <view class="flex-row"><Action icon="trash" label={t(L.DELETE_TOUR)} look="danger" onClick={deletePresentation} /></view>
      </view>
    </Show>
  </view>;
}

// ---------------------------------------------------------------- the view

export function Settings(): i32 {
  return <view class="grow basis-0 min-w-0 flex-col">
    <view class="flex-row items-center gap-2 h-11 px-3 shrink-0 bg-zinc-900 border-b border-zinc-800">
      <Tool icon="chevron-left" label={t(L.BACK_FROM_SETTINGS)} look="plain" off={() => false} onClick={closeSettings} />
      <view class="w-px h-5 mx-1 bg-zinc-800" />
      <Ico name="settings" size={15} color={ACCENT} />
      <text class="text-sm font-bold text-zinc-100">{t(L.SETTINGS)}</text>
    </view>
    <view class="grow basis-0 min-h-0 flex-row">
      <view class="w-[200] shrink-0 flex-col gap-1 p-3 bg-zinc-900 border-r border-zinc-800">
        {SECTIONS.map((section: string, i: i32) => <button class={`flex-row items-center justify-start gap-2 h-9 px-2 rounded-md cursor-pointer border ${settings() === section ? 'bg-zinc-800 border-amber-400' : 'bg-zinc-900 border-zinc-900 hover:bg-zinc-800'}`}
          onClick={() => openSettings(section)}>
          <Ico name={SECTION_ICON[i]} size={15} color={MUTED} />
          <text class="text-xs font-bold text-zinc-100">{t(L.SECTION_NAMES[i])}</text>
        </button>)}
      </view>
      <scroll class="shrink-0 flex-col p-4 bg-zinc-900" style={{ width: FORM }}>
        <Show when={settings() === 'project'}><ProjectForm /></Show>
        <Show when={settings() === 'theme'}><ThemeForm /></Show>
        <Show when={settings() === 'table'}><TableForm /></Show>
        <Show when={settings() === 'access'}><AccessForm /></Show>
        <Show when={settings() === 'tours'}><ToursForm /></Show>
      </scroll>
      <view class="grow basis-0 min-w-0 flex-col gap-2 p-4 bg-zinc-950 border-l border-zinc-800">
        <Heading label={t(L.SAMPLE)} />
        <SamplePane />
        <text class="text-xs text-zinc-500" style={{ width: 640 }}>{t(project().sequences.length === 0 ? L.SAMPLE_EMPTY : settings() === 'access' ? L.SAMPLE_CONTRAST : L.SAMPLE_WHAT)}</text>
      </view>
    </view>
  </view>;
}
