/** @jsxHelpers zinc:ui/kit/host */
import { AiStatus, Reasoning, ToolCall, AgentPlan, AiPlanStep, Sources, Citation, AiSource, ContextMeter, Button, captionText } from 'zinc:ui/kit';
import { componentSignal } from 'zinc:ui/kit/host';
export function ResearchExample(): i32 {
  const [phase, setPhase] = componentSignal(AiStatus.Running);
  const [used, setUsed] = componentSignal(6400);
  const [opened, setOpened] = componentSignal('Select a source to inspect its callback.');
  const transition = (next: AiStatus): void => {
    if ((phase() === AiStatus.Running && next === AiStatus.Done) || (phase() === AiStatus.Done && next === AiStatus.Running)) setPhase(next);
  };
  const sources: AiSource[] = [
    { title: 'Workshop notes', url: 'https://notes.example/workshop', snippet: 'A small reading lamp made with paper, copper tape and one LED.' },
    { title: 'Parts and safety', url: 'https://makers.example/components', snippet: 'The material list and the steps to check before switching on.' },
  ];
  const steps = (): AiPlanStep[] => [
    { id: 'read', title: 'Read the notes', detail: 'Two local sample documents', status: AiStatus.Done },
    { id: 'compare', title: 'Check the parts', detail: 'Compare the materials and the instructions', status: phase() },
    { id: 'write', title: 'Write a short plan', status: phase() === AiStatus.Done ? AiStatus.Done : AiStatus.Pending },
  ];
  return <View className="flex-col gap-5 min-w-0">
    <Text className={captionText()}>Local sample events. These controls do not make a network request.</Text>
    <View className="flex-row flex-wrap gap-2">
      <Button label={phase() === AiStatus.Running ? 'Finish research' : 'Restart research'} variant="outline" size="sm" onClick={() => transition(phase() === AiStatus.Running ? AiStatus.Done : AiStatus.Running)} />
      <Button label="Add context" variant="outline" size="sm" onClick={() => setUsed(Math.min(10000, used() + 1600))} />
      <ContextMeter used={used} limit={10000} parts={() => [{ label: 'Conversation', value: 2400 }, { label: 'Documents', value: used() - 2400 }]} />
    </View>
    <Reasoning status={phase()} seconds={8}>
      <Text className="text-[13px]">Checked the material list and compared the two sample documents. The next step is a short, practical plan.</Text>
    </Reasoning>
    <ToolCall name="read_document" detail="workshop-notes.md" status={phase()} seconds={1.4} input='{"path":"workshop-notes.md"}' output='{"pages":2,"materials":["paper","copper tape","LED"]}' />
    <ToolCall name="lookup_supplier" detail="No supplier selected" status={AiStatus.Skipped} />
    <AgentPlan title="Research plan" steps={steps} onSelect={(step: AiPlanStep) => setOpened('Selected step: ' + step.title)} />
    <Sources items={sources} onOpen={(source: AiSource) => setOpened('Selected source: ' + source.title)} />
    <View className="flex-row flex-wrap items-center gap-2">
      <Text className="text-[13px]">The material list has two sources.</Text>
      <Citation number={1} source={sources[0]} onOpen={(source: AiSource) => setOpened('Selected source: ' + source.title)} />
      <Citation number={2} source={sources[1]} onOpen={(source: AiSource) => setOpened('Selected source: ' + source.title)} />
    </View>
    <Text role="status" className={captionText()}>{opened()}</Text>
  </View>;
}
