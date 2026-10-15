// The core of gsap on a fixed clock: every value printed is a function of the ticks, so the interpreter and the AOT build must agree.
import gsap from 'gsap';

function show(label: string, v: number): void { console.log(label, Math.round(v * 1000) / 1000); }

const o = { x: 0, y: 10 };
const t1 = gsap.to(o, { x: 100, duration: 1, ease: 'none' });
let done = '';
t1.onComplete(() => { done += 'complete '; });
gsap.tick(0.25); show('x@0.25', o.x);
gsap.tick(0.25); show('x@0.5', o.x);
gsap.tick(0.6); show('x@end', o.x);
console.log(done.trim());

// from, fromTo, relative values, an ease
const p = { a: 50 };
gsap.from(p, { a: 0, duration: 1, ease: 'none' });
show('from@0', p.a);
gsap.tick(0.5); show('from@0.5', p.a);
const q = { v: 5 };
gsap.fromTo(q, { v: 0 }, { v: '+=10', duration: 2, ease: 'power2.in' });
gsap.tick(1); show('fromTo@1', q.v);

// a timeline: positions, labels, a callback
gsap.reset();
const m = { a: 0, b: 0, c: 0 };
const tl = gsap.timeline();
const order: string[] = [];
tl.to(m, { a: 10, duration: 1, ease: 'none' })
  .to(m, { b: 10, duration: 1, ease: 'none' }, '<0.5')
  .addLabel('end')
  .to(m, { c: 10, duration: 1, ease: 'none' }, 'end+=0.5')
  .call(() => { order.push('call'); }, 'end');
tl.onComplete(() => { order.push('done'); });
show('duration', tl.duration());
gsap.tick(1); show('a@1', m.a); show('b@1', m.b); show('c@1', m.c);
gsap.tick(1); show('b@2', m.b); show('c@2', m.c);
gsap.tick(1); show('c@3', m.c);
console.log(order.join(','));

// a stagger over several targets, repeat and yoyo
gsap.reset();
const items = [{ y: 0 }, { y: 0 }, { y: 0 }];
gsap.to(items, { y: 30, duration: 1, ease: 'none', stagger: 0.5 });
gsap.tick(1);
console.log(items.map((i: any) => Math.round(i.y)).join(','));
const r = { z: 0 };
gsap.to(r, { z: 10, duration: 1, ease: 'none', repeat: 1, yoyo: true });
gsap.tick(1.5); show('yoyo@1.5', r.z);
gsap.tick(0.5); show('yoyo@2', r.z);

// utils, eases
console.log(gsap.utils.clamp(0, 10, 15), gsap.utils.mapRange(0, 10, 0, 100, 5), gsap.utils.wrap(0, 5, 7), gsap.utils.snap(5, 12));
show('back', gsap.parseEase('back.out(1.7)')(0.5));
show('bounce', gsap.parseEase('bounce.out')(0.5));
show('elastic', gsap.parseEase('elastic.out(1, 0.3)')(0.3));
show('steps', gsap.parseEase('steps(4)')(0.6));
