import { createSignal, createEffect } from 'zinc:ui/solid';
import { Input, Textarea, Select, Badge, Button, Separator, theme } from 'zinc:ui/kit';
import { Tracker } from '../state';
import { Comment, statuses, people, priorities, teams, Status } from '../data';
export function IssueDetail(p: { model: Tracker }): i32 {
  const [comment, setComment] = createSignal('');
  createEffect(() => { p.model.selectedId(); setComment(''); });
  return <View className="flex-col gap-5">
    <View className="flex-row items-center gap-2">
      <Text className={`text-[12px] text-${theme().mutedForeground}`}>{p.model.selected().id}</Text>
      <Badge label={p.model.selected().label} />
      <View className="grow" />
      <Badge label="Local demo" />
    </View>
    <Input label="Issue title" value={() => p.model.selected().title} onInput={(value: string) => p.model.update('title', value)} />
    <Textarea label="Description" rows={0} maxRows={6} value={() => p.model.selected().description} onInput={(value: string) => p.model.update('description', value)} />
    <View className="flex-row gap-3">
      <Select label="Status" items={statuses.map((label: string, i: i32) => ({ value: String(i), label }))} value={() => String(p.model.selected().status)} onChange={(value: string) => p.model.update('status', value)} className="flex-1 min-w-0" />
      <Select label="Priority" items={priorities.map((label: string) => ({ value: label, label }))} value={() => p.model.selected().priority} onChange={(value: string) => p.model.update('priority', value)} className="flex-1 min-w-0" />
    </View>
    <Select label="Assignee" items={people.map((label: string) => ({ value: label, label }))} value={() => p.model.selected().assignee} onChange={(value: string) => p.model.update('assignee', value)} />
    <Select label="Team" items={teams.map((label: string) => ({ value: label, label }))} value={() => p.model.selected().team} onChange={(value: string) => p.model.update('team', value)} />
    <Button label={p.model.selected().status === Status.Done ? 'Reopen issue' : 'Mark as done'} variant="outline" onClick={() => p.model.update('status', String(p.model.selected().status === Status.Done ? Status.Todo : Status.Done))} />
    <Separator />
    <Text className={`text-[15px] font-medium text-${theme().foreground}`}>Activity</Text>
    <Text className={`text-[12px] text-${theme().mutedForeground}`}>Created for the survey launch workspace.</Text>
    {p.model.selected().comments.map((entry: Comment) => <View className={`flex-col gap-1 py-2 border-b border-${theme().border}`}><Text className={`text-[12px] font-medium text-${theme().foreground}`}>{entry.author}</Text><Text className={`text-[13px] text-${theme().mutedForeground}`}>{entry.text}</Text></View>)}
    <Textarea label="Comment" placeholder="Share an update…" rows={2} value={comment} onInput={setComment} />
    <Button label="Add comment" disabled={comment().trim() === ''} onClick={() => { p.model.addComment(comment()); setComment(''); }} />
  </View>;
}
