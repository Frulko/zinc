import '../../../examples/kanban/src/main';
import * as assert from 'zinc:assert';
import * as ui from 'zinc:ui';
import * as sys from 'zinc:sys';
import { quit } from 'zinc:gfx';
import { tasks, detail, detailError, selectedId, openTask, closeTask, editing, editTitle, editDescription, saving, writeError } from '../../../examples/kanban/src/state';
import { stopBacklog } from '../../../examples/kanban/src/services/backlog';

function find(h: i32, value: string, label: boolean): i32 {
  const n = ui.inspectNode(h); if (n === null || n.hidden) return -1;
  if ((label ? n.label : n.text) === value) return h;
  for (const child of n.children) { const at = find(child, value, label); if (at >= 0) return at; }
  return -1;
}
function click(text: string): void {
  const h = find(ui.inspectRoot(), text, false); assert.ok(h >= 0, text + ' button');
  const b = ui.screenBox(h); ui.pointerAt(b[0] + b[2] / 2, b[1] + b[3] / 2, true); ui.pointerAt(b[0] + b[2] / 2, b[1] + b[3] / 2, false);
}
function type(label: string, text: string): void {
  const h = find(ui.inspectRoot(), label, true); assert.ok(h >= 0, label + ' field');
  ui.focusNode(h); ui.sendKey('a', 8); ui.typeText(h, text);
}
let step: i32 = 0, comments: number = 0;
const start = sys.clock();
function tick(): void {
  assert.ok(sys.clock() - start < 20000, 'editor session timeout at step ' + step + ' editing=' + editing() + ' saving=' + saving() + ' selected=' + selectedId() + ' detail=' + (detail()?.title ?? ''));
  assert.equal(writeError(), ''); assert.equal(detailError(), '');
  if (step === 0 && tasks().length > 0) { openTask('ZN-001'); step++; }
  else if (step === 1 && detail() !== null) { comments = detail()!.comments.length; click('Modifier'); step++; }
  else if (step === 2 && editing()) {
    const editor = find(ui.inspectRoot(), 'Description Markdown', true);
    assert.ok(editor >= 0, 'Markdown editor exists');
    assert.equal(ui.getValue(editor), '# Existing description\n\nOriginal **Markdown** content to edit.', 'existing content is already in the editor');
    assert.equal(ui.getValue(find(ui.inspectRoot(), 'Titre de la tâche', true)), detail()!.title);
    assert.equal(ui.focusedField(), editor, 'Modify puts keyboard focus directly in the Markdown editor');
    ui.insertText('Inserted without clicking a field. ');
    assert.ok(editDescription().includes('Inserted without clicking a field. '));
    type('Titre de la tâche', 'Title edited in the UI'); type('Description Markdown', '# UI heading\n\n**Strong** text and `code`.');
    assert.equal(editTitle(), 'Title edited in the UI'); closeTask(); openTask('ZN-001'); step++;
  } else if (step === 3 && editing() && detail() !== null) {
    assert.equal(editTitle(), 'Title edited in the UI'); assert.ok(editDescription().includes('**Strong**'));
    const editor = find(ui.inspectRoot(), 'Description Markdown', true);
    assert.equal(ui.getValue(editor), editDescription(), 'reopening restores the draft in the actual editor');
    assert.equal(ui.focusedField(), editor, 'reopening an unfinished edit focuses its editor');
    click('Enregistrer'); step++;
  } else if (step === 4 && !saving() && !editing() && detail() !== null && detail()!.title === 'Title edited in the UI') {
    assert.ok(detail()!.description.includes('**Strong**')); type('Nouveau commentaire', 'A **comment** from the real UI.'); click('Commenter'); step++;
  } else if (step === 5 && !saving() && detail() !== null && detail()!.comments.length === comments + 1) {
    assert.equal(detail()!.comments[comments].body, 'A **comment** from the real UI.');
    assert.ok(find(ui.inspectRoot(), 'UI heading', false) >= 0, 'Markdown heading is rendered');
    console.log('kanban editor: prefilled/focused editor, direct typing, restored draft/focus, saved title/Markdown, rendered heading and posted comment ok');
    ui.removeStepper(tick); stopBacklog(); quit();
  }
}
ui.addStepper(tick);
