/** @jsxHelpers zinc:ui/kit/host */
import * as ui from 'zinc:ui';
import { Show } from 'zinc:ui/solid';
import { equal, ok } from 'zinc:assert';
import { componentSignal, componentEffect } from 'zinc:ui/kit/host';
import { AiStatus, ComposerState, Reasoning, ToolCall, AgentPlan, AiPlanStep, Sources, Citation, AiSource, ContextMeter, PromptSuggestions, AiSuggestion, ModelPicker, AiModel, ChatComposer, AiAttachment, ChatBubble, Textarea, useQuietTheme } from 'zinc:ui/kit';

let phaseSet = (value: AiStatus): void => {};
let stateSet = (value: ComposerState): void => {};
let draftSet = (value: string): void => {};
let draftRead = (): string => '';
let rerender = (): void => {};
let hide = (): void => {}, show = (): void => {};
let sent: i32 = 0, stopped: i32 = 0, attached: i32 = 0, removed: string = '', opened: string = '', suggestion: string = '', chosen: string = 'one', retried: i32 = 0;
let nativeSubmit: i32 = 0, customKeys: i32 = 0, owners: i32 = 0, frame: i32 = 0, paint: i32 = 0;
let taskSource: string = '', link: string = '';
function Suite(): i32 {
  const [phase, setPhase] = componentSignal(AiStatus.Running), [state, setState] = componentSignal(ComposerState.Ready);
  const [draft, setDraft] = componentSignal(''), [revision, setRevision] = componentSignal(0), [model, setModel] = componentSignal('one');
  phaseSet = setPhase; stateSet = setState; draftSet = setDraft; draftRead = draft; rerender = () => setRevision(revision() + 1);
  componentEffect(() => { owners++; return () => { owners--; }; }, []);
  const sources: AiSource[] = [{ title: 'Notes', url: 'https://notes.example/one', snippet: 'A local sample.' }];
  const models: AiModel[] = [{ id: 'one', name: 'Compact', detail: 'Short' }, { id: 'disabled', name: 'Disabled', disabled: true }, { id: 'two', name: 'Balanced', badge: 'Default' }];
  return <View className="flex-col gap-2 p-4">
    <Text>{String(revision())}</Text>
    <Reasoning title="Reasoning" status={phase()}><Text>Manual reasoning body</Text></Reasoning>
    <Reasoning title="Automatic reasoning" status={phase()}><Text>Automatic reasoning body</Text></Reasoning>
    <ToolCall name="Read note" status={phase()} input='{"path":"notes.md"}' output="Read successfully." />
    <AgentPlan title="Plan" steps={() => [{ id: 'read', title: 'Read step', status: phase() }, { id: 'write', title: 'Write step', status: AiStatus.Pending }]} onSelect={(step: AiPlanStep) => { opened = step.id; }} />
    <Sources items={sources} onOpen={(source: AiSource) => { opened = source.url; }} />
    <Citation source={sources[0]} number={2} onOpen={(source: AiSource) => { opened = source.title; }} />
    <ContextMeter used={() => 95} limit={100} parts={() => [{ label: 'Documents', value: 95 }]} />
    <PromptSuggestions items={[{ id: 'start', title: 'Start here' }, { id: 'off', title: 'Unavailable', disabled: true }]} onSelect={(item: AiSuggestion) => { suggestion = item.id; setDraft(item.title); }} />
    <ModelPicker items={models} value={model} onChange={(id: string) => { chosen = id; setModel(id); }} label="Models" />
    <ChatComposer value={draft} onChange={setDraft} state={state} maxLines={3} onSend={(value: string) => { sent++; equal(value, draft()); setState(ComposerState.Busy); }}
      onStop={() => { stopped++; setState(ComposerState.Ready); }} onAttach={() => { attached++; }}
      attachments={[{ id: 'note', name: 'notes.md' }]} onRemoveAttachment={(id: string) => { removed = id; }} />
    <ChatBubble author="Assistant" text="Copy this message" time="09:41" onRetry={() => { retried++; }} />
    <ChatBubble author="Guide" markdown={true} text={'[Read guide](https://guide.example)\n\n- [ ] Check circuit'} onLink={(href: string) => { link = href; }} onTask={(source: string, offset: i32, checked: boolean) => { taskSource = source; ok(offset >= 0 && checked); }} />
    <Textarea label="Legacy multiline" rows={2} onSubmit={() => { nativeSubmit++; }} onKeyDown={(event: ui.KeyEvent) => { customKeys++; if (event.key === 'x') event.preventDefault(); }} />
  </View>;
}
export function App(): i32 {
  const [visible, setVisible] = componentSignal(true);
  hide = () => setVisible(false); show = () => setVisible(true);
  return <View><Show when={visible()}><Suite /></Show></View>;
}
function findIn(root: i32, label: string, role: string = '', field: boolean = false): i32 {
  const node = ui.inspectNode(root);
  if (node === null || node.hidden || node.fade < 0.99) return -1;
  if (node.label === label && (role === '' || node.role === role) && (!field || node.ed !== null)) return root;
  for (const child of node.children) {
    const found = findIn(child, label, role, field);
    if (found >= 0) return found;
  }
  return -1;
}
function find(label: string, role: string = '', field: boolean = false): i32 {
  const h = findIn(ui.rootNode(), label, role, field);
  ok(h >= 0, 'Missing ' + label); return h;
}
function attr(h: i32, key: string): string {
  const node = ui.inspectNode(h); if (node === null) return '';
  const at = node.attrK.indexOf(key); return at < 0 ? '' : node.attrV[at];
}
function press(label: string): void {
  const node = find(label); ui.focusNode(node); ui.keyDown(node, 'Enter'); ui.keyUp('Enter');
}
function point(label: string): void {
  const box = ui.screenBox(find(label)), x = box[0] + box[2] / 2, y = box[1] + box[3] / 2;
  ui.pointerAt(x, y, false); ui.pointerAt(x, y, true); ui.pointerAt(x, y, false);
}
useQuietTheme();
ui.systemSignal('reducemotion 1');
ui.setAfterPaint(() => {
  // Observe native default activation, then the React render scheduled by it.
  ui.repaint();
  if (paint++ % 2 !== 0) return;
  if (frame === 0) {
    equal(owners, 1); equal(attr(find('Reasoning'), 'aria-expanded'), 'true');
    point('Reasoning'); phaseSet(AiStatus.Done);
    ui.click(find('Unavailable')); equal(suggestion, '', 'disabled suggestion');
  } else if (frame === 1) {
    equal(attr(find('Reasoning'), 'aria-expanded'), 'false', 'manual choice survives completion');
    equal(attr(find('Automatic reasoning'), 'aria-expanded'), 'false', 'automatic disclosure folds');
    press('Reasoning');
  } else if (frame === 2) {
    equal(attr(find('Reasoning'), 'aria-expanded'), 'true');
    phaseSet(AiStatus.Running); ui.click(find('Read note'));
    ui.click(find('Read step')); equal(opened, 'read');
    ui.click(find('Start here')); equal(suggestion, 'start'); equal(draftRead(), 'Start here');
    ui.click(find('Attach files')); equal(attached, 1);
    ui.click(find('Remove notes.md')); equal(removed, 'note');
  } else if (frame === 3) {
    equal(attr(find('Reasoning'), 'aria-expanded'), 'true', 'manual open survives next run');
    equal(attr(find('Automatic reasoning'), 'aria-expanded'), 'true');
    ok(findIn(ui.rootNode(), 'Input') >= 0, 'JSON input visible');
    const field = find('Message', '', true);
    ui.focusNode(field); ui.select(field, 0, ui.getValue(field).length);
    ui.systemSignal('compose ni'); ui.keyDown(field, 'Enter');
    equal(sent, 0, 'IME Enter must not send');
    ui.systemSignal('commit 你');
    draftSet('draft');
  } else if (frame === 4) {
    const field = find('Message', '', true); equal(ui.getValue(field), 'draft');
    ui.focusNode(field); ui.select(field, 2, 2); rerender();
  } else if (frame === 5) {
    const field = find('Message', '', true); equal(ui.getValue(field), 'draft'); equal(ui.caretOf(field), 2, 'parent render keeps caret');
    ui.keyDown(field, 'Enter', ui.SHIFT); equal(draftRead(), 'dr\naft', 'Shift Enter inserts newline'); equal(sent, 0);
    ui.keyDown(field, 'Enter'); equal(sent, 1);
    ui.keyDown(field, 'Enter'); equal(sent, 1, 'busy getter blocks same-event duplicate send');
  } else if (frame === 6) {
    press('Stop');
  } else if (frame === 7) {
    equal(stopped, 1); draftSet(''); stateSet(ComposerState.Disabled);
    ui.click(find('Retry')); equal(retried, 1);
    const field = find('Legacy multiline', '', true); ui.focusNode(field); ui.keyDown(field, 'Enter', ui.CTRL);
    equal(nativeSubmit, 1, 'legacy Ctrl Enter'); ok(customKeys > 0);
    ui.keyDown(field, 'x'); equal(ui.getValue(field), '', 'custom key prevents native edit');
  } else if (frame === 8) {
    ui.click(find('Send')); equal(sent, 1, 'disabled composer');
    stateSet(ComposerState.Ready); draftSet('one\ntwo\nthree\nfour\nfive');
  } else if (frame === 9) {
    const field = find('Message', '', true), box = ui.screenBox(field), info = ui.editView(field);
    ok(box[3] <= 79, 'max rows bound'); ok(info[5] >= 5, 'native logical rows retained');
    press('Citation 2: Notes');
  } else if (frame === 10) {
    const region = find('Citation 2: Notes', 'region');
    ui.click(findIn(region, 'Open source 2: Notes')); equal(opened, 'Notes');
    ui.keyDown(ui.focused(), 'Escape');
    const picker = find('Models', 'combobox'); ui.focusNode(picker); ui.keyDown(picker, 'ArrowDown');
  } else if (frame === 11) {
    equal(attr(find('Models', 'combobox'), 'aria-expanded'), 'true');
    ui.keyDown(find('Models', 'group'), 'ArrowDown');
    equal(ui.focused(), find('Compact — Short', 'option'));
    ui.keyDown(ui.focused(), 'ArrowDown');
    equal(ui.focused(), find('Balanced · Default', 'option'), 'disabled model skipped');
    ui.keyDown(ui.focused(), 'Enter');
  } else if (frame === 12) {
    equal(chosen, 'two'); equal(attr(find('Models', 'combobox'), 'aria-expanded'), 'false');
    point('Open source 1: Notes'); equal(opened, 'https://notes.example/one');
    point('Start here'); equal(draftRead(), 'Start here');
    press('Read guide: https://guide.example'); equal(link, 'https://guide.example');
    press('Check circuit');
  } else if (frame === 13) {
    ok(taskSource.includes('- [x] Check circuit'), 'markdown task source returned');
    point('Send'); equal(sent, 2, 'pointer sends');
  } else if (frame === 14) {
    point('Stop'); equal(stopped, 2, 'pointer stops'); press('Citation 2: Notes');
  } else if (frame === 15) {
    find('Citation 2: Notes', 'region'); hide();
  } else if (frame === 16) {
    equal(owners, 0, 'unmount cleanup'); show();
    equal(findIn(ui.rootNode(), 'Citation 2: Notes', 'region'), -1, 'open overlay cleaned on unmount');
  } else if (frame === 17) {
    equal(owners, 1); equal(draftRead(), ''); equal(attr(find('Reasoning'), 'aria-expanded'), 'true', 'fresh disclosure after remount');
    console.log('AI UI: ok'); ui.setAfterPaint(null);
  }
  frame++;
});
