// The panel at the right of the storyboard: what is selected, and what can be done with it. A sequence: its title in every language, where the
// visit starts, its links. A link: its label in every language, how its target opens. Nothing: the project and how the storyboard works.
import { createNodeRef, createEffect, NodeRef, For, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Sequence, Link } from '../src/project';
import { doc, project, lang, selected, selectedLink, select, nameIt, refresh, renameSelected, duplicateSelected, deleteSelection, startHere, setLinkLabel, setLinkTransition,
  setLinkOverlay, advanced, selectionJson, placeSelected } from './state';
import { Ico, Action, Segmented, LangField, NumberField, Heading, ACCENT, MUTED, WARN } from './widgets';

/** A field was left: its typing is one undo step, and it shows the document's value again (an emptied required text comes back). */
function done(): void { doc().seal(); refresh(); }
function say(s: Sequence | null): string { return s === null ? '' : project().say(s.title, lang()); }
function count(n: i32, one: string, many: string): string { return `${n} ${n === 1 ? one : many}`; }

/** The selection as the file has it, read only (advanced mode): what an agency checks, and what a support request quotes. */
function Written(): i32 {
  return <view class="flex-col gap-2">
    <Heading label="In the project file" />
    <textarea readOnly wrap={false} class="font-mono text-[11px] text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-md p-2" style={{ height: 190 }} value={selectionJson()} />
  </view>;
}
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
  const links = (): Link[] => { const s = selected(); project(); return s === null ? [] : s.links; };
  // a new sequence is named at once: the caret goes to its title, all of it selected
  createEffect(() => {
    const asked = nameIt();
    if (asked === answered) return;   // the panel is also built when a sequence is merely selected
    answered = asked;
    queueMicrotask(() => {
      const f = titleField;
      if (f === null || f.node < 0) return;
      ui.focusNode(f.node);
      ui.select(f.node, 0, ui.getValue(f.node).length);
    });
  });
  return <view class="flex-col gap-5 p-4">
    <view class="flex-col gap-1">
      <Heading label="Sequence" />
      <text class="text-lg font-bold text-zinc-100 truncate">{say(selected())}</text>
    </view>
    <view class="flex-col gap-2">
      <Heading label="Title" />
      <For each={project().languages}>{(language: string, i: i32) => {
        const ref = createNodeRef();
        if (i === 0) titleField = ref;
        return <LangField language={language} value={() => title(language)} placeholder={i === 0 ? 'Required' : 'Not translated yet'} field={ref} onInput={(v: string) => renameSelected(language, v)} onDone={done} />;
      }}</For>
    </view>
    <view class="flex-col gap-2">
      <Heading label="Visit" />
      <Show when={isStart()}>
        <view class="flex-row items-center gap-2 h-8 px-3 rounded-md bg-zinc-800">
          <Ico name="flag" size={14} color={ACCENT} />
          <text class="text-xs text-zinc-100">The visit starts with this sequence</text>
        </view>
      </Show>
      <Show when={!isStart()}>
        <view class="flex-row"><Action icon="flag" label="Start the visit here" look="plain" onClick={startHere} /></view>
      </Show>
      <Show when={!isStart() && incoming() === 0}>
        <view class="flex-row items-center gap-2">
          <Ico name="triangle-alert" size={14} color={WARN} />
          <text class="text-xs text-orange-300" style={{ width: 262 }}>No link leads here: visitors cannot reach it.</text>
        </view>
      </Show>
      <Show when={incoming() > 0}>
        <text class="text-xs text-zinc-400">{count(incoming(), 'link leads', 'links lead') + ' here.'}</text>
      </Show>
    </view>
    <view class="flex-col gap-2">
      <Heading label="Links to other sequences" />
      <Show when={links().length === 0}>
        <text class="text-xs text-zinc-500">None yet. Drag the round handle under the sequence and drop it on another one.</text>
      </Show>
      <For each={links()}>{(l: Link, i: i32) => <button class="flex-row items-center gap-2 h-8 px-2 rounded-md cursor-pointer bg-zinc-950 border border-zinc-800 hover:border-zinc-600"
        onClick={() => select(selected(), l)}>
        <Ico name="arrow-right" size={13} color={MUTED} />
        <text class="truncate text-xs text-zinc-100" style={{ width: 138 }}>{project().say(l.label, lang())}</text>
        <text class="truncate text-xs text-right text-zinc-500" style={{ width: 100 }}>{say(project().sequence(l.to))}</text>
      </button>}</For>
    </view>
    <view class="flex-row gap-2">
      <Action icon="copy" label="Duplicate" look="plain" onClick={duplicateSelected} />
      <Action icon="trash" label="Delete" look="danger" onClick={deleteSelection} />
    </view>
    <Show when={advanced()}>
      <view class="flex-col gap-2">
        <Heading label="Place on the storyboard" />
        <view class="flex-row gap-3">
          <NumberField label="X" value={() => { const s = selected(); project(); return s === null ? 0 : s.storyX; }} onCommit={(v: number) => { const s = selected(); if (s !== null) placeSelected(v, s.storyY); }} onDone={done} />
          <NumberField label="Y" value={() => { const s = selected(); project(); return s === null ? 0 : s.storyY; }} onCommit={(v: number) => { const s = selected(); if (s !== null) placeSelected(s.storyX, v); }} onDone={done} />
        </view>
      </view>
    </Show>
    <Show when={advanced()}><Written /></Show>
  </view>;
}

function LinkPanel(): i32 {
  const label = (language: string): string => { const l = selectedLink(); project(); return l === null ? '' : l.label.get(language) ?? ''; };
  const target = (): Sequence | null => { const l = selectedLink(); return l === null ? null : project().sequence(l.to); };
  return <view class="flex-col gap-5 p-4">
    <view class="flex-col gap-1">
      <Heading label="Link" />
      <button class="flex-row items-center justify-start gap-2 h-7 cursor-pointer bg-zinc-900" onClick={() => select(selected(), null)}>
        <text class="truncate text-sm font-bold text-zinc-100" style={{ maxWidth: 125 }}>{say(selected())}</text>
        <Ico name="arrow-right" size={14} color={ACCENT} />
        <text class="truncate text-sm font-bold text-zinc-100" style={{ maxWidth: 125 }}>{say(target())}</text>
      </button>
      <text class="text-xs text-zinc-500">A button of the first sequence that leads to the second.</text>
    </view>
    <view class="flex-col gap-2">
      <Heading label="Label of the button" />
      <For each={project().languages}>{(language: string, i: i32) =>
        <LangField language={language} value={() => label(language)} placeholder={i === 0 ? 'Required' : 'Not translated yet'} field={createNodeRef()} onInput={(v: string) => setLinkLabel(language, v)} onDone={done} />}</For>
    </view>
    <view class="flex-col gap-2">
      <Heading label="The target opens" />
      <Segmented options={['replace', 'overlay']} labels={['In its place', 'Over it']} value={() => { const l = selectedLink(); project(); return l !== null && l.overlay ? 'overlay' : 'replace'; }}
        onPick={(v: string) => setLinkOverlay(v === 'overlay')} />
      <text class="text-xs text-zinc-500">Over it: the sequence waits underneath and comes back when the target is closed.</text>
    </view>
    <view class="flex-col gap-2">
      <Heading label="Transition" />
      <Segmented options={['fade', 'slide', 'none']} labels={['Fade', 'Slide', 'None']} value={() => { const l = selectedLink(); project(); return l === null ? 'fade' : l.transition; }} onPick={setLinkTransition} />
    </view>
    <view class="flex-row"><Action icon="trash" label="Delete the link" look="danger" onClick={deleteSelection} /></view>
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
const KEYS: string[] = ['N|New sequence', 'Enter|Name the selected sequence', 'S|Start the visit at the selection', 'Ctrl D|Duplicate', 'Delete|Delete the selection',
  'Ctrl Z|Undo', 'Shift Ctrl Z|Redo', 'Ctrl S|Save', 'Shift Ctrl S|Save as', 'Ctrl O|Open', 'Ctrl N|New project', 'Ctrl 0|Show everything', 'Ctrl + / -|Zoom in, zoom out',
  'L|The other language', 'Ctrl E|Advanced mode', 'Escape|Deselect'];
function ProjectPanel(): i32 {
  const links = (): i32 => { let n: i32 = 0; for (const s of project().sequences) n += s.links.length; return n; };
  return <view class="flex-col gap-5 p-4">
    <view class="flex-col gap-1">
      <Heading label="Project" />
      <text class="text-lg font-bold text-zinc-100">{project().say(project().title, lang())}</text>
      <text class="text-xs text-zinc-400">{`${count(project().sequences.length, 'sequence', 'sequences')}, ${count(links(), 'link', 'links')}, ${count(project().media.length, 'medium', 'media')}`}</text>
    </view>
    <view class="flex-col gap-3">
      <Heading label="How the storyboard works" />
      <Tip icon="mouse-pointer-click" text="Double-click the background to create a sequence, then type its title." />
      <Tip icon="link" text="Drag the round handle under a sequence onto another one to link them: a button is added to the first." />
      <Tip icon="flag" text="The flag marks where the visit starts. Select a sequence to move it there." />
      <Tip icon="triangle-alert" text="A dashed orange sequence is one no link leads to: visitors cannot reach it." />
      <Tip icon="pencil" text="Select a sequence or the handle of a link to edit it here." />
    </view>
    <Show when={advanced()}>
      <view class="flex-col gap-2">
        <Heading label="Keys (Cmd for Ctrl on a Mac)" />
        {KEYS.map((k: string, i: i32) => <view class="flex-row items-center gap-3">
          <text class="w-[92] text-[11px] font-bold text-zinc-300">{k.slice(0, k.indexOf('|'))}</text>
          <text class="text-xs text-zinc-400">{k.slice(k.indexOf('|') + 1)}</text>
        </view>)}
      </view>
    </Show>
  </view>;
}

export function Inspector(): i32 {
  return <view class="w-[320] shrink-0 flex-col bg-zinc-900 border-l border-zinc-800">
    <Show when={selected() !== null && selectedLink() === null}><SequencePanel /></Show>
    <Show when={selected() !== null && selectedLink() !== null}><LinkPanel /></Show>
    <Show when={selected() === null}><ProjectPanel /></Show>
  </view>;
}
