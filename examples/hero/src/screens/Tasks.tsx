// Tasks: add with Enter, check with a click (the box pops on a spring), remove with ×. Rows grow in and collapse
// out (height and opacity follow each task's `life` tween), the progress bar follows the done ratio.
import { createSignal, createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { theme, Button, Tabs, Progress, Badge, heading, mutedText } from 'zinc:ui/kit';
import { entrances, TASKS } from '../app/router';
import { Task, tasks, visibleTasks, filter, setFilter, addTask, toggleTask, removeTask, clearDone, doneCount, totalCount } from '../app/tasks';
import { Tween } from '../app/motion';
import { toast } from '../app/overlays';

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

function Checkbox(props: { task: Task }): i32 {
  const t = props.task;
  return <View class={`w-5 h-5 rounded-md border-2 items-center justify-center cursor-pointer ${t.done() ? `bg-${theme().accent} border-${theme().accent}` : `border-${theme().input} bg-${theme().card}`}`}
    style={{ scale: t.check.get() }}
    onClick={() => { toggleTask(t); syncProgress(); }}>
    {t.done() ? <Text class="text-xs font-bold text-white">✓</Text> : <View />}
  </View>;
}

function TaskRow(props: { task: Task }): i32 {
  const t = props.task;
  return <View class="flex-col overflow-hidden" style={{ height: Math.round(ROW_H * t.life.get()), opacity: t.life.get() }}>
    <View class={`flex-row items-center gap-3 h-[52] px-4 rounded-xl border bg-${theme().card} border-${theme().border}`}
      style={{ translateX: (1 - t.life.get()) * -30 }}>
      <Checkbox task={t} />
      <Text class={`text-sm grow ${t.done() ? `text-${theme().mutedForeground}` : `text-${theme().foreground}`}`}>{t.title}</Text>
      <Badge label={t.tag} variant={t.done() ? 'outline' : 'secondary'} />
      <View class={`w-8 h-8 rounded-lg items-center justify-center cursor-pointer hover:bg-${theme().muted}`}
        onClick={() => { removeTask(t); syncProgress(); }}>
        <Text class={`text-base text-${theme().mutedForeground}`}>×</Text>
      </View>
    </View>
  </View>;
}

export function Tasks(): i32 {
  syncProgress();
  return <View class="grow flex-col gap-5 p-8">
    <View class="flex-row items-end justify-between" style={{ opacity: enter.at(0) }}>
      <View class="flex-col gap-1">
        <Text class={heading(2)}>Tasks</Text>
        <Text class={mutedText()}>{`${doneCount()} of ${totalCount()} done`}</Text>
      </View>
      <Tabs items={['All', 'Active', 'Done']} selected={filter} onSelect={(i: i32) => setFilter(i)} />
    </View>
    <Progress value={() => progress.get()} />
    <View class="flex-row gap-2" style={{ opacity: enter.at(0.08), translateY: (1 - enter.at(0.08)) * 12 }}>
      <Input ref={taskInput} class={`grow h-10 rounded-lg bg-${theme().card} border-${theme().border} text-${theme().foreground} focus:border-${theme().accent}`}
        placeholder="What needs doing? (Enter to add)" value={draft()} onInput={(v: string) => setDraft(v)}
        onKeyDown={(e: ui.KeyEvent) => { if (e.key === 'Enter') { submit(); syncProgress(); e.preventDefault(); } }} />
      <Button label={TAGS[tag()]} variant="outline" onClick={() => setTag((tag() + 1) % TAGS.length)} />
      <Button label="Add" onClick={() => { submit(); syncProgress(); }} />
    </View>
    <ScrollView class="grow">
      <View class="flex-col gap-1 pb-2">
        {visibleTasks().map((t: Task) => <TaskRow task={t} />)}
      </View>
    </ScrollView>
    <View class="flex-row items-center">
      <Text class={`text-xs grow text-${theme().mutedForeground}`}>Click the tag button to cycle it. Checked tasks can be cleared at once.</Text>
      <Button label="Clear completed" variant="ghost" onClick={() => { const n = clearDone(); syncProgress(); toast(n > 0 ? `Cleared ${n} task${n > 1 ? 's' : ''}` : 'Nothing to clear'); }} />
    </View>
  </View>;
}
