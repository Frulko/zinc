import { Tracker } from 'zinc:leapmotion';
function check(ok: boolean, why: string): void { if (!ok) throw new Error(why); }
const tracker = new Tracker();
tracker.update(0.016);
check(tracker.status === 2 && tracker.hands.length === 2 && tracker.frameId === 123, 'native tracking snapshot');
check(tracker.hands[1].right && !tracker.hands[0].right && tracker.hands[1].id === 41, 'hand identity');
check(tracker.hands[1].palm.x === 101 && tracker.hands[1].wrist.y === 180, 'palm and wrist');
check(tracker.hands[1].joints[9].x === 14 && tracker.hands[1].joints[24].x === 44, 'finger joints');
check(tracker.hands[1].pinch > 0.89 && tracker.hands[1].pinch < 0.91, 'pinch strength');
tracker.update(0.016);
check(tracker.hands[1].palm.x === 101, 'SDK memory copied before next poll');
tracker.update(0.016); check(tracker.hands.length === 0 && tracker.status === 2, 'empty tracking frame clears hands');
tracker.update(0.016); check(tracker.status === 0 && tracker.hands.length === 0, 'connection loss clears hands');
tracker.close(); tracker.update(0.016); check(tracker.hands.length === 2, 'reopen after close'); tracker.close();
console.log('leapmotion native: all checks passed');
