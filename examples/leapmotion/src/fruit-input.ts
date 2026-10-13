import { Tracker, Hand } from 'zinc:leapmotion';
import { Blade, clamp } from './model';

/** One sensor per player; a missing stream never hands its player slot to the other sensor. */
export class FruitInput {
  blades: Blade[] = [new Blade(), new Blade()];
  devices: number[] = [-1, -1];
  private hands: number[] = [-1, -1];
  private simulated: boolean = false;
  pause(): void { for (const blade of this.blades) blade.move(0, 0, false, -1, -1); }
  reset(): void { this.devices = [-1, -1]; this.hands = [-1, -1]; this.blades = [new Blade(), new Blade()]; }
  update(tracker: Tracker, range: number): void {
    if (tracker.simulated !== this.simulated) { this.reset(); this.simulated = tracker.simulated; }
    for (const device of tracker.devices) {
      if (this.devices[0] === device.id || this.devices[1] === device.id) continue;
      if (this.devices[0] < 0) this.devices[0] = device.id;
      else if (this.devices[1] < 0) this.devices[1] = device.id;
    }
    for (let p = 0; p < 2; p++) {
      let hand: Hand | null = null;
      for (const device of tracker.devices) if (device.id === this.devices[p]) {
        for (const candidate of device.hands) if (candidate.id === this.hands[p]) hand = candidate;
        if (hand === null && device.hands.length > 0) hand = device.hands[0];
      }
      if (hand === null) { this.blades[p].move(0, 0, false, this.devices[p], -1); this.hands[p] = -1; continue; }
      this.hands[p] = hand.id;
      const tip = hand.joints[9], x = clamp(600 + tip.x / range * 1160, 20, 1176), y = clamp(734 - (tip.y - 100) / 350 * 704, 24, 734);
      this.blades[p].move(x, y - 170, x > 42 && x < 870 && y > 202 && y < 725, hand.deviceId, hand.id);
    }
  }
}
