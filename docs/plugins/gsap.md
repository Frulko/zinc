# gsap: GSAP in Zinc (`import gsap from 'gsap'`)

Two ways to use [GSAP](https://gsap.com) with Zinc, for the two kinds of program:

| | What it is | Runs in |
|---|---|---|
| **`plugins/gsap`** (this plugin) | GSAP's core API written in typed Zinc: tweens, timelines, eases, staggers, position parameters, labels, utils | `zinc run` (interpreter), `zinc build` (AOT, a native executable), `zinc export`, every target the language reaches, byte for byte the same |
| **the real library** (`examples/js-gsap`) | GSAP 3.15.0 whole, every plugin in `dist/all.js` (ScrollTrigger, Flip, Draggable, SplitText, MorphSVG...), on the QuickJS engine with the web environment | `zinc run` of a `.js` project (`"web": true`), `--engine quickjs` |

The first is for programs written in Zinc and shipped as native code; the second is for JavaScript projects that want the library as it
is. A JavaScript project cannot be `zinc build`-compiled (a `.js` entry is type-checked by the typed compiler), which is why the typed
port exists.

## The typed port

```ts
import gsap from 'gsap';

const box = { x: 0, y: 0, scale: 1 };
gsap.to(box, { x: 300, duration: 1.2, ease: 'power3.out' })
  .onComplete(() => console.log('there'));

const tl = gsap.timeline({ repeat: -1, yoyo: true, defaults: { ease: 'back.out(1.7)' } });
tl.to(box, { y: 120, duration: 0.6 })
  .to(box, { scale: 2, duration: 0.4 }, '<0.2')       // position parameter, as GSAP's
  .addLabel('end')
  .call(() => console.log('label reached'), 'end');

// once a frame, with the frame's delta in seconds: the program owns the clock
onFrame((dt: number) => { gsap.ticker.tick(dt); /* draw box.x, box.y */ });
```

What is there: `gsap.to / from / fromTo / set / timeline / delayedCall / killTweensOf / getTweensOf / defaults / registerEase / parseEase`,
`gsap.ticker` (`add`, `remove`, `tick`, `time`, `frame`), `gsap.utils` (`clamp`, `mapRange`, `normalize`, `interpolate`, `random`,
`snap`, `wrap`, `wrapYoyo`, `toArray`). Tween vars: `duration`, `delay`, `ease`, `repeat` (`-1`: forever), `repeatDelay`, `yoyo`,
`stagger` (a number or `{ each, amount, from: 'start' | 'end' | 'center' | 'edges' | 'random' | index }`), `paused`, `immediateRender`,
and any numeric property of the target (a `{}` literal, or an instance of a class: its fields), also as `"+=50"`, `"-=20"`, `"*=2"`.
Eases: `none`, `power1..4`, `sine`, `expo`, `circ`, `back(overshoot)`, `elastic(amplitude, period)`, `bounce`, `steps(n)`, each `.in`,
`.out`, `.inOut`. Animation controls: `play`, `pause`, `resume`, `reverse`, `restart`, `seek`, `progress`, `timeScale`, `kill`, `delay`,
`repeat`, `yoyo`, `isActive`. Timelines: `to / from / fromTo / set / add / addLabel / call`, position parameters (`3`, `"+=1"`,
`"-=0.5"`, `"<"`, `">"`, `"<0.5"`, `"label"`, `"label+=0.5"`), `defaults`.

What is different, and why (the typed language cannot make a function a value of a plain object):

- **Callbacks** are not keys of the vars object: `tween.onComplete(fn)`, `onStart`, `onUpdate`, `onRepeat`, or GSAP's own
  `tween.eventCallback('onComplete', fn)`; in a timeline, `tl.call(fn, position)`.
- **Custom ease functions** are registered by name: `gsap.registerEase('mine', (p: number): number => p * p)`, then `ease: 'mine'`.
- **The clock** is yours: call `gsap.ticker.tick(dt)` once a frame. Nothing runs on its own, so a program (and its test) is
  deterministic; `gsap.tick(dt)` is a shorthand.
- **Values** are numbers (strings are read as a number or as a relative `+=`/`-=`/`*=`/`/=`; units such as `px` are not carried).
  Colours, SVG paths, DOM elements and the plugins are not in the typed port.
- `gsap.utils.random` draws from a fixed-seed generator.

## The whole library on the QuickJS engine

GreenSock's licence ("no charge") is not an open-source one, so GSAP is not in this repository: `next/tools/test-lib gsap-3.15.0`
downloads `dist/all.js` from GSAP's own npm release into Zinc's cache and checks its sha256. `examples/js-gsap` loads it with a script
tag, as a page would, and animates a timeline on a canvas 2D:

```sh
cd next
tools/test-lib gsap-3.15.0
build/zinc run ../examples/js-gsap
```

`ScrollTrigger`, `Flip` and the DOM plugins find their DOM in the web environment (`"web": true`): see
[docs/guide/09-web-apis.md](../guide/09-web-apis.md) for what the environment has.

## Tests

`next/tests/t1/gsap.sh` (the typed port: interpreter and AOT build against `tests/golden/gsap/gsap_core.out`),
`next/tests/t1/example_js_gsap.sh` (the real library, frame 70 against `examples/js-gsap/screenshot.png`; skipped when GSAP cannot be
downloaded).
