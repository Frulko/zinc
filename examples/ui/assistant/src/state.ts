import { createSignal, onCleanup, batch } from 'zinc:ui/solid';
import { AiStatus, AiPlanStep, ComposerState } from 'zinc:ui/kit';
import { suggestions, scriptedAnswer } from './data';

export enum Phase { Empty, Thinking, Reading, Writing, Done, Stopped, Disposed }
export function createConversation() {
  const [phase, setPhase] = createSignal(Phase.Done);
  const [topic, setTopic] = createSignal('interfaces');
  const [model, setModel] = createSignal('guide');
  const [draft, setDraft] = createSignal('');
  const [question, setQuestion] = createSignal(suggestions[0].title);
  const [answer, setAnswer] = createSignal(scriptedAnswer('interfaces', 'guide'));
  const [notice, setNotice] = createSignal('Ready. All replies and tool results are local scripts.');
  let generation = 0;
  let timers: number[] = [];
  const busy = (): boolean => phase() === Phase.Thinking || phase() === Phase.Reading || phase() === Phase.Writing;
  const transition = (next: Phase): boolean => {
    const previous = phase();
    if (previous === Phase.Disposed) return false;
    const legal = next === Phase.Disposed || next === Phase.Empty ||
      (next === Phase.Thinking && (previous === Phase.Empty || previous === Phase.Done || previous === Phase.Stopped)) ||
      (next === Phase.Stopped && busy()) || (next === Phase.Reading && previous === Phase.Thinking) ||
      (next === Phase.Writing && previous === Phase.Reading) || (next === Phase.Done && (previous === Phase.Writing || previous === Phase.Empty));
    if (legal) setPhase(next);
    return legal;
  };
  const cancel = (): void => {
    generation++;
    for (const timer of timers) clearTimeout(timer);
    timers = [];
  };
  const send = (message: string): void => {
    if (busy() || phase() === Phase.Disposed || message.trim() === '') return;
    cancel();
    const run = generation, selectedTopic = topic(), selectedModel = model();
    batch(() => {
      setQuestion(message.trim()); setDraft(''); setAnswer('');
      transition(Phase.Thinking); setNotice('Playing the local ' + selectedModel + ' script.');
    });
    timers.push(setTimeout(() => { if (run === generation) transition(Phase.Reading); }, 650));
    timers.push(setTimeout(() => { if (run === generation) transition(Phase.Writing); }, 1350));
    timers.push(setTimeout(() => {
      if (run !== generation || phase() !== Phase.Writing) return;
      batch(() => { setAnswer(scriptedAnswer(selectedTopic, selectedModel)); transition(Phase.Done); setNotice('Local script complete. No model or network request was made.'); });
      timers = [];
    }, 2200));
  };
  const stop = (): void => {
    if (!busy()) return;
    cancel(); transition(Phase.Stopped); setNotice('Stopped. Retry replays the same question with the selected script.');
  };
  const newChat = (): void => {
    cancel();
    batch(() => { transition(Phase.Empty); setQuestion(''); setAnswer(''); setDraft(''); setNotice('New local chat. Choose a topic or write a draft.'); });
  };
  const selectTopic = (id: string): void => {
    cancel();
    batch(() => {
      transition(Phase.Empty); setTopic(id); setDraft('');
      setQuestion(id === 'text' ? suggestions[1].title : suggestions[0].title);
      setAnswer(scriptedAnswer(id, model())); transition(Phase.Done);
      setNotice('Opened the prepared local conversation.');
    });
  };
  const stepStatus = (step: number): AiStatus => {
    if (phase() === Phase.Empty) return AiStatus.Pending;
    if (phase() === Phase.Done) return AiStatus.Done;
    if (phase() === Phase.Stopped) return AiStatus.Skipped;
    const current = phase() === Phase.Thinking ? 0 : phase() === Phase.Reading ? 1 : 2;
    return step < current ? AiStatus.Done : step === current ? AiStatus.Running : AiStatus.Pending;
  };
  const steps = (): AiPlanStep[] => [
    { id: 'scope', title: 'Frame the question', detail: 'Scripted reasoning summary', status: stepStatus(0) },
    { id: 'read', title: 'Read the local reference cards', detail: 'Two public documentation links', status: stepStatus(1) },
    { id: 'write', title: 'Write and cite the answer', detail: 'A fixed reply for the selected topic', status: stepStatus(2) },
  ];
  onCleanup(() => { cancel(); transition(Phase.Disposed); });
  return { phase, topic, model, setModel, draft, setDraft, question, answer, notice, setNotice, busy, send, stop, newChat, selectTopic, stepStatus, steps,
    retry: (): void => { send(question()); },
    composerState: (): ComposerState => busy() ? ComposerState.Busy : ComposerState.Ready };
}
