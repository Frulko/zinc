// zinc:ui/animated against React Native (ZN-364): the reference numbers below were computed by React Native 0.76's own Easing.js, bezier.js, SpringConfig.js
// and the closed forms of SpringAnimation / DecayAnimation (run with Node, see the task notes); this program computes the same with zinc:ui/animated, the
// springs and the decay advancing on the engine clock (ui.tick), and prints the largest difference of each series. It also checks composition and interpolate.
import * as A from 'zinc:ui/animated';
import { Easing } from 'zinc:ui/animated';
import * as ui from 'zinc:ui';
const TS: number[] = [0.1, 0.25, 0.5, 0.75, 0.9];
const R_ease: number[] = [0.01702660965156294, 0.09346465071882487, 0.31535681257253934, 0.6218618691748903, 0.8394278457624665];
const R_inOutEase: number[] = [0.03114100006836614, 0.15767840628626967, 0.5, 0.8423215937137303, 0.9688589999316338];
const R_bez: number[] = [0.09479630571604326, 0.4085105913553958, 0.802403387584857, 0.960458978348974, 0.9943164774845564];
const R_bounce: number[] = [0.07562500000000001, 0.47265625, 0.765625, 0.97265625, 0.9881249999999999];
const R_elastic: number[] = [0.08364003548347465, 0.4423893756530841, 1, 1.0396281669452767, 1.0036408572338962];
const R_back: number[] = [-0.014314220000000002, -0.06413656250000001, -0.08769750000000004, 0.1825903124999999, 0.5911720199999999];
const R_outCubic: number[] = [0.2709999999999999, 0.578125, 0.875, 0.984375, 0.999];
const R_sin: number[] = [0.01231165940486223, 0.07612046748871326, 0.2928932188134524, 0.6173165676349102, 0.843565534959769];
const R_exp: number[] = [0.001953125, 0.005524271728019903, 0.03125, 0.1767766952966369, 0.5000000000000001];
const R_springDefault: number[] = [19.694838642191257, 52.98651122843615, 95.37103293270037, 101.73670740917217, 99.99342559885777];
const R_springBounciness: number[] = [27.627281891309494, 68.81941656325367, 104.98684475403417, 99.93508029054408, 100.00448445232199];
const R_springBounciness2: number[] = [20.36052638657729, 64.17822477237631, 132.5348474588201, 94.00307601800228, 102.41328194302706];
const R_springStiff: number[] = [10.440547345507937, 34.029984660829825, 84.94256348541123, 115.31227684140492, 97.9006626780466];
const R_springCritical: number[] = [9.020401043104982, 26.42411176571153, 59.39941502901619, 90.84218055563291, 99.69808363488774];
const R_decay: number[] = [90.63462346100906, 316.06027941427874, 432.3323583816934];

function worst(got: number[], want: number[]): string { let w = 0; for (let i = 0; i < want.length; i++) w = Math.max(w, Math.abs(got[i] - want[i])); return w < 1e-6 ? 'ok' : w < 1e-3 ? `ok (within ${Math.ceil(w * 1e6)}e-6)` : `DIFF ${w}`; }
function curve(f: (t: number) => number): number[] { const out: number[] = []; for (const t of TS) out.push(f(t)); return out; }
console.log('ease ' + worst(curve(Easing.ease), R_ease));
console.log('inOut(ease), the timing default ' + worst(curve(Easing.inOut(Easing.ease)), R_inOutEase));
console.log('bezier(.25,.1,.25,1) ' + worst(curve(Easing.bezier(0.25, 0.1, 0.25, 1)), R_bez));
console.log('bounce ' + worst(curve(Easing.bounce), R_bounce));
console.log('elastic(1) ' + worst(curve(Easing.elastic(1)), R_elastic));
console.log('back() ' + worst(curve(Easing.back()), R_back));
console.log('out(cubic) ' + worst(curve(Easing.out(Easing.cubic)), R_outCubic));
console.log('sin ' + worst(curve(Easing.sin), R_sin));
console.log('exp ' + worst(curve(Easing.exp), R_exp));

const MS: number[] = [50, 100, 200, 400, 800];
function springRun(c: A.SpringConfig): number[] {
  const v = new A.Value(0);
  A.spring(v, c).start();
  const out: number[] = [];
  let at = 0;
  for (const ms of MS) { ui.tick(ms - at); at = ms; out.push(v.get()); }
  v.stopAnimation();
  return out;
}
console.log('spring default (tension 40, friction 7) ' + worst(springRun({ toValue: 100 }), R_springDefault));
console.log('spring bounciness 8 speed 12 ' + worst(springRun({ toValue: 100, bounciness: 8, speed: 12 }), R_springBounciness));
console.log('spring bounciness 20 speed 5 ' + worst(springRun({ toValue: 100, bounciness: 20, speed: 5 }), R_springBounciness2));
console.log('spring stiffness 100 damping 10 ' + worst(springRun({ toValue: 100, stiffness: 100, damping: 10 }), R_springStiff));
console.log('spring critically damped ' + worst(springRun({ toValue: 100, stiffness: 100, damping: 20 }), R_springCritical));
{
  const v = new A.Value(0);
  A.decay(v, { velocity: 1 }).start();
  const out: number[] = [];
  let at = 0;
  for (const ms of [100, 500, 1000]) { ui.tick(ms - at); at = ms; out.push(v.get()); }
  v.stopAnimation();
  console.log('decay velocity 1, deceleration 0.998 ' + worst(out, R_decay));
}
{   // timing ends exactly on toValue and calls back with finished = true
  const v = new A.Value(10);
  let ended = 'no';
  A.timing(v, { toValue: 30, duration: 300 }).start((f: boolean) => { ended = f ? 'finished' : 'stopped'; });
  ui.tick(150); const mid = v.get(); ui.tick(200);
  console.log(`timing 10 -> 30 in 300 ms: middle ${Math.round(mid * 1000) / 1000}, end ${v.get()}, ${ended}`);
}
{   // sequence, parallel, delay, stagger and loop: the order and the completion
  const a = new A.Value(0), b = new A.Value(0);
  let order = '';
  a.addListener((x: number) => { if (x === 1 && order.indexOf('a') < 0) order += 'a'; });
  b.addListener((x: number) => { if (x === 1 && order.indexOf('b') < 0) order += 'b'; });
  let done = '';
  A.sequence([A.timing(a, { toValue: 1, duration: 100 }), A.delay(50), A.timing(b, { toValue: 1, duration: 100 })]).start((f: boolean) => { done = f ? 'done' : 'stopped'; });
  for (let i = 0; i < 30; i++) ui.tick(10);
  console.log(`sequence: ${order} ${done}, b at 300 ms ${b.get()}`);
  const c = new A.Value(0), d = new A.Value(0);
  let pdone = '';
  A.parallel([A.timing(c, { toValue: 1, duration: 100 }), A.timing(d, { toValue: 1, duration: 200 })]).start((f: boolean) => { pdone = f ? 'done' : 'stopped'; });
  ui.tick(120);
  console.log(`parallel at 120 ms: c ${c.get()} d ${Math.round(d.get() * 1000) / 1000} ${pdone === '' ? 'running' : pdone}`);
  ui.tick(100);
  console.log(`parallel at 220 ms: ${pdone}`);
  const e = new A.Value(0);
  let loops = 0;
  e.addListener((x: number) => { if (x === 1) loops++; });
  A.loop(A.timing(e, { toValue: 1, duration: 50 }), 3).start();
  for (let i = 0; i < 20; i++) ui.tick(10);
  console.log(`loop 3 times: reached 1 ${loops} times`);
}
{   // interpolate: ranges, clamp, identity, colours
  const v = new A.Value(0.5);
  const i1 = v.interpolate({ inputRange: [0, 1], outputRange: [100, 200] });
  const i2 = v.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 10, 40] });
  console.log(`interpolate 0.5: ${i1.get()} ${i2.get()}`);
  v.setValue(2);
  const clamp = v.interpolate({ inputRange: [0, 1], outputRange: [0, 10], extrapolate: 'clamp' });
  const ext = v.interpolate({ inputRange: [0, 1], outputRange: [0, 10] });
  const ident = v.interpolate({ inputRange: [0, 1], outputRange: [0, 10], extrapolateRight: 'identity' });
  console.log(`out of range 2: clamp ${clamp.get()} extend ${ext.get()} identity ${ident.get()}`);
  v.setValue(0.5);
  const col = v.interpolate({ inputRange: [0, 1], outputRange: [0xff0000, 0x0000ff], colors: true });
  const cv = col.get();
  console.log(`colour half way red -> blue: rgb ${(cv >> 16) & 255} ${(cv >> 8) & 255} ${cv & 255}`);
  const sum = A.add(v, A.multiply(v, A.constant(2)));
  console.log(`add(v, v * 2) at 0.5: ${sum.get()}`);
}
