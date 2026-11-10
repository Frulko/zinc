/** @jsxHelpers zinc:ui/kit/host */
import { ChatBubble, captionText } from 'zinc:ui/kit';
import { componentSignal } from 'zinc:ui/kit/host';
export function MessagesExample(): i32 {
  const [answer, setAnswer] = componentSignal('## A small first step\n\nMake a paper lamp with one LED.\n\n- [x] Choose a design\n- [ ] Check the circuit\n\nRead the [workshop guide](https://zinc.dev).');
  const [status, setStatus] = componentSignal('Links and task checkboxes call the application.');
  return <View className="flex-col gap-4 min-w-0">
    <ChatBubble mine={true} author="You" text="Can we build something small with paper and an LED?" time="09:41" />
    <ChatBubble mine={true} grouped={true} text="Keep the instructions short." time="09:42" delivery="Delivered" />
    <ChatBubble author="Workshop assistant" text={answer()} markdown={true} time="09:42"
      onLink={(href: string) => setStatus('Selected link: ' + href)}
      onTask={(source: string, offset: i32, checked: boolean) => { setAnswer(source); setStatus(checked ? 'Task completed' : 'Task reopened'); }} />
    <ChatBubble author="Workshop assistant" text="A retry callback can replace a failed reply." onRetry={() => setStatus('Retry requested for the local sample.')} />
    <Text role="status" className={captionText()}>{status()}</Text>
  </View>;
}
