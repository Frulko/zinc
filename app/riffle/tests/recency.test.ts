// The list order: `zinc test app/riffle/tests`. Each case is a way a window could fall to the bottom of the list.
import * as assert from 'zinc:assert';
import { Recency, firstSelection, focusIsStale, keepingOrder, restoreOrder, scrolledStart, selectionInView, visibleStart } from '../src/recency';

function ordered(recency: Recency, ids: number[]): number[] {
  return ids.slice().sort((a: number, b: number) => recency.rankOf(a) - recency.rankOf(b));
}

// The first sweep takes the stacking as it is.
const first = new Recency();
first.reconcile([1, 2, 3], [1, 2, 3]);
assert.deepEqual(first.order, [1, 2, 3], 'seeded from the stacking');

// A cold launch whose focus event was missed: the new window on top comes first, not last.
const missedFocus = new Recency();
missedFocus.reconcile([1, 2, 3], [1, 2, 3]);
missedFocus.reconcile([9, 1, 2, 3], [1, 2, 3, 9]);
assert.deepEqual(missedFocus.order, [9, 1, 2, 3], 'a new top window is first');

// A window opened behind the one in use takes its place in the stacking.
const opensBehind = new Recency();
opensBehind.reconcile([1, 2, 3], [1, 2, 3]);
opensBehind.reconcile([1, 9, 2, 3], [1, 2, 3, 9]);
assert.deepEqual(opensBehind.order, [1, 9, 2, 3], 'a background window sits where it is stacked');

// A window missing from one sweep while it still exists keeps its rank.
const transient = new Recency();
transient.reconcile([1, 2, 3], [1, 2, 3]);
transient.touch(3);
transient.reconcile([1, 2], [1, 2, 3]);
transient.reconcile([1, 2, 3], [1, 2, 3]);
assert.deepEqual(transient.order, [3, 1, 2], 'a transient absence loses nothing');

// A window focused while the sweep ran is newer than the sweep: it stays first.
const race = new Recency();
race.reconcile([1, 2], [1, 2]);
race.touch(7);
race.reconcile([1, 2], [1, 2, 7]);
race.reconcile([7, 1, 2], [1, 2, 7]);
assert.deepEqual(race.order, [7, 1, 2], 'a sweep older than the focus does not undo it');

// A closed window is forgotten, and the others stay in order.
const closed = new Recency();
closed.reconcile([1, 2, 3], [1, 2, 3]);
closed.reconcile([1, 3], [1, 3]);
assert.deepEqual(closed.order, [1, 3], 'a closed window goes');

// Touching moves to the front, whichever way the focus came.
const touched = new Recency();
touched.reconcile([1, 2, 3], [1, 2, 3]);
touched.touch(3);
touched.touch(2);
assert.deepEqual(ordered(touched, [1, 2, 3]), [2, 3, 1], 'most recent first');

// A restart keeps the order; an id now owned by another process does not come back.
const saved = [{ id: 5, pid: 50 }, { id: 6, pid: 60 }, { id: 7, pid: 70 }];
const alive = [{ id: 5, pid: 50 }, { id: 6, pid: 99 }];
assert.deepEqual(restoreOrder(saved, alive), [5], 'only the same window comes back');

// The selection starts on the previous window.
assert.equal(firstSelection(10, 10, 3, false), 1, 'the app in front is first: go to the second');
assert.equal(firstSelection(10, 20, 3, false), 0, 'the app in front is not listed: the first is the previous');
assert.equal(firstSelection(10, 10, 1, false), 0, 'a single window');
assert.equal(firstSelection(10, 10, 3, true), 2, 'Shift starts from the end');
assert.equal(firstSelection(10, 10, 0, false), 0, 'no window');

// The panel follows the selection only as far as it must.
assert.equal(visibleStart(2, 3, 8, 0), 0, 'everything fits');
assert.equal(visibleStart(8, 20, 8, 0), 1, 'down past the last row');
assert.equal(visibleStart(3, 20, 8, 1), 1, 'inside: nothing moves');
assert.equal(visibleStart(0, 20, 8, 5), 0, 'up past the first row');
assert.equal(visibleStart(19, 20, 8, 0), 12, 'the wrap to the end');
assert.equal(visibleStart(2, 9, 8, 5), 1, 'the list got shorter');
// A hold never reorders what is on screen.
assert.deepEqual(keepingOrder([1, 2, 3], [3, 1, 2]), [1, 2, 3], 'new ranks move nothing');
assert.deepEqual(keepingOrder([1, 2, 3], [3, 1]), [1, 3], 'a closed window leaves');
assert.deepEqual(keepingOrder([1, 2], [9, 2, 1]), [1, 2, 9], 'a new window joins at the end');
// The wheel moves the rows shown, within the list, and the highlight stays among them.
assert.equal(scrolledStart(0, 2, 20, 8), 2, 'down');
assert.equal(scrolledStart(1, -5, 20, 8), 0, 'stops at the top');
assert.equal(scrolledStart(11, 5, 20, 8), 12, 'stops at the end');
assert.equal(scrolledStart(0, 3, 5, 8), 0, 'everything fits');
assert.equal(selectionInView(0, 3, 8), 3, 'rows above left: the highlight follows');
assert.equal(selectionInView(15, 3, 8), 10, 'rows below left: the highlight follows');
assert.equal(selectionInView(5, 3, 8), 5, 'still shown: it stays');

// A late focus report does not put another window above the one just gone to.
assert.equal(focusIsStale(7, 9, 100, 400), true, 'another window, just after');
assert.equal(focusIsStale(9, 9, 100, 400), false, 'the window gone to');
assert.equal(focusIsStale(7, 9, 500, 400), false, 'later, it is the person');
console.log('recency: ok');
