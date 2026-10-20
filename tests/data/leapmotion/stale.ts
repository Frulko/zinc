import { Tracker } from 'zinc:leapmotion';
const tracker = new Tracker(); tracker.update(0.016);
if (tracker.hands.length !== 4) throw new Error('fixture has no hands');
setTimeout(() => {
  tracker.update(0.016);
  if (tracker.hands.length !== 2 || tracker.devices[0].status !== 1 || tracker.devices[1].status !== 2) throw new Error('only stalled A should expire');
  tracker.close(); console.log('leapmotion stale: all checks passed');
}, 320);
