import { createSignal } from 'zinc:ui/solid';
import { KanbanBoard, KanbanColumn, KanbanCard, KanbanMove, moveKanbanCard, theme } from 'zinc:ui/kit';
export function PlanningBoard(): i32 {
  const columns: KanbanColumn[] = [
    { id: 'ready', title: 'Ready', limit: 3 },
    { id: 'making', title: 'Making', limit: 2 },
    { id: 'shared', title: 'Shared' },
  ];
  const [cards, setCards] = createSignal<KanbanCard[]>([
    { id: 'card', column: 'ready', title: 'Draw the greeting card', detail: 'Sketch the paper circuit', tag: 'Design' },
    { id: 'led', column: 'ready', title: 'Choose an LED', detail: 'Bring one spare', tag: 'Parts' },
    { id: 'copper', column: 'making', title: 'Lay the copper tape', detail: 'Leave room for a switch', tag: 'Workshop' },
    { id: 'battery', column: 'making', title: 'Test the battery holder', tag: 'Workshop' },
    {
      id: 'photos',
      column: 'making',
      title: 'Photograph the steps',
      detail: 'A work-in-progress limit is a warning',
      tag: 'Documentation',
    },
    { id: 'safety', column: 'shared', title: 'Read the safety notes', detail: 'Pinned, cannot move', disabled: true },
  ]);
  const [message, setMessage] = createSignal('Open a card or move it between columns.');
  let nextId = 0;
  return (
    <View className="flex-col gap-3">
      <KanbanBoard
        label="Workshop board"
        columns={() => columns}
        cards={cards}
        height={350}
        onMove={(move: KanbanMove) => {
          setCards(moveKanbanCard(columns, cards(), move));
          setMessage('Moved to ' + move.toColumn + ', slot ' + (move.toIndex + 1));
        }}
        onCardClick={(id: string) => setMessage('Opened ' + id)}
        onAdd={(column: string) => {
          nextId++;
          setCards([...cards(), { id: 'new-' + nextId, column, title: 'New workshop task', tag: 'Draft' }]);
          setMessage('Added a task to ' + column);
        }}
      />
      <Text role="status" className={`text-[12px] text-${theme().mutedForeground}`}>
        {message()}
      </Text>
    </View>
  );
}
