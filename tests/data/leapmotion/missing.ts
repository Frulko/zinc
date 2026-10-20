import { Tracker } from 'zinc:leapmotion';
const tracker = new Tracker(); tracker.update(0.016);
if (tracker.hands.length !== 0 || tracker.status !== 0 || tracker.message.length === 0) throw new Error('missing SDK must report why, without simulated hands');
tracker.close(); console.log('leapmotion missing: all checks passed');
