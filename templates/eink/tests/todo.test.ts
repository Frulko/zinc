// The to-do list (src/todo.ts).
import * as assert from 'zinc:assert';
import { TodoList } from '../src/todo';

const l = new TodoList();
assert.ok(l.add('  milk '));
assert.ok(!l.add('   '));
l.add('bread');
assert.equal(l.left(), 2);
l.toggle(0);
assert.equal(l.left(), 1);
assert.equal(l.encode(), '1 milk\n0 bread');
const back = TodoList.decode(l.encode());
assert.equal(back.items.length, 2);
assert.ok(back.items[0].done);
assert.equal(back.items[1].text, 'bread');
assert.equal(l.clearDone(), 1);
assert.equal(l.encode(), '0 bread');
assert.equal(TodoList.decode('garbage\n0 ok').items.length, 1);
console.log('todo: ok');
