import * as assert from 'zinc:assert';
import * as ui from 'zinc:ui';
import * as dnd from 'zinc:ui/dnd';
import { render } from 'zinc:ui/solid';
import { quit } from 'zinc:gfx';
import { Board, DragPreview, watchDrags, columnScroller, previewBox } from '../../../examples/kanban/src/pages/board/Board';
import { cardNode } from '../../../examples/kanban/src/components/TaskCard';
import { Task } from '../../../examples/kanban/src/models';
import { acceptSnapshot, draggedId } from '../../../examples/kanban/src/state';
import { CARD_HEIGHT } from '../../../examples/kanban/src/constants';

const items: Task[] = [];
for (let i = 0; i < 200; i++) { const t = new Task(); t.id = 'ZN-' + (1000 + i); t.title = 'Virtual task ' + i; items.push(t); }
acceptSnapshot(items); watchDrags();
let frame: i32 = 0, gripX: number = 0, gripY: number = 0;
function visible(id: string): void {
  const h = cardNode(id); assert.ok(h >= 0, id + ' mounted');
  const b = ui.screenBox(h), viewport = ui.screenBox(columnScroller('Backlog'));
  assert.ok(b[1] + b[3] > viewport[1] && b[1] < viewport[1] + viewport[3], id + ' really inside the viewport');
  assert.ok(ui.domRows(columnScroller('Backlog')).length < 20, 'rows remain virtualized');
}
render(() => <View className="w-full h-full flex-col"><Board /><DragPreview /></View>, 0xf7f8fa, (dt: number) => {
  frame++;
  const scroller = columnScroller('Backlog');
  if (frame === 3) { visible('ZN-1000'); ui.scrollTo(scroller, 0, CARD_HEIGHT * 40); }
  if (frame === 6) { visible('ZN-1040'); assert.equal(cardNode('ZN-1000'), -1); ui.scrollTo(scroller, 0, 1e9); }
  if (frame === 9) { visible('ZN-1199'); ui.scrollTo(scroller, 0, 0); }
  if (frame === 12) {
    visible('ZN-1000'); const b = ui.screenBox(cardNode('ZN-1000')); gripX = 73; gripY = 42;
    ui.pointerAt(b[0] + gripX, b[1] + gripY, true);
  }
  if (frame === 13) { const b = ui.screenBox(cardNode('ZN-1000')); ui.pointerAt(b[0] + gripX + 8, b[1] + gripY, true); }
  if (frame === 14 || frame === 15) {
    const drag = dnd.currentDrag(); assert.ok(drag !== null); const before = previewBox();
    const x = before[0] + gripX + 35, y = before[1] + gripY + 22;
    ui.pointerAt(x, y, true);
    const b = previewBox(); assert.equal(x - b[0], gripX); assert.equal(y - b[1], gripY);
    assert.equal(draggedId(), 'ZN-1000');
  }
  if (frame === 16) ui.pointerAt(400, 300, false);
  if (frame === 18) { console.log('kanban geometry: deep scroll, bottom, return, bounded rows and exact drag grip ok'); quit(); }
});
