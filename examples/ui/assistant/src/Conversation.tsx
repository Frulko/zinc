import { ChatBubble, Reasoning, ToolCall, AgentPlan, Sources, Citation, ChatComposer, PromptSuggestions, AiSource, AiSuggestion, captionText, heading, theme, CopyButton } from 'zinc:ui/kit';
import { createSignal } from 'zinc:ui/solid';
import { createConversation, Phase } from './state';
import { suggestions, sources } from './data';

export function Conversation(p: { chat: ReturnType<typeof createConversation> }): i32 {
  const [source, setSource] = createSignal(-1);
  const openSource = (item: AiSource): void => { setSource(sources.findIndex((entry: AiSource) => entry.url === item.url)); };
  return <View className="flex-1 min-w-0 min-h-0 flex-col">
    <ScrollView aria-label="Conversation" className="flex-1 min-h-0">
      <View className="flex-col gap-5 p-4 md:p-6 min-w-0 max-w-[850px] w-full mx-auto">
        <Show when={p.chat.phase() === Phase.Empty}>
          <Text className={heading(3)}>A small question, a visible process</Text>
          <Text className={captionText()}>Choose a topic. Any message plays that topic’s fixed answer.</Text>
          <PromptSuggestions items={suggestions} columns={1} onSelect={(item: AiSuggestion) => { p.chat.selectTopic(item.id); p.chat.newChat(); p.chat.setDraft(item.title); }} />
        </Show>
        <Show when={p.chat.question() !== ''}>
          <ChatBubble mine={true} author="You" text={p.chat.question()} />
          <Reasoning status={p.chat.stepStatus(0)} title="Scripted reasoning" seconds={0.6}>
            <Text className={`text-[13px] text-${theme().mutedForeground}`}>Separate the API’s state ownership from its rendering cost. For text, distinguish the visible glyph bounds from its advance.</Text>
          </Reasoning>
          <ToolCall name="read_local_reference_cards" detail="Scripted tool · no web request" status={p.chat.stepStatus(1)}
            input={'{"topic":"' + p.chat.topic() + '","cards":2}'} output={p.chat.phase() === Phase.Done ? '{"cards_read":2,"network_requests":0}' : undefined} />
          <AgentPlan title="Local answer plan" steps={p.chat.steps} />
          <Show when={p.chat.phase() === Phase.Stopped}>
            <ChatBubble author="Local assistant" text="The scripted answer was stopped." onRetry={p.chat.retry} />
          </Show>
          <Show when={p.chat.answer() !== ''}>
            <ChatBubble author="Local assistant" text={p.chat.answer()} onRetry={p.chat.retry} />
            <View className="flex-row flex-wrap gap-2">
              <Citation source={sources[0]} number={1} onOpen={openSource} />
              <Citation source={sources[1]} number={2} onOpen={openSource} />
            </View>
            <Sources items={sources} onOpen={openSource} label="Public reference cards" />
          </Show>
        </Show>
        <Show when={source() >= 0}>
          <View role="region" aria-label="Selected reference" className={`flex-col gap-2 p-4 rounded-[14px] border border-${theme().border}`}>
            <Text className={`text-[13px] text-${theme().foreground}`}>{sources[Math.max(0, source())].title}</Text>
            <Text className={captionText()}>{sources[Math.max(0, source())].snippet ?? ''}</Text>
            <Text className={captionText() + ' select-text break-all'}>{sources[Math.max(0, source())].url}</Text>
            <CopyButton text={() => sources[Math.max(0, source())].url} label="Copy source URL" />
          </View>
        </Show>
      </View>
    </ScrollView>
    <View className="flex-col gap-2 px-4 pb-4 md:px-6 min-w-0 max-w-[850px] w-full mx-auto">
      <ChatComposer value={p.chat.draft} onChange={p.chat.setDraft} onSend={p.chat.send} state={p.chat.composerState} onStop={p.chat.stop}
        maxLines={3} placeholder="Write a message for this local script" />
      <Text role="status" className={captionText()}>{p.chat.notice()}</Text>
    </View>
  </View>;
}
