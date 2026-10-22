import '../../../examples/kanban/src/main';
import * as assert from 'zinc:assert';
import * as ui from 'zinc:ui';
import * as sys from 'zinc:sys';
import { quit } from 'zinc:gfx';
import { tasks, detail, detailError, selectedId, openTask, closeTask, editing, editDraft, saving, writeError } from '../../../examples/kanban/src/state';
import { stopBacklog } from '../../../examples/kanban/src/services/backlog';

function find(h: i32, value: string, label: boolean): i32 {
  const n = ui.inspectNode(h); if (n === null || n.hidden) return -1;
  if ((label ? n.label : n.text) === value) return h;
  for (const child of n.children) { const at = find(child, value, label); if (at >= 0) return at; }
  return -1;
}
function click(text: string, label: boolean = false): void {
  const h = find(ui.inspectRoot(), text, label); assert.ok(h >= 0, text + ' button');
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
    assert.equal(detail()!.description, '', 'reproduce the screenshot: description is absent');
    assert.equal(editDraft().description, '');
    for (const label of ['Description Markdown', 'Critère 1', 'Critère 2', 'Critère 3', 'Plan Markdown', 'Notes Markdown', 'Résultat Markdown']) assert.ok(find(ui.inspectRoot(), label, true) >= 0, label + ' editor exists');
    const editor = find(ui.inspectRoot(), 'Critère 1', true);
    assert.equal(ui.getValue(editor), 'First original criterion', 'visible criterion is already in its editor');
    assert.equal(ui.getValue(find(ui.inspectRoot(), 'Notes Markdown', true)), 'Original implementation notes, with **Markdown**.');
    assert.equal(ui.getValue(find(ui.inspectRoot(), 'Plan Markdown', true)), 'Original implementation plan.');
    assert.equal(ui.getValue(find(ui.inspectRoot(), 'Résultat Markdown', true)), 'Original result.');
    assert.equal(ui.getValue(find(ui.inspectRoot(), 'Titre de la tâche', true)), detail()!.title);
    assert.equal(ui.focusedField(), editor, 'empty description focuses the first populated editable section');
    ui.insertText('Direct typing. '); assert.ok(editDraft().criteria[0].text.includes('Direct typing. '));
    assert.equal(ui.focusedField(), editor, 'criterion edits keep the mounted field and caret');
    ui.insertText('Continued typing. '); assert.ok(editDraft().criteria[0].text.includes('Continued typing. '));
    type('Critère 1', 'Updated first criterion'); click('Cocher le critère 2', true);
    click('Supprimer le critère 3', true); click('Ajouter un critère'); type('Critère 3', 'Added in the UI');
    type('Titre de la tâche', 'Title edited in the UI'); type('Description Markdown', '# UI heading\n\n**Strong** text and `code`.');
    type('Plan Markdown', 'Updated **plan**.'); type('Notes Markdown', 'Updated **notes**.'); type('Résultat Markdown', 'Updated **result**.');
    assert.equal(editDraft().title, 'Title edited in the UI'); closeTask(); openTask('ZN-001'); step++;
  } else if (step === 3 && editing() && detail() !== null) {
    assert.equal(editDraft().title, 'Title edited in the UI'); assert.ok(editDraft().description.includes('**Strong**'));
    assert.equal(detail()!.criteria[0].text, 'First original criterion', 'editing never mutates the source before Save');
    assert.equal(editDraft().notes, 'Updated **notes**.'); assert.equal(detail()!.notes, 'Original implementation notes, with **Markdown**.');
    const editor = find(ui.inspectRoot(), 'Description Markdown', true);
    assert.equal(ui.getValue(editor), editDraft().description, 'reopening restores the draft in the actual editor');
    assert.equal(ui.focusedField(), editor, 'reopening an unfinished edit focuses its editor');
    click('Enregistrer'); step++;
  } else if (step === 4 && !saving() && !editing() && detail() !== null && detail()!.title === 'Title edited in the UI') {
    assert.ok(detail()!.description.includes('**Strong**'));
    assert.equal(detail()!.plan, 'Updated **plan**.'); assert.equal(detail()!.notes, 'Updated **notes**.'); assert.equal(detail()!.summary, 'Updated **result**.');
    assert.equal(detail()!.criteria.length, 3); assert.equal(detail()!.criteria[0].text, 'Updated first criterion'); assert.ok(detail()!.criteria[0].checked); assert.ok(detail()!.criteria[1].checked); assert.equal(detail()!.criteria[2].text, 'Added in the UI');
    type('Nouveau commentaire', 'A **comment** from the real UI.'); click('Commenter'); step++;
  } else if (step === 5 && !saving() && detail() !== null && detail()!.comments.length === comments + 1) {
    assert.equal(detail()!.comments[comments].body, 'A **comment** from the real UI.');
    assert.ok(find(ui.inspectRoot(), 'UI heading', false) >= 0, 'Markdown heading is rendered');
    console.log('kanban editor: absent-description regression, populated section fields, criterion edits/toggles/add/remove, restored draft/focus, saved all sections, rendered heading and posted comment ok');
    ui.removeStepper(tick); stopBacklog(); quit();
  }
}
ui.addStepper(tick);
