import * as assert from 'zinc:assert';
import * as sys from 'zinc:sys';
import * as proc from 'zinc:process';
import { Task, Detail } from '../../../examples/kanban/src/models';
import { startBacklog, loadDetail, stopBacklog } from '../../../examples/kanban/src/services/backlog';

let snapshots: i32 = 0, changed = false, detailed = false, failed = '';
startBacklog((tasks: Task[]) => {
  snapshots++;
  assert.equal(tasks.length, 1);
  if (snapshots === 1) {
    assert.equal(tasks[0].status, 'Backlog');
    loadDetail(tasks[0].id, (d: Detail | null, error: string) => {
      if (d === null) { failed = error; return; }
      assert.equal(d.id, 'ZN-001'); assert.ok(d.description.includes('watch fixture')); detailed = true;
    });
    const p = proc.spawn('backlog', ['task', 'edit', 'ZN-001', '-s', 'In Progress', '-a', '@codex/watch-test'], { cwd: sys.env('KANBAN_REPO') });
    p.onExit((code: i32) => { if (code !== 0) failed = 'backlog edit failed'; });
  } else if (tasks[0].status === 'In Progress' && tasks[0].assignees[0] === '@codex/watch-test') changed = true;
}, (live: boolean, message: string) => { if (!live) failed = message; });
const until = sys.clock() + 12000;
while ((!changed || !detailed) && failed === '' && sys.clock() < until) sys.poll(20);
stopBacklog();
assert.equal(failed, ''); assert.ok(changed); assert.ok(detailed);
console.log('kanban watch: real CLI initial snapshot, detail, external named claim and changed snapshot ok');
