import * as assert from 'zinc:assert';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { Task, decodeTasks, decodeDetail, assignment, activityState } from '../../../examples/kanban/src/models';
import { acceptSnapshot, tasks, sourceTasks, declaredState, moveTask, resetBoard, inColumn, setQuery, setScope, setMilestone, filtered, localCount, activity } from '../../../examples/kanban/src/state';

const dir = sys.env('KANBAN_TEST_DATA');
const raw = fs.readText(dir + '/snapshot.json');
let decoded = decodeTasks(raw);
assert.equal(decoded.length, 9);
assert.equal(decoded[0].id, 'ZN-713');
assert.equal(decodeDetail(fs.readText(dir + '/details/ZN-650.07.json')).criteria.length, 3);
assert.ok(decodeDetail(fs.readText(dir + '/details/ZN-650.07.json')).description.includes('museum'));
assert.ok(assignment(decoded[0]).includes('identité inconnue'));
assert.equal(activityState(decoded[0]), 'Réservée');
assert.equal(assignment(decoded[3]), '@codex/test-fixture');
assert.equal(activityState(decoded[3]), 'Prise en charge déclarée');
const unknown = new Task(); unknown.status = 'In Progress';
assert.equal(assignment(unknown), 'Agent non renseigné');
for (const invalid of ['{}', '{', '{"schemaVersion":2,"kind":"task-list","tasks":[]}',
  '{"schemaVersion":1,"kind":"task-list","tasks":[{"id":"X","status":"Oops"}]}',
  '{"schemaVersion":1,"kind":"task-list","tasks":[{"id":"X","status":"Done"},{"id":"X","status":"Done"}]}']) {
  let threw = false; try { decodeTasks(invalid); } catch (e) { threw = true; } assert.ok(threw);
}
acceptSnapshot(decoded);
setQuery('  codex/test-fixture  '); assert.equal(filtered().length, 1);
setQuery('ZN-713'); assert.equal(filtered()[0].id, 'ZN-713');
setQuery(''); setScope('active'); assert.equal(filtered().length, 2);
setScope('all'); setMilestone('m-21'); assert.equal(filtered().length, 1);
setMilestone('');
moveTask('ZN-713', 'Ready');
assert.equal(sourceTasks()[0].status, 'Backlog'); assert.equal(declaredState('ZN-713'), 'Réservée');
assert.equal(inColumn('Backlog').length, 1); assert.equal(inColumn('Ready')[1].id, 'ZN-713');
moveTask('ZN-713', 'Ready', 'ZN-369', false);
assert.equal(inColumn('Ready')[0].id, 'ZN-713');
moveTask('ZN-713', 'Ready', 'ZN-369', true);
assert.equal(inColumn('Ready')[1].id, 'ZN-713');
moveTask('missing', 'Done'); moveTask('ZN-713', 'Invalid'); moveTask('ZN-713', 'Ready', 'ZN-713');
assert.equal(tasks().length, 9); assert.equal(localCount(), 1);
acceptSnapshot(decodeTasks(raw)); assert.equal(inColumn('Ready')[1].id, 'ZN-713');
decoded = decodeTasks(raw); decoded[0].status = 'In Progress'; decoded[0].assignees = ['@claude/worker-one'];
acceptSnapshot(decoded);
assert.equal(inColumn('In Progress')[0].id, 'ZN-713'); assert.equal(localCount(), 0);
assert.ok(activity()[0].includes('@claude/worker-one'));
moveTask('ZN-761', 'Done'); resetBoard(); assert.equal(inColumn('Backlog')[0].id, 'ZN-761');
acceptSnapshot(decoded.filter((t: Task) => t.id !== 'ZN-761')); assert.equal(tasks().length, 8);
console.log('kanban logic: schema, filters, moves, ordering, source precedence, agent identity and deletion ok');
