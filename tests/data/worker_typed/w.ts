import { self, MessageEvent } from 'zinc:worker';
import { Job } from './types';

self.onmessage = (e: MessageEvent<Job>) => {
  const j = e.data;
  const out: Job = { u: j.u.map((x: u32): u32 => x + 1), i: j.i.map((x: i32): i32 => -x), f: j.f.map((x: f32): f32 => x * 2), d: j.d.map((x: f64): f64 => x / 4) };
  self.postMessage(out, [j.u]);
};
