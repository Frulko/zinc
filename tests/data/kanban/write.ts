import * as assert from 'zinc:assert';
import * as sys from 'zinc:sys';
import * as proc from 'zinc:process';
import * as fs from 'zinc:fs';
import { Detail, decodeDetail } from '../../../examples/kanban/src/models';
import { startBacklog, stopBacklog, editTask, commentTask } from '../../../examples/kanban/src/services/backlog';

async function read(): Promise<Detail> {
  const r = await proc.run('backlog', ['task', 'view', 'ZN-001', '--json'], { cwd: sys.env('KANBAN_REPO') });
  assert.equal(r.code, 0); return decodeDetail(r.stdout);
}
async function test(): Promise<void> {
  startBacklog((tasks) => {}, (live: boolean, message: string) => { if (!live) console.log(message); });
  const base = await read();
  const description = '## Updated\n\n**Bold** and `code`.\n\n- item';
  await editTask(base, 'Edited from Kanban', description);
  let d = await read(); assert.equal(d.title, 'Edited from Kanban'); assert.equal(d.description, description);
  const body = 'Comment with **bold**, `code`, $HOME and $(literal).';
  await commentTask(base.id, body); await commentTask(base.id, 'Second comment');
  d = await read(); assert.equal(d.comments.length, 2); assert.equal(d.comments[0].body, body);
  assert.equal(d.comments[0].author, 'Kanban Test'); assert.equal(d.comments[1].body, 'Second comment');
  let rejected = false;
  try { await editTask(base, 'Stale edit', 'old draft'); } catch (e) { rejected = true; }
  assert.ok(rejected, 'a stale description cannot overwrite another edit');
  rejected = false; try { await editTask(d, ' ', 'bad'); } catch (e) { rejected = true; } assert.ok(rejected);
  rejected = false; try { await commentTask(base.id, 'before\n---\nafter'); } catch (e) { rejected = true; } assert.ok(rejected);
  d = await read(); assert.equal(d.title, 'Edited from Kanban'); assert.equal(d.comments.length, 2);
  await editTask(d, d.title, ''); d = await read(); assert.equal(d.description, '', 'clearing the description is preserved');
  const files = fs.list(sys.env('KANBAN_REPO') + '/backlog/tasks');
  const saved = fs.readText(sys.env('KANBAN_REPO') + '/backlog/tasks/' + files[0]);
  assert.ok(saved.includes('assignee:')); assert.ok(saved.includes('@codex/watch-test'));
  stopBacklog(); console.log('kanban writes: title/Markdown, append-only comments, literal arguments, validation and stale-edit rejection ok');
}
test().catch((e: Error) => { stopBacklog(); console.log('kanban writes failed: ' + e); sys.exit(1); });
