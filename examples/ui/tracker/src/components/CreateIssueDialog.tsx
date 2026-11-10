import { createSignal, createEffect } from 'zinc:ui/solid';
import { Dialog, Input, Textarea, Select, Button } from 'zinc:ui/kit';
import { Tracker } from '../state';
import { statuses, priorities, people, teams } from '../data';
export function CreateIssueDialog(p: { width: number; model: Tracker; open: () => boolean; onClose: () => void; onCreated: () => void }): i32 {
  const [title, setTitle] = createSignal('');
  const [description, setDescription] = createSignal('');
  const [status, setStatus] = createSignal('1');
  const [priority, setPriority] = createSignal('Medium');
  const [assignee, setAssignee] = createSignal('Unassigned');
  const [team, setTeam] = createSignal('Product');
  createEffect(() => { if (p.open()) { setTitle(''); setDescription(''); setStatus('1'); setPriority('Medium'); setAssignee('Unassigned'); setTeam('Product'); } });
  const create = (): void => {
    if (title().trim() === '') return;
    p.model.create(title(), description(), status(), priority(), assignee(), team());
    p.onClose(); p.onCreated();
  };
  return <Dialog open={p.open} onOpenChange={(open: boolean) => { if (!open) p.onClose(); }} title="Create issue" description="Add an issue to this local demo workspace." width={p.width} footer={() => <View className="flex-row gap-2"><Button label="Cancel" variant="ghost" onClick={p.onClose} /><Button label="Create issue" disabled={title().trim() === ''} onClick={create} /></View>}>
    <Input label="New issue title" placeholder="What needs to change?" value={title} onInput={setTitle} onSubmit={create} />
    <Textarea label="New issue description" rows={3} value={description} onInput={setDescription} />
    <View className="flex-row gap-3">
      <Select label="Initial status" items={statuses.map((label: string, i: i32) => ({ label, value: String(i) }))} value={status} onChange={setStatus} className="flex-1 min-w-0" />
      <Select label="Initial priority" items={priorities.map((label: string) => ({ label, value: label }))} value={priority} onChange={setPriority} className="flex-1 min-w-0" />
    </View>
    <Select label="Assign to" items={people.map((label: string) => ({ label, value: label }))} value={assignee} onChange={setAssignee} />
    <Select label="Issue team" items={teams.map((label: string) => ({ label, value: label }))} value={team} onChange={setTeam} />
  </Dialog>;
}
