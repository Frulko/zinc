/** @jsxHelpers zinc:ui/kit/host */
// Assistant presentation composes the existing kit; callers own content, requests and navigation.
import * as ui from 'zinc:ui';
import { createNodeRef } from 'zinc:ui/solid';
import { componentSignal, componentRef, renderSlot } from './host';
import { theme } from './theme';
import { Button as KitButton } from './button';
import { Textarea, Select, SelectOption } from './input';
import { HoverCard } from './overlays';
import { Spinner, Progress, ProgressRing, Avatar } from './feedback';
import { CopyButton } from './actions';
import { CodeBlock, JsonViewer, MarkdownView } from './code';
import { AiStatus, DisclosureMode, disclosureOpen, toggleDisclosure, aiStatusLabel, contextPercent, contextTone, sourceHost } from './ai-model';
export { AiStatus, DisclosureMode, contextPercent, contextTone } from './ai-model';

function focusClass(): string {
  return 'focus-visible:ring-2 focus-visible:ring-' + theme().accent + ' focus-visible:ring-offset-2';
}
function captionClass(): string { return 'text-[12px] text-' + theme().mutedForeground; }
function bodyClass(): string { return 'text-[13px] text-' + theme().foreground; }
function statusColor(status: AiStatus): string {
  return status === AiStatus.Failed ? theme().destructive : status === AiStatus.Done ? theme().success : theme().mutedForeground;
}
function secondsLabel(seconds: number): string {
  return Number.isFinite(seconds) && seconds > 0 ? String(Math.round(seconds * 10) / 10) + 's' : '';
}
function StatusMark(p: { status: AiStatus }): i32 {
  return <View role="status" aria-label={aiStatusLabel(p.status)} className="flex-row items-center gap-2">
    <Show when={p.status === AiStatus.Running}><Spinner size={14} label="Running" /></Show>
    <Show when={p.status !== AiStatus.Running}>
      <Text className={'text-[13px] text-' + statusColor(p.status)}>{p.status === AiStatus.Done ? '✓' : p.status === AiStatus.Failed ? '×' : p.status === AiStatus.Skipped ? '−' : '○'}</Text>
    </Show>
  </View>;
}
interface DisclosureProps {
  title: () => string;
  automatic: () => boolean;
  status: AiStatus;
  detail?: string;
  seconds?: number;
  className?: string;
  children: () => i32;
}
function Disclosure(p: DisclosureProps): i32 {
  const [mode, setMode] = componentSignal(DisclosureMode.Automatic);
  const body = createNodeRef(), header = createNodeRef();
  const open = (): boolean => disclosureOpen(mode(), p.automatic());
  const transition = (): void => {
    if (!ui.prefersReducedMotion()) ui.LayoutAnimation.spring();
    setMode(toggleDisclosure(mode(), p.automatic()));
  };
  const node = <View className={'flex-col gap-1 min-w-0 ' + (p.className ?? '')}>
    <Button ref={header} className={'flex-row items-center gap-2 px-2 py-1 rounded-[10px] justify-start w-full text-left ' + focusClass()}
      aria-label={p.title()} aria-expanded={String(open())} onClick={transition}>
      <Text className={captionClass()}>{open() ? '▾' : '▸'}</Text>
      <StatusMark status={p.status} />
      <Text className={bodyClass()}>{p.title()}</Text>
      <Show when={(p.detail ?? '') !== ''}><Text className={captionClass() + ' shrink min-w-0'}>{p.detail ?? ''}</Text></Show>
      <Show when={secondsLabel(p.seconds ?? 0) !== ''}><Text className={captionClass() + ' tabular-nums'}>{secondsLabel(p.seconds ?? 0)}</Text></Show>
    </Button>
    <View ref={body} role="region" aria-label={p.title() + ' details'} hidden={open() ? 0 : 1}
      className={'flex-col gap-3 ml-4 pl-4 py-2 border-l border-' + theme().border}>
      <Show when={open()}>{renderSlot(p.children)}</Show>
    </View>
  </View>;
  const id = 'ai-details-' + String(body.node);
  ui.setAttr(body.node, 'id', id);
  ui.setAttr(header.node, 'aria-controls', id);
  return node;
}

export interface ReasoningProps {
  status: AiStatus;
  seconds?: number;
  title?: string;
  className?: string;
  children: () => i32;
}
export function Reasoning(p: ReasoningProps): i32 {
  const title = (): string => p.title ?? (p.status === AiStatus.Running ? 'Thinking' : p.status === AiStatus.Failed ? 'Reasoning failed' : 'Thought');
  return <Disclosure title={title} status={p.status} automatic={() => p.status === AiStatus.Running} seconds={p.seconds} className={p.className}>
    {renderSlot(p.children)}
  </Disclosure>;
}

export interface ToolCallProps {
  name: string;
  status: AiStatus;
  detail?: string;
  input?: string;
  output?: string;
  seconds?: number;
  className?: string;
}
function ToolPayload(p: { label: string; value: string }): i32 {
  const cache = componentRef<{ value: string; json: boolean } | null>(null);
  const json = (): boolean => {
    const previous = cache.current;
    if (previous !== null && previous.value === p.value) return previous.json;
    let valid = false;
    try { JSON.parse(p.value); valid = true; }
    catch (error) { valid = false; }
    cache.current = { value: p.value, json: valid }; return valid;
  };
  return <View className="flex-col gap-2 min-w-0">
    <Text className={captionClass()}>{p.label}</Text>
    <Show when={json()} fallback={<CodeBlock code={p.value} title={p.label} height={160} />}>
      <JsonViewer source={p.value} label={p.label} height={160} />
    </Show>
  </View>;
}
export function ToolCall(p: ToolCallProps): i32 {
  return <Disclosure title={() => p.name} status={p.status} detail={p.detail} seconds={p.seconds} automatic={() => false} className={p.className}>
    <View className="flex-col gap-3 min-w-0">
      <Show when={p.input !== undefined}><ToolPayload label="Input" value={p.input ?? ''} /></Show>
      <Show when={p.output !== undefined}><ToolPayload label="Output" value={p.output ?? ''} /></Show>
      <Show when={p.input === undefined && p.output === undefined}><Text className={captionClass()}>No input or output recorded.</Text></Show>
    </View>
  </Disclosure>;
}

export interface AiPlanStep { id: string; title: string; detail?: string; status: AiStatus }
export interface AgentPlanProps {
  steps: () => AiPlanStep[];
  title?: string;
  onSelect?: (step: AiPlanStep) => void;
  className?: string;
}
export function AgentPlan(p: AgentPlanProps): i32 {
  const completed = (): number => p.steps().filter((step: AiPlanStep) => step.status === AiStatus.Done).length;
  const progress = (): number => p.steps().length > 0 ? completed() * 100 / p.steps().length : 0;
  return <View role="group" aria-label={p.title ?? 'Agent plan'} className={'flex-col gap-3 min-w-0 ' + (p.className ?? '')}>
    <View className="flex-row items-center justify-between gap-3">
      <Text className={bodyClass()}>{p.title ?? 'Agent plan'}</Text>
      <Text role="status" className={captionClass() + ' tabular-nums'}>{String(completed()) + ' of ' + String(p.steps().length)}</Text>
    </View>
    <Progress value={progress} label="Completed steps" />
    <Show when={p.steps().length === 0}><Text className={captionClass()}>No steps.</Text></Show>
    {p.steps().map((step: AiPlanStep) => <View key={step.id} className={'flex-row items-start gap-3 py-1 pl-3 border-l border-' + theme().border}>
      <StatusMark status={step.status} />
      <View className="flex-col gap-1 grow min-w-0">
        <Show when={p.onSelect !== undefined} fallback={<Text className={bodyClass()}>{step.title}</Text>}>
          <KitButton label={step.title} variant="ghost" size="sm" onClick={() => { if (p.onSelect !== undefined) p.onSelect(step); }} className="justify-start" />
        </Show>
        <Show when={(step.detail ?? '') !== ''}><Text className={captionClass()}>{step.detail ?? ''}</Text></Show>
      </View>
    </View>)}
  </View>;
}

export interface AiSource { title: string; url: string; snippet?: string }
export interface SourcesProps {
  items: AiSource[];
  onOpen: (source: AiSource) => void;
  label?: string;
  className?: string;
}
function SourceCard(p: { source: AiSource; number: number; onOpen: (source: AiSource) => void }): i32 {
  return <View className="flex-col gap-2 min-w-0">
    <Text className={captionClass()}>{String(p.number) + ' · ' + sourceHost(p.source.url)}</Text>
    <Text className={bodyClass()}>{p.source.title}</Text>
    <Show when={(p.source.snippet ?? '') !== ''}><Text className={captionClass()}>{p.source.snippet ?? ''}</Text></Show>
    <KitButton label="Open source" size="sm" variant="outline" ariaLabel={'Open source ' + String(p.number) + ': ' + p.source.title} onClick={() => p.onOpen(p.source)} />
  </View>;
}
export function Sources(p: SourcesProps): i32 {
  return <View role="group" aria-label={p.label ?? 'Sources'} className={'flex-col gap-2 min-w-0 ' + (p.className ?? '')}>
    <Text className={captionClass()}>{p.label ?? 'Sources'}</Text>
    <Show when={p.items.length === 0}><Text className={captionClass()}>No sources.</Text></Show>
    <Show when={p.items.length > 0}><ScrollView className="w-full overflow-x-auto" style={{ height: 176 }}>
      <View className="flex-row gap-3 items-start">
        {p.items.map((source: AiSource, index: i32) => <View className={'flex-col gap-2 p-3 w-[240px] rounded-[14px] border border-' + theme().border + ' bg-' + theme().card}>
          <SourceCard source={source} number={index + 1} onOpen={p.onOpen} />
        </View>)}
      </View>
    </ScrollView></Show>
  </View>;
}
export interface CitationProps { source: AiSource; number: number; onOpen: (source: AiSource) => void }
export function Citation(p: CitationProps): i32 {
  return <HoverCard label={'Citation ' + String(p.number) + ': ' + p.source.title} width={280}
    trigger={() => <Text className={captionClass() + ' px-2 py-1 rounded-full bg-' + theme().muted}>{String(p.number) + ' · ' + sourceHost(p.source.url)}</Text>}>
    <SourceCard source={p.source} number={p.number} onOpen={p.onOpen} />
  </HoverCard>;
}

export interface ContextPart { label: string; value: number }
export interface ContextMeterProps {
  used: () => number;
  limit: number;
  parts?: () => ContextPart[];
  unit?: string;
  label?: string;
}
export function ContextMeter(p: ContextMeterProps): i32 {
  const percent = (): number => contextPercent(p.used(), p.limit);
  const color = (): i32 => ui.tailwindColor(contextTone(p.used(), p.limit) === 'danger' ? theme().destructive : contextTone(p.used(), p.limit) === 'warning' ? theme().warningSoftForeground : theme().primary);
  const label = (): string => (p.label ?? 'Context') + ': ' + String(Math.round(percent())) + '%';
  return <HoverCard label={label()} width={260} trigger={() => <View className="flex-row items-center gap-2">
    <ProgressRing value={percent} size={26} strokeWidth={3} color={color} label={label()} showValue={false} />
    <Text className={captionClass() + ' tabular-nums'}>{String(Math.round(percent())) + '%'}</Text>
  </View>}>
    <View className="flex-col gap-2">
      <Text className={bodyClass()}>{p.label ?? 'Context'}</Text>
      <Text className={captionClass() + ' tabular-nums'}>{String(Math.max(0, Math.round(Number.isFinite(p.used()) ? p.used() : 0))) + ' / ' + String(Math.max(0, Math.round(Number.isFinite(p.limit) ? p.limit : 0))) + ' ' + (p.unit ?? 'tokens')}</Text>
      <Show when={p.parts !== undefined}>{(p.parts !== undefined ? p.parts() : []).map((part: ContextPart) => <View className="flex-row justify-between gap-3">
        <Text className={captionClass()}>{part.label}</Text><Text className={captionClass() + ' tabular-nums'}>{String(Math.max(0, Math.round(part.value)))}</Text>
      </View>)}</Show>
    </View>
  </HoverCard>;
}

export interface AiSuggestion { id: string; title: string; detail?: string; disabled?: boolean }
export interface PromptSuggestionsProps {
  items: AiSuggestion[];
  onSelect: (suggestion: AiSuggestion) => void;
  columns?: number;
  label?: string;
  className?: string;
}
export function PromptSuggestions(p: PromptSuggestionsProps): i32 {
  const rows = (): AiSuggestion[][] => {
    const count = Math.max(1, Math.floor(p.columns !== undefined && Number.isFinite(p.columns) ? p.columns : 2));
    const result: AiSuggestion[][] = [];
    for (let i = 0; i < p.items.length; i += count) result.push(p.items.slice(i, i + count));
    return result;
  };
  return <View role="group" aria-label={p.label ?? 'Prompt suggestions'} className={'flex-col gap-2 min-w-0 ' + (p.className ?? '')}>
    {rows().map((row: AiSuggestion[]) => <View className="flex-row flex-wrap gap-2">
      {row.map((item: AiSuggestion) => <Button key={item.id} disabled={item.disabled === true} aria-label={item.title}
        className={'flex-col items-start gap-1 p-3 min-w-[180px] grow shrink rounded-[14px] border border-' + theme().border + ' bg-' + theme().card + ' ' + focusClass() + (item.disabled === true ? ' opacity-45' : '')}
        onClick={() => { if (item.disabled !== true) p.onSelect(item); }}>
        <Text className={bodyClass()}>{item.title}</Text>
        <Show when={(item.detail ?? '') !== ''}><Text className={captionClass()}>{item.detail ?? ''}</Text></Show>
      </Button>)}
    </View>)}
  </View>;
}

export interface AiModel { id: string; name: string; detail?: string; badge?: string; disabled?: boolean }
export interface ModelPickerProps {
  items: AiModel[];
  value: () => string;
  onChange: (id: string) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}
export function ModelPicker(p: ModelPickerProps): i32 {
  const choices = (): SelectOption[] => p.items.map((model: AiModel): SelectOption => ({
    value: model.id, label: model.name + ((model.badge ?? '') !== '' ? ' · ' + (model.badge ?? '') : '') + ((model.detail ?? '') !== '' ? ' — ' + (model.detail ?? '') : ''), disabled: model.disabled,
  }));
  return <Select items={choices()} value={p.value} onChange={p.onChange} label={p.label ?? 'Model'} disabled={p.disabled} className={p.className ?? 'w-full'} />;
}

export enum ComposerState { Ready, Busy, Disabled }
export interface AiAttachment { id: string; name: string }
export interface ChatComposerProps {
  value: () => string;
  onChange: (draft: string) => void;
  onSend: (draft: string) => void;
  state?: () => ComposerState;
  onStop?: () => void;
  placeholder?: string;
  label?: string;
  maxLines?: number;
  attachments?: AiAttachment[];
  onAttach?: () => void;
  onRemoveAttachment?: (id: string) => void;
  model?: ModelPickerProps;
  className?: string;
}
export function ChatComposer(p: ChatComposerProps): i32 {
  const state = (): ComposerState => p.state !== undefined ? p.state() : ComposerState.Ready;
  const send = (): void => {
    if (state() !== ComposerState.Ready || p.value().trim() === '') return;
    p.onSend(p.value());
  };
  const key = (event: ui.KeyEvent): void => {
    if (event.key !== 'Enter' || event.shift || ui.composingRange()[0] >= 0) return;
    event.preventDefault();
    send();
  };
  const model = (): i32 => {
    const choice = p.model;
    return choice === undefined ? <View /> : <ModelPicker items={choice.items} value={choice.value} onChange={choice.onChange} label={choice.label} disabled={state() === ComposerState.Disabled || choice.disabled === true} className={choice.className} />;
  };
  return <View role="group" aria-label={p.label ?? 'Chat composer'} className={'flex-col gap-2 p-3 rounded-[18px] min-w-0 border border-' + theme().input + ' bg-' + theme().card + ' ' + (p.className ?? '')}>
    <Show when={(p.attachments ?? []).length > 0}><View className="flex-row flex-wrap gap-2">
      {(p.attachments ?? []).map((file: AiAttachment) => <View key={file.id} className={'flex-row items-center gap-1 px-2 py-1 rounded-[10px] bg-' + theme().muted}>
        <Text className={captionClass()}>{file.name}</Text>
        <Show when={p.onRemoveAttachment !== undefined}><KitButton label="×" ariaLabel={'Remove ' + file.name} variant="ghost" size="sm" disabled={state() === ComposerState.Disabled} onClick={() => { if (p.onRemoveAttachment !== undefined) p.onRemoveAttachment(file.id); }} /></Show>
      </View>)}
    </View></Show>
    <Textarea value={p.value} onInput={p.onChange} onKeyDown={key} rows={0} maxRows={p.maxLines ?? 8}
      label={p.label ?? 'Message'} placeholder={p.placeholder ?? 'Ask anything'} disabled={state() === ComposerState.Disabled} />
    <View className="flex-row flex-wrap items-end gap-2">
      <Show when={p.onAttach !== undefined}><KitButton label="Attach files" size="sm" variant="outline" disabled={state() === ComposerState.Disabled} onClick={() => { if (p.onAttach !== undefined) p.onAttach(); }} /></Show>
      <Show when={p.model !== undefined}><View className="grow min-w-[180px]">{renderSlot(model)}</View></Show>
      <View className="grow" />
      <Show when={state() === ComposerState.Busy} fallback={<KitButton label="Send" size="sm" disabled={state() === ComposerState.Disabled || p.value().trim() === ''} onClick={send} />}>
        <KitButton label="Stop" size="sm" disabled={p.onStop === undefined} onClick={() => { if (p.onStop !== undefined) p.onStop(); }} />
      </Show>
    </View>
  </View>;
}

export interface ChatBubbleProps {
  text: string;
  mine?: boolean;
  author?: string;
  time?: string;
  delivery?: string;
  grouped?: boolean;
  lastInGroup?: boolean;
  avatar?: i32;
  markdown?: boolean;
  onLink?: (href: string) => void;
  onTask?: (source: string, offset: i32, checked: boolean) => void;
  onRetry?: () => void;
  className?: string;
}
export function ChatBubble(p: ChatBubbleProps): i32 {
  return <View role="article" aria-label={p.author ?? (p.mine === true ? 'You' : 'Assistant')}
    className={'flex-col gap-1 min-w-0 ' + (p.mine === true ? 'items-end ' : 'items-start ') + (p.className ?? '')}>
    <Show when={p.grouped !== true && (p.author ?? '') !== ''}><Text className={captionClass()}>{p.author ?? ''}</Text></Show>
    <View className="flex-row items-end gap-2 w-full">
      <Show when={p.mine !== true && p.lastInGroup !== false}><Avatar name={p.author ?? 'Assistant'} image={p.avatar} size="sm" /></Show>
      <View className={p.mine === true ? 'grow' : ''} />
      <View className={'flex-col gap-2 max-w-[680px] min-w-0 shrink p-3 rounded-[14px] ' + (p.mine === true ? 'bg-' + theme().accentSoft : 'bg-' + theme().muted)}>
        <Show when={p.markdown === true} fallback={<Text className={bodyClass() + ' select-text'}>{p.text}</Text>}>
          <MarkdownView source={p.text} compact={true} onLink={p.onLink} onTask={p.onTask} />
        </Show>
      </View>
    </View>
    <View className="flex-row flex-wrap items-center gap-2">
      <Show when={(p.time ?? '') !== ''}><Text className={captionClass() + ' tabular-nums'}>{p.time ?? ''}</Text></Show>
      <Show when={p.mine === true && p.lastInGroup !== false && (p.delivery ?? '') !== ''}><Text role="status" className={captionClass()}>{p.delivery ?? ''}</Text></Show>
      <CopyButton text={() => p.text} label="Copy message" />
      <Show when={p.onRetry !== undefined}><KitButton label="Retry" size="sm" variant="ghost" onClick={() => { if (p.onRetry !== undefined) p.onRetry(); }} /></Show>
    </View>
  </View>;
}
