import { Tracker } from 'zinc:leapmotion';
const tracker = new Tracker();
let ticks = 0;
const timer = setInterval(() => {
  tracker.update(0.02);
  ticks++;
  if (ticks === 40) {
    console.log('leap status', tracker.status, 'hands', tracker.hands.length, 'fps', Math.round(tracker.fps));
    console.log('leap devices', tracker.devices.length);
    for (const d of tracker.devices) console.log('leap device', d.id, 'hands', d.hands.length);
    console.log('leap message', tracker.message);
    tracker.close(); clearInterval(timer);
  }
}, 20);
