// Tasks: add with Enter, check with a click (the box pops on a spring), remove with ×. Rows grow in and collapse
// out (height and opacity follow each task's `life` tween), the progress bar follows the done ratio.
import { createSignal, createNodeRef, onMount, Show } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme, Button, Tabs, Progress, Badge, heading, mutedText } from 'zinc:ui/kit';
import { entrances, TASKS } from '../app/router';
import { Task, tasks, visibleTasks, filter, setFilter, addTask, toggleTask, removeTask, clearDone, doneCount, totalCount } from '../app/tasks';
import { Tween } from '../app/motion';
import { toast } from '../app/overlays';
import { compact } from '../components/Shell';

const enter = entrances[TASKS];
const ROW_H: number = 56;
const [draft, setDraft] = createSignal<string>('');
export const taskInput = createNodeRef();
const TAGS: string[] = ['Personal', 'Design', 'Code', 'Docs', 'Media', 'Hardware'];
const [tag, setTag] = createSignal<i32>(0);

// the progress bar eases toward the done ratio instead of jumping
const progress = new Tween(0);
function syncProgress(): void { progress.to(totalCount() > 0 ? doneCount() * 100 / totalCount() : 0, 0.5); }

function submit(): void {
  const t = draft().trim();
  if (t === '') { toast('Type a task first', 'The field is empty.', 'destructive'); return; }
  addTask(t, TAGS[tag()]);
  setDraft('');
  setFilter(filter() === 2 ? 0 : filter());
}

// The box is 20 px, what a finger presses is the 44 px square around it.
function Checkbox(props: { task: Task }): i32 {
  const t = props.task;
  return <View class="w-11 h-11 -ml-3 items-center justify-center cursor-pointer" onClick={() => { toggleTask(t); syncProgress(); }}>
    <View class={`w-5 h-5 rounded-md border-2 items-center justify-center ${t.done() ? `bg-${theme().accent} border-${theme().accent}` : `border-${theme().input} bg-${theme().card}`}`}
      style={{ scale: t.check.get() }}>
      {t.done() ? <Text class="text-xs font-bold text-white">✓</Text> : <View />}
    </View>
  </View>;
}

// Renaming a task: a tap on its title turns it into a field; Enter (or leaving the field) keeps the new title, Escape the old one.
const [editing, setEditing] = createSignal<i32>(-1);
const [edited, setEdited] = createSignal<string>('');
const titleInput = createNodeRef();
let editorHadFocus = false;
function keep(t: Task): void { const v = edited().trim(); if (v !== '') t.setTitle(v); setEditing(-1); editorHadFocus = false; }
ui.onFocusChange((h: i32) => {
  if (editing() < 0) return;
  if (h === titleInput.node) { editorHadFocus = true; return; }
  if (!editorHadFocus) return;
  for (const t of tasks()) if (t.id === editing()) keep(t);
});
// On a small screen the on-screen keyboard takes half of the height: while a task is renamed there, only the list stays, so that the row
// being typed in is in sight above the keys.
const renaming = (): boolean => compact() && editing() >= 0;
function TitleEditor(props: { task: Task }): i32 {
  const t = props.task;
  onMount(() => ui.focusNode(titleInput.node));
  return <Input ref={titleInput} class={`grow h-9 rounded-lg bg-${theme().card} border-${theme().border} text-${theme().foreground} focus:border-${theme().accent}`}
    value={edited()} onInput={(v: string) => setEdited(v)}
    onKeyDown={(e: ui.KeyEvent) => { if (e.key === 'Enter') { keep(t); e.preventDefault(); } else if (e.key === 'Escape') { setEditing(-1); editorHadFocus = false; e.preventDefault(); } }} />;
}

function TaskRow(props: { task: Task }): i32 {
  const t = props.task;
  return <View class="flex-col overflow-hidden" style={{ height: Math.round(ROW_H * t.life.get()), opacity: t.life.get() }}>
    <View class={`flex-row items-center gap-3 h-[52] px-4 rounded-xl border bg-${theme().card} border-${theme().border}`}
      style={{ translateX: (1 - t.life.get()) * -30 }}>
      <Checkbox task={t} />
      {editing() === t.id ? <TitleEditor task={t} />
        : <View class="grow h-11 justify-center cursor-text" onClick={() => { setEdited(t.title()); setEditing(t.id); }}>
          <Text class={`text-sm ${t.done() ? `text-${theme().mutedForeground}` : `text-${theme().foreground}`}`}>{t.title()}</Text>
        </View>}
      <Badge label={t.tag} variant={t.done() ? 'outline' : 'secondary'} />
      <View class={`w-11 h-11 -mr-2 rounded-lg items-center justify-center cursor-pointer hover:bg-${theme().muted}`}
        onClick={() => { removeTask(t); syncProgress(); }}>
        <Text class={`text-base text-${theme().mutedForeground}`}>×</Text>
      </View>
    </View>
  </View>;
}

export function Tasks(): i32 {
  syncProgress();
  return <View class="grow flex-col gap-5 p-4 lg:p-8">
    <Show when={!renaming()}><View class="flex-row items-end justify-between" style={{ opacity: enter.at(0) }}>
      <View class="flex-col gap-1">
        <Text class={heading(2)}>Tasks</Text>
        <Text class={mutedText()}>{`${doneCount()} of ${totalCount()} done`}</Text>
      </View>
      <Tabs items={['All', 'Active', 'Done']} selected={filter} onSelect={(i: i32) => setFilter(i)} />
    </View>
    </Show>
    <Show when={!renaming()}><Progress value={() => progress.get()} /></Show>
    <Show when={!renaming()}><View class="flex-row gap-2" style={{ opacity: enter.at(0.08), translateY: (1 - enter.at(0.08)) * 12 }}>
      <Input ref={taskInput} class={`grow h-10 rounded-lg bg-${theme().card} border-${theme().border} text-${theme().foreground} focus:border-${theme().accent}`}
        placeholder="What needs doing? (Enter to add)" value={draft()} onInput={(v: string) => setDraft(v)}
        onKeyDown={(e: ui.KeyEvent) => { if (e.key === 'Enter') { submit(); syncProgress(); e.preventDefault(); } }} />
      <Button label={TAGS[tag()]} variant="outline" onClick={() => setTag((tag() + 1) % TAGS.length)} />
      <Button label="Add" onClick={() => { submit(); syncProgress(); }} />
    </View></Show>
    <ScrollView class="grow">
      <View class="flex-col gap-1 pb-2">
        {visibleTasks().map((t: Task) => <TaskRow task={t} />)}
      </View>
    </ScrollView>
    <Show when={!renaming()}><View class="flex-row items-center">
      <Text class={`text-xs grow text-${theme().mutedForeground}`}>Click the tag button to cycle it. Checked tasks can be cleared at once.</Text>
      <Button label="Clear completed" variant="ghost" onClick={() => { const n = clearDone(); syncProgress(); toast(n > 0 ? `Cleared ${n} task${n > 1 ? 's' : ''}` : 'Nothing to clear'); }} />
    </View></Show>
  </View>;
}
