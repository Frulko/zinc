import Native from './native/leapmotion.spec';

export class Vec3 {
  constructor(public x: number = 0, public y: number = 0, public z: number = 0) {}
}
export class Hand {
  id: number = 0;
  deviceId: number = 0;
  extended: boolean[] = [false, false, false, false, false];
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

export class Device {
  status: number = 1;
  frameId: number = 0;
  fps: number = 0;
  hands: Hand[] = [];
  constructor(public id: number, public serial: string) {}
}

/** Desktop tracking in millimetres: +x right, +y up, +z towards the user. One native connection shared by trackers. */
export class Tracker {
  hands: Hand[] = [];
  devices: Device[] = [];
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
    this.opened = false; this.hands = []; this.devices = []; this.status = 0; this.frameId = 0; this.fps = 0; this.retry = 0;
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
    this.status = data[0]; this.fps = data[2]; this.message = Native.error();
    if (this.status === 0) {
      this.hands = []; this.devices = []; this.frameId = 0;
      if (this.retry <= 0) { Native.close(); this.opened = false; }
      return;
    }
    if (data[1] === this.frameId && data[3] === this.hands.length) return;
    this.frameId = data[1]; this.hands = [];
    const previous = this.devices; this.devices = [];
    let b = 5;
    for (let d = 0; d < data[4] && d < 2 && b + 5 <= data.length; d++) {
      const id = data[b];
      let serial = '';
      for (const old of previous) if (old.id === id) serial = old.serial;
      if (serial === '') serial = Native.deviceSerial(id);
      const device = new Device(id, serial);
      device.status = data[b + 1]; device.frameId = data[b + 2]; device.fps = data[b + 3];
      const count = data[b + 4]; b += 5;
      for (let h = 0; h < count && h < 2 && b + 93 <= data.length; h++) {
        const hand = new Hand(); hand.deviceId = id;
        hand.id = data[b]; hand.right = data[b + 1] === 1; hand.pinch = data[b + 2]; hand.grab = data[b + 3];
        hand.palm = readPoint(data, b + 4); hand.wrist = readPoint(data, b + 7); hand.elbow = readPoint(data, b + 10);
        for (let j = 0; j < 25; j++) hand.joints[j] = readPoint(data, b + 13 + j * 3);
        for (let f = 0; f < 5; f++) hand.extended[f] = data[b + 88 + f] === 1;
        device.hands.push(hand); this.hands.push(hand); b += 93;
      }
      this.devices.push(device);
    }
  }

  private simulate(): void {
    this.status = 2; this.fps = 60; this.frameId++; this.message = 'Simulated hands';
    if (this.hands.length !== 2) {
      this.hands = [new Hand(), new Hand()]; this.devices = [new Device(1, 'SIM-A'), new Device(2, 'SIM-B')];
      this.devices[0].hands = [this.hands[0]]; this.devices[1].hands = [this.hands[1]];
    }
    for (let h = 0; h < 2; h++) {
      const hand = this.hands[h], side = h === 0 ? -1 : 1, t = this.time;
      hand.id = h + 1; hand.deviceId = h + 1; hand.right = h === 1;
      this.devices[h].status = 2; this.devices[h].frameId = this.frameId; this.devices[h].fps = 60;
      const pose = Math.floor(t / 5 + h) % 3;
      hand.extended = pose === 0 ? [false, false, false, false, false] : pose === 1 ? [true, true, true, true, true] : [false, true, true, false, false];
      hand.pinch = (Math.sin(t * 1.7 + h) + 1) / 2; hand.grab = pose === 0 ? 0.95 : pose === 1 ? 0.05 : 0.45;
      hand.palm = new Vec3(Math.sin(t * 1.8 + h) * 55, 215 + Math.sin(t * 2.1 + h) * 40, Math.cos(t + h) * 45);
      hand.wrist = new Vec3(hand.palm.x, hand.palm.y - 42, hand.palm.z + 8);
      hand.elbow = new Vec3(hand.palm.x + side * 30, hand.palm.y - 110, hand.palm.z + 55);
      for (let f = 0; f < 5; f++) for (let j = 0; j < 5; j++) {
        const spread = (f - 2) * 17 * side;
        hand.joints[f * 5 + j] = new Vec3(hand.palm.x + spread * (0.5 + j * 0.22),
          hand.palm.y - 18 + (hand.extended[f] ? j : Math.sin(j * 0.9) * 1.3) * (f === 0 ? 12 : 19 - Math.abs(f - 2) * 2), hand.palm.z - j * 5 + (hand.extended[f] ? 0 : j * 13));
      }
      const thumb = hand.joints[4], index = hand.joints[9];
      thumb.x += (index.x - thumb.x) * hand.pinch; thumb.y += (index.y - thumb.y) * hand.pinch;
    }
  }
}
