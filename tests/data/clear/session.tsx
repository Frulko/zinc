import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { equal, ok } from 'zinc:assert';
import { ClearApp } from '../../../examples/clear/src/pages/ClearApp';
import { rowNode } from '../../../examples/clear/src/components/ClearRow';
import { initialize, currentDocument, visibleTasks, activeList, selectedId, selectEntry, screen,
  editingId, draft, errorMessage, showLists, openList } from '../../../examples/clear/src/state';
import { installKeyboard } from '../../../examples/clear/src/keyboard';
import { loadDocument } from '../../../examples/clear/src/services/document';

initialize();
installKeyboard();
let frame: i32 = 0;
let movedId = '';
let createdList = '';
function center(id: string): number[] {
  const node = rowNode(id);
  ok(node >= 0, 'row is mounted: ' + id);
  const box = ui.screenBox(node);
  return [box[0] + box[2] / 2, box[1] + box[3] / 2];
}
function click(id: string, button: i32 = 0): void {
  const point = center(id);
  ui.pointerAt(point[0], point[1], true, button);
  ui.pointerAt(point[0], point[1], false, button);
}
function swipe(id: string, dx: number): void {
  const point = center(id);
  ui.pointerAt(point[0], point[1], true);
  ui.pointerAt(point[0] + dx / 3, point[1], true);
  ui.pointerAt(point[0] + dx, point[1], true);
  ui.pointerAt(point[0] + dx, point[1], false);
}
function tap(x: number, y: number): void {
  ui.pointerAt(x, y, true);
  ui.pointerAt(x, y, false);
}
render(ClearApp, 0x161616, (dt: number) => {
  frame++;
  if (frame === 2) { ui.pointerAt(0, 0, false); ui.insertText('H'); }
  if (frame === 3) ui.insertText('e');
  if (frame === 4) ui.insertText('llo');
  if (frame === 5) {
    ui.sendKey('Enter');
    equal(visibleTasks()[9].title, 'Hello', 'type anywhere keeps the first character');
  }
  if (frame === 8) { selectEntry('intro-0'); ui.sendKey(' '); }
  if (frame === 9) {
    ok(visibleTasks()[visibleTasks().length - 1].completed, 'Space completes through native capture input');
    ui.sendKey('z', ui.META);
  }
  if (frame === 12) { swipe('intro-0', 150); ok(visibleTasks()[9].completed, 'right swipe completes'); }
  if (frame === 14) { swipe('intro-1', -150); equal(visibleTasks().length, 9, 'left swipe deletes'); }
  if (frame === 16) { ui.sendKey('z', ui.META); equal(visibleTasks().length, 10, 'undo restores deleted task'); }
  if (frame === 20) click('intro-1');
  if (frame === 21) ui.insertText('Edited task');
  if (frame === 22) { ui.sendKey('Enter'); equal(visibleTasks()[0].title, 'Edited task', 'edit selects old title'); }
  if (frame === 25) ui.insertText('W');
  if (frame === 26) ui.insertText('orld');
  if (frame === 27) {
    ui.sendKey('Enter');
    ok(visibleTasks().some((task) => task.title === 'World'), 'quick entry starts with an empty capture');
  }
  if (frame === 30) {
    movedId = visibleTasks()[0].id;
    const point = center(movedId);
    ui.pointerAt(point[0], point[1], true);
    ui.tick(550);
    ui.pointerAt(point[0], point[1] + 25, true);
    ui.pointerAt(point[0], point[1] + 104, true);
    ui.pointerAt(point[0], point[1] + 104, false);
    equal(visibleTasks()[2].id, movedId, 'long-press drag reorders');
  }
  if (frame === 35) { selectEntry(movedId); ui.sendKey('ArrowUp', ui.ALT); equal(visibleTasks()[1].id, movedId, 'keyboard reorder'); }
  if (frame === 40) { tap(210, 22); equal(screen(), 'lists', 'header opens list overview'); }
  if (frame === 42) click('groceries');
  if (frame === 43) equal(activeList()!.id, 'groceries', 'list opens');
  if (frame === 46) ui.wheelAt(210, 450, -5);
  if (frame === 50) tap(390, 22);
  if (frame === 52) tap(210, 44 + 3 * 52 + 26);
  if (frame === 53) equal(activeList()!.theme, 'lime', 'theme picker changes list palette');
  if (frame === 65) {
    ui.touchAt(1, 120, 180, 0);
    ui.touchAt(2, 280, 180, 0);
    ui.touchAt(1, 160, 180, 1);
    ui.touchAt(2, 240, 180, 1);
    ui.touchAt(2, 240, 180, 2);
    ui.touchAt(1, 160, 180, 2);
  }
  if (frame === 70) { equal(screen(), 'lists', 'pinch closes list'); ui.sendKey('n', ui.META); }
  if (frame === 72) ui.insertText('Weekend');
  if (frame === 73) {
    ui.sendKey('Enter');
    equal(currentDocument().lists.length, 7, 'new list persisted');
    createdList = currentDocument().lists[6].id;
  }
  if (frame === 80) click(createdList);
  if (frame === 84) {
    ui.pointerAt(210, 130, true);
    ui.pointerAt(210, 170, true);
    ui.pointerAt(210, 245, true);
    ui.pointerAt(210, 245, false);
    equal(editingId(), 'new', 'pull down creates on an empty list');
  }
  if (frame === 86) ui.insertText('Pull-created');
  if (frame === 88) { ui.sendKey('Enter'); equal(visibleTasks()[0].title, 'Pull-created'); }
  if (frame === 92) click(visibleTasks()[0].id, 2);
  if (frame === 95) {
    ui.pointerAt(210, 380, true);
    ui.pointerAt(210, 340, true);
    ui.pointerAt(210, 240, true);
    ui.pointerAt(210, 240, false);
  }
  if (frame === 100) {
    equal(visibleTasks().length, 0, 'pull up clears completed');
    ui.sendKey('z', ui.META);
  }
  if (frame === 103) {
    equal(visibleTasks().length, 1, 'undo restores cleared task');
    equal(JSON.stringify(loadDocument()), JSON.stringify(currentDocument()), 'saved document survives a fresh read');

  }
  if (frame === 108) openList('groceries');
  if (frame === 110) {
    ui.touchAt(3, 210, 180, 0);
    ui.touchAt(4, 210, 220, 0);
    ui.touchAt(3, 210, 130, 1);
    ui.touchAt(4, 210, 270, 1);
    ui.touchAt(4, 210, 270, 2);
    ui.touchAt(3, 210, 130, 2);
    equal(editingId(), 'new', 'pinch apart inserts a row');
  }
  if (frame === 112) ui.insertText('Inserted by pinch');
  if (frame === 114) {
    ui.sendKey('Enter');
    ok(visibleTasks().some((task) => task.title === 'Inserted by pinch'), 'pinch-created title saved');
  }
  if (frame === 116) ui.sendKey('z', ui.META);
  if (frame === 120) ui.pointerAt(210, 100, true);
  if (frame === 121) ui.pointerAt(210, 200, true);
  if (frame === 122) ui.pointerAt(210, 330, true);
  if (frame === 123) ui.pointerAt(210, 330, false);
  if (frame === 124) equal(editingId(), 'new', 'overscroll creates at the top of a long list');
  if (frame === 125) ui.insertText('Pulled at top');
  if (frame === 127) {
    ui.sendKey('Enter');
    equal(visibleTasks()[0].title, 'Pulled at top');
  }
  if (frame === 129) ui.sendKey('z', ui.META);
  if (frame === 132) openList(createdList);
  if (frame === 135) {
    equal(JSON.stringify(loadDocument()), JSON.stringify(currentDocument()));

  }

  if (frame === 138) ui.sendKey('n', ui.META);
  if (frame === 139) ui.insertText('Keep this draft');
  if (frame === 140) {
    const original = sys.env('ZINC_STORAGE');
    const directory = fs.mkdtemp(fs.tmpdir() + '/clear-save-error-');
    try {
      fs.chmod(directory, 0o500);
      sys.setEnv('ZINC_STORAGE', directory + '/store.kv');
      ui.sendKey('Enter');
      equal(editingId(), 'new', 'failed save keeps the editor open');
      equal(draft(), 'Keep this draft', 'failed save keeps typed text');
      ok(errorMessage().indexOf('Could not save') >= 0, 'save error is visible');
    } finally {
      fs.chmod(directory, 0o700);
      fs.remove(directory, true);
      sys.setEnv('ZINC_STORAGE', original);
    }
  }
  if (frame === 142) {
    ui.sendKey('Enter');
    ok(visibleTasks().some((task) => task.title === 'Keep this draft'), 'retry saves retained draft');
    ui.sendKey('z', ui.META);
  }
  if (frame === 145) {
    equal(JSON.stringify(loadDocument()), JSON.stringify(currentDocument()));
    console.log('clear session: pass');
  }

});
