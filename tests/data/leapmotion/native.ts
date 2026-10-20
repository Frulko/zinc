import { Tracker } from 'zinc:leapmotion';
function check(ok: boolean, why: string): void { if (!ok) throw new Error(why); }
const tracker = new Tracker(); tracker.update(0.016);
check(tracker.status === 2 && tracker.hands.length === 4 && tracker.devices.length === 2, 'two devices, two hands each');
check(tracker.devices[0].frameId === 123 && tracker.devices[1].frameId === 123, 'overlapping frame ids preserved');
check(tracker.devices[0].serial === 'TEST-A' && tracker.devices[1].serial === 'TEST-B', 'device serials');
check(tracker.hands[1].right && !tracker.hands[0].right && tracker.hands[1].id === 41, 'hand identity');
check(tracker.hands[1].palm.x === 101 && tracker.hands[3].palm.x === 301, 'independent snapshots');
check(tracker.hands[1].deviceId === 10 && tracker.hands[3].deviceId === 11, 'device routing');
check(tracker.hands[1].joints[9].x === 14 && tracker.hands[1].joints[24].x === 44, 'finger joints');
check(tracker.hands[1].extended[1] && !tracker.hands[1].extended[3], 'finger extension flags');
tracker.update(0.016); check(tracker.hands[1].palm.x === 101, 'SDK memory copied before next poll');
tracker.update(0.016); check(tracker.hands.length === 2 && tracker.devices[0].hands.length === 0, 'empty A frame leaves B intact');
tracker.update(0.016); check(tracker.devices.length === 1 && tracker.devices[0].id === 11 && tracker.hands.length === 2, 'detach A leaves B intact');
tracker.update(0.016); check(tracker.status === 0 && tracker.hands.length === 0 && tracker.devices.length === 0, 'connection loss clears devices');
tracker.close(); tracker.update(0.016); check(tracker.hands.length === 4, 'reopen after close'); tracker.close();
console.log('leapmotion native: all checks passed');
