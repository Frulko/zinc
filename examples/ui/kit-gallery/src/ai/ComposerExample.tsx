/** @jsxHelpers zinc:ui/kit/host */
import { PromptSuggestions, AiSuggestion, ModelPicker, AiModel, AiAttachment, ChatComposer, ComposerState, Button, captionText } from 'zinc:ui/kit';
import { componentSignal, componentRef } from 'zinc:ui/kit/host';
export function ComposerExample(): i32 {
  const [draft, setDraft] = componentSignal('');
  const [model, setModel] = componentSignal('balanced');
  const [phase, setPhase] = componentSignal(ComposerState.Ready);
  const [attachments, setAttachments] = componentSignal<AiAttachment[]>([]);
  const [event, setEvent] = componentSignal('Choose a suggestion or write a message.');
  const sequence = componentRef(0);
  const transition = (next: ComposerState): boolean => {
    const previous = phase();
    const legal = previous === ComposerState.Ready ? next === ComposerState.Busy || next === ComposerState.Disabled
      : previous === ComposerState.Busy ? next === ComposerState.Ready || next === ComposerState.Disabled : next === ComposerState.Ready;
    if (!legal) return false;
    setPhase(next); return true;
  };
  const models: AiModel[] = [
    { id: 'compact', name: 'Compact', detail: 'Short replies' },
    { id: 'balanced', name: 'Balanced', detail: 'General questions', badge: 'Default' },
    { id: 'detailed', name: 'Detailed', detail: 'Long answers' },
  ];
  const suggestions: AiSuggestion[] = [
    { id: 'plan', title: 'Plan a workshop', detail: 'A short list of practical steps' },
    { id: 'explain', title: 'Explain a circuit', detail: 'Describe the parts in plain words' },
    { id: 'unavailable', title: 'Analyse an upload', detail: 'Unavailable in this local example', disabled: true },
  ];
  const attach = (): void => {
    sequence.current++;
    setAttachments(attachments().concat([{ id: 'note-' + String(sequence.current), name: 'notes-' + String(sequence.current) + '.md' }]));
  };
  return <View className="flex-col gap-5 min-w-0">
    <PromptSuggestions items={suggestions} onSelect={(item: AiSuggestion) => setDraft(item.title)} />
    <View className="max-w-[400px]"><ModelPicker items={models} value={model} onChange={setModel} label="Sample model" /></View>
    <ChatComposer value={draft} onChange={setDraft} state={phase} onSend={(message: string) => { if (transition(ComposerState.Busy)) { setEvent('Submitted with ' + model() + ': ' + message); setDraft(''); } }}
      onStop={() => { if (transition(ComposerState.Ready)) setEvent('Stopped the local sample.'); }}
      attachments={attachments()} onAttach={attach} onRemoveAttachment={(id: string) => setAttachments(attachments().filter((file: AiAttachment) => file.id !== id))}
      model={{ items: models, value: model, onChange: setModel }} />
    <View className="flex-row flex-wrap gap-2">
      <Button label="Finish sample reply" variant="outline" size="sm" disabled={phase() !== ComposerState.Busy} onClick={() => { transition(ComposerState.Ready); }} />
      <Button label={phase() === ComposerState.Disabled ? 'Enable composer' : 'Disable composer'} variant="outline" size="sm" onClick={() => { transition(phase() === ComposerState.Disabled ? ComposerState.Ready : ComposerState.Disabled); }} />
    </View>
    <Text role="status" className={captionText()}>{event()}</Text>
    <Text className={captionText()}>Enter sends · Shift Enter starts a line · an empty message cannot be sent.</Text>
  </View>;
}
