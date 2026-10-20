import { Emitter } from 'zinc:events';
import { TARGET, PROFILE, HEAP_BYTES, NUMBERS, SCREEN_W, SCREEN_H, FPU, POINTER, KEYBOARD, TOUCH, EINK } from 'zinc:platform';
const e = new Emitter<number>();
const log = (v: number): void => { console.log('on', v); };
e.on(log);
e.once((v: number) => { console.log('once', v); });
console.log(e.listenerCount());
e.emit(1);
console.log(e.listenerCount());
e.emit(2);
e.off(log);
e.emit(3);
console.log(e.listenerCount());
// listeners added during an emit wait for the next one
const f = new Emitter<string>();
f.on((s: string) => { console.log('first', s); f.on((t: string) => { console.log('late', t); }); });
f.emit('a');
f.emit('b');
console.log(TARGET === PROFILE, HEAP_BYTES > 0, NUMBERS, SCREEN_W, SCREEN_H, FPU, POINTER, KEYBOARD, TOUCH, EINK);
