import { Sidebar, Button, theme, heading, captionText } from 'zinc:ui/kit';
export function ChatSidebar(p: { topic: () => string; onSelect: (id: string) => void; onNew: () => void }): i32 {
  return <View className={`flex-col gap-6 p-4 h-full bg-${theme().muted}`}>
    <Text className={heading(4)}>Fieldnotes</Text>
    <Button label="New chat" variant="outline" onClick={p.onNew} />
    <Sidebar label="Prepared conversations" groups={[{ id: 'local', label: 'Local examples', items: [
      { id: 'interfaces', label: 'Interfaces that feel fast' }, { id: 'text', label: 'How text fits a line' },
    ] }]} selected={p.topic} onSelect={p.onSelect} className="w-full" />
    <View className="grow" />
    <Text className={captionText()}>Two prepared conversations. Changes last only until this window closes.</Text>
  </View>;
}
