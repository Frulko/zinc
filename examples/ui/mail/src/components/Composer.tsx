import { Dialog, Input, Textarea, Button, theme } from 'zinc:ui/kit';
import { Mailbox } from '../state';
export function Composer(p: { model: Mailbox; width: number; open: () => boolean; onClose: () => void; onSaved: () => void }): i32 {
  const save = (): void => { if (p.model.saveCopy()) p.onSaved(); };
  return <Dialog title="Compose local message" description="Save a copy to Sent. This demo never sends email." width={p.width} open={p.open} onOpenChange={(open: boolean) => { if (!open) p.onClose(); }} footer={() => <View className="flex-row gap-2"><Button label="Discard" variant="ghost" onClick={p.onClose} /><Button label="Save to Sent" onClick={save} /></View>}>
    <Input label="To" type="email" placeholder="maya@example.com" value={p.model.to} onInput={p.model.setTo} />
    <Input label="Subject" value={p.model.subject} onInput={p.model.setSubject} />
    <Textarea label="Message" rows={5} value={p.model.body} onInput={p.model.setBody} onSubmit={save} />
    <Show when={p.model.error() !== ''}><Text role="alert" className={`text-[12px] text-${theme().destructive}`}>{p.model.error()}</Text></Show>
  </Dialog>;
}
