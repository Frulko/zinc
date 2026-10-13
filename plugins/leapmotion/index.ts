import Native from './native/leapmotion.spec';

export class Vec3 {
  constructor(public x: number = 0, public y: number = 0, public z: number = 0) {}
}
export class Hand {
  id: number = 0;
  right: boolean = true;
  pinch: number = 0;
  grab: number = 0;
  palm = new Vec3();
  wrist = new Vec3();
  elbow = new Vec3();
  /** Thumb, index, middle, ring, pinky; five joints each, metacarpal base to tip. */
  joints: Vec3[] = [];
  constructor() { for (let i = 0; i < 25; i++) this.joints.push(new Vec3()); }
}

function readPoint(data: number[], i: number): Vec3 { return new Vec3(data[i], data[i + 1], data[i + 2]); }

/** Desktop tracking in millimetres: +x right, +y up, +z towards the user. One native connection shared by trackers. */
export class Tracker {
  hands: Hand[] = [];
  status: number = 0;
  frameId: number = 0;
  fps: number = 0;
  message: string = '';
  private opened: boolean = false;
  private retry: number = 0;
  private time: number = 0;
  constructor(public simulated: boolean = false) {}
  setSimulation(value: boolean): void {
    this.close(); this.simulated = value; this.time = 0;
  }
  close(): void {
    if (this.opened) Native.close();
    this.opened = false; this.hands = []; this.status = 0; this.frameId = 0; this.fps = 0; this.retry = 0;
  }
  update(dt: number): void {
    this.time += Math.max(0, Math.min(dt, 0.1));
    if (this.simulated) { this.simulate(); return; }
    this.retry -= dt;
    if (!this.opened && this.retry <= 0) {
      this.opened = Native.open(); this.message = Native.error(); this.retry = 2;
    }
    if (!this.opened) return;
    const data = Native.poll();
    this.status = data[0]; this.fps = data[2];
    if (this.status === 0) {
      this.hands = []; this.frameId = 0;
      if (this.retry <= 0) { Native.close(); this.opened = false; }
      return;
    }
    if (data[1] === this.frameId && data[3] === this.hands.length) return;
    this.frameId = data[1]; this.hands = [];
    for (let h = 0; h < data[3] && h < 2; h++) {
      const b = 4 + h * 88;
      if (data.length < b + 88) break;
      const hand = new Hand();
      hand.id = data[b]; hand.right = data[b + 1] === 1; hand.pinch = data[b + 2]; hand.grab = data[b + 3];
      hand.palm = readPoint(data, b + 4); hand.wrist = readPoint(data, b + 7); hand.elbow = readPoint(data, b + 10);
      for (let j = 0; j < 25; j++) hand.joints[j] = readPoint(data, b + 13 + j * 3);
      this.hands.push(hand);
    }
  }
  private simulate(): void {
    this.status = 2; this.fps = 60; this.frameId++; this.message = 'Simulated hands';
    if (this.hands.length !== 2) { this.hands = [new Hand(), new Hand()]; }
    for (let h = 0; h < 2; h++) {
      const hand = this.hands[h], side = h === 0 ? -1 : 1, t = this.time;
      hand.id = h + 1; hand.right = h === 1;
      hand.pinch = (Math.sin(t * 1.7 + h) + 1) / 2; hand.grab = (Math.sin(t * 0.8 + h) + 1) / 4;
      hand.palm = new Vec3(side * 85 + Math.sin(t * 1.8 + h) * 55, 215 + Math.sin(t * 2.1 + h) * 40, Math.cos(t + h) * 45);
      hand.wrist = new Vec3(hand.palm.x, hand.palm.y - 42, hand.palm.z + 8);
      hand.elbow = new Vec3(hand.palm.x + side * 30, hand.palm.y - 110, hand.palm.z + 55);
      for (let f = 0; f < 5; f++) for (let j = 0; j < 5; j++) {
        const spread = (f - 2) * 17 * side;
        hand.joints[f * 5 + j] = new Vec3(hand.palm.x + spread * (0.5 + j * 0.22),
          hand.palm.y - 18 + j * (f === 0 ? 12 : 19 - Math.abs(f - 2) * 2), hand.palm.z - j * 5 - hand.grab * j * 8);
      }
      const thumb = hand.joints[4], index = hand.joints[9];
      thumb.x += (index.x - thumb.x) * hand.pinch; thumb.y += (index.y - thumb.y) * hand.pinch;
    }
  }
}
