// Deliberately leave the connection open: the plugin must close before LeapC destroys its logger.
import { Tracker } from 'zinc:leapmotion';
const tracker = new Tracker(); tracker.update(0.016);
if (tracker.hands.length !== 2) throw new Error('exit fixture has no hands');
console.log('leapmotion exit: all checks passed');
