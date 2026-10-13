import { Tracker } from 'zinc:leapmotion';
const tracker = new Tracker(); tracker.update(0.016);
if (tracker.hands.length !== 2) throw new Error('fixture has no hands');
setTimeout(() => {
  tracker.update(0.016);
  if (tracker.hands.length !== 0 || tracker.status !== 1) throw new Error('stalled stream leaves stale hands');
  tracker.close(); console.log('leapmotion stale: all checks passed');
}, 320);
