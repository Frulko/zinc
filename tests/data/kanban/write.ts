import * as assert from 'zinc:assert';
import * as sys from 'zinc:sys';
import * as proc from 'zinc:process';
import * as fs from 'zinc:fs';
import { Detail, Criterion, copyDetail, decodeDetail } from '../../../examples/kanban/src/models';
import { startBacklog, stopBacklog, editTask, commentTask } from '../../../examples/kanban/src/services/backlog';

async function read(): Promise<Detail> {
  const r = await proc.run('backlog', ['task', 'view', 'ZN-001', '--json'], { cwd: sys.env('KANBAN_REPO') });
  assert.equal(r.code, 0); return decodeDetail(r.stdout);
}
async function test(): Promise<void> {
  startBacklog((tasks) => {}, (live: boolean, message: string) => { if (!live) console.log(message); });
  const base = await read();
  const description = '## Updated\n\n**Bold** and `code`.\n\n- item';
  let draft = copyDetail(base); draft.title = 'Edited from Kanban'; draft.description = description;
  await editTask(base, draft);
  let d = await read(); assert.equal(d.title, 'Edited from Kanban'); assert.equal(d.description, description);
  const body = 'Comment with **bold**, `code`, $HOME and $(literal).';
  await commentTask(base.id, body); await commentTask(base.id, 'Second comment');
  d = await read(); assert.equal(d.comments.length, 2); assert.equal(d.comments[0].body, body);
  assert.equal(d.comments[0].author, 'Kanban Test'); assert.equal(d.comments[1].body, 'Second comment');
  let rejected = false;
  try { await editTask(base, copyDetail(base)); } catch (e) { rejected = true; }
  assert.ok(rejected, 'a stale description cannot overwrite another edit');
  rejected = false; draft = copyDetail(d); draft.title = ' '; try { await editTask(d, draft); } catch (e) { rejected = true; } assert.ok(rejected);
  rejected = false; try { await commentTask(base.id, 'before\n---\nafter'); } catch (e) { rejected = true; } assert.ok(rejected);
  d = await read(); assert.equal(d.title, 'Edited from Kanban'); assert.equal(d.comments.length, 2);
  draft = copyDetail(d); draft.description = ''; draft.notes = 'Notes saved while clearing the description';
  await editTask(d, draft); d = await read(); assert.equal(d.description, '', 'clearing the description is preserved'); assert.equal(d.notes, draft.notes);
  draft = copyDetail(d); draft.plan = '## Plan\n\nA plan.'; draft.notes = 'Original notes'; draft.summary = '**Result**';
  const first = new Criterion(); first.text = 'First, with a comma'; first.checked = true;
  const second = new Criterion(); second.text = 'Second criterion'; draft.criteria = [first, second];
  await editTask(d, draft); d = await read();
  assert.equal(d.description, ''); assert.equal(d.plan, draft.plan); assert.equal(d.notes, draft.notes); assert.equal(d.summary, draft.summary);
  assert.equal(d.criteria.length, 2); assert.equal(d.criteria[0].text, first.text); assert.ok(d.criteria[0].checked); assert.ok(!d.criteria[1].checked);
  const stale = copyDetail(d); draft = copyDetail(d); draft.notes = 'Updated notes'; draft.criteria[0].text = 'Changed first'; draft.criteria[0].checked = false; draft.criteria[1].checked = true;
  await editTask(d, draft); d = await read();
  rejected = false; try { await editTask(stale, stale); } catch (e) { rejected = true; } assert.ok(rejected, 'stale notes/criteria are rejected too');
  assert.equal(d.notes, 'Updated notes'); assert.equal(d.criteria[0].text, 'Changed first'); assert.ok(!d.criteria[0].checked); assert.ok(d.criteria[1].checked);
  draft = copyDetail(d); draft.criteria[0].text = ' '; rejected = false;
  try { await editTask(d, draft); } catch (e) { rejected = true; } assert.ok(rejected, 'empty criterion rejected before writing');
  draft = copyDetail(d); draft.plan = ''; draft.notes = ''; draft.summary = ''; draft.criteria = [];
  await editTask(d, draft); d = await read();
  assert.equal(d.plan, ''); assert.equal(d.notes, ''); assert.equal(d.summary, ''); assert.equal(d.criteria.length, 0); assert.equal(d.comments.length, 2);
  const files = fs.list(sys.env('KANBAN_REPO') + '/backlog/tasks');
  const saved = fs.readText(sys.env('KANBAN_REPO') + '/backlog/tasks/' + files[0]);
  assert.ok(saved.includes('assignee:')); assert.ok(saved.includes('@codex/watch-test'));
  stopBacklog(); console.log('kanban writes: title/Markdown, append-only comments, literal arguments, validation and stale-edit rejection ok');
}
test().catch((e: Error) => { stopBacklog(); console.log('kanban writes failed: ' + e); sys.exit(1); });
