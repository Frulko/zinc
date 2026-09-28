// Code editor extensions of text fields (examples/zed-editor): editView / scrollEditTo / editRowOf, smooth wheel
// scrolling (trackpad 1:1 with a rubber band, eased mouse notches), setMarks / setEditColors / setHighlightAt, rows of a
// non-ASCII text, lazy canvases, block comments in tsHighlight. Same output on sim and native.
import { createNodeRef } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';

const lines: string[] = [];
for (let i = 0; i < 60; i++) lines.push(i % 7 === 3 ? '' : `${'  '.repeat(i % 3)}line ${i} é`);
const text = lines.join('\n');
const codeRef = createNodeRef(), wrapRef = createNodeRef();
let lazyDraws = 0;
const starts: i32[] = [];
const r = (v: number): number => Math.round(v);

const root = ui.createNode(ui.VIEW);
ui.insert(root, <view class="flex-col p-2 gap-2 h-full">
  <textarea ref={codeRef} class="w-[300] h-[200] font-mono text-sm" lineNumbers wrap={false} value={text} />
  <textarea ref={wrapRef} class="w-[160] h-[80] font-mono text-sm" value={'short\n' + 'word '.repeat(20) + '\nüber ende'} />
  <canvas class="w-[10] h-[10]" style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => { lazyDraws++; }} />
</view>, -1);
ui.pointerAt(0, 0, false);  // test hooks drive the input from now on

function view(h: i32): string { return ui.editView(h).map((v: number) => `${r(v)}`).join(','); }
let f = 0, lazyAt = 0;
ui.mount(root, 0x0f172a, (dt: number) => {
  f++;
  const h = codeRef.node, w = wrapRef.node;
  if (f === 2) {
    console.log('view', view(h));
    ui.setHighlightAt(h, (line: string, start: i32): i32[] => { if (starts.indexOf(start) < 0) starts.push(start); return [line.length, 0x88ccff]; });
    ui.setMarks(h, [10, 20, 0x334455, ui.MARK_LINE, 30, 34, 0xffaa00, ui.MARK_FILL, 40, 41, 0x888888, ui.MARK_BOX, 50, 55, 0xff0000, ui.MARK_SQUIGGLE, 50, 50, 0xff0000, ui.MARK_GUTTER]);
    ui.setEditColors(h, [0x555555, 0xffffff, -2, 0x3355aa, 0x66aaff, 0x333333]);
    console.log('row of 100', ui.editRowOf(h, 100), 'row of end', ui.editRowOf(h, text.length));
    ui.scrollEditTo(h, 0, 100000);
    console.log('clamped', view(h));
    ui.scrollEditTo(h, 0, 0);
    // wrapped rows of a non-ASCII text
    console.log('wrap view', view(w), 'row of "über"', ui.editRowOf(w, ui.getValue(w).indexOf('über')));
    console.log('block comments', ui.tsHighlight('a /* b */ c').join(','), '|', ui.tsHighlight('x /* open').join(','));
  }
  if (f === 3) console.log('highlightAt row starts', starts.slice(0, 5).join(','));
  if (f === 4) lazyAt = lazyDraws;
  if (f === 12) {
    // idle frames: a plain canvas would be drawn on every frame (and the whole window with it), a lazy one is not
    console.log('idle: lazy canvas draws', lazyDraws - lazyAt);
    lazyAt = lazyDraws;
    ui.repaint();
  }
  if (f === 13) console.log('repaint draws the lazy canvas', lazyDraws - lazyAt);
  if (f === 14) {
    // trackpad: fractional steps (1/10 px) scroll 1:1 at once
    const b = ui.screenBox(h);
    ui.wheelAt(b[0] + 50, b[1] + 50, -2.5);
    console.log('trackpad', r(ui.editView(h)[1]));
    // past the top the content stretches (a rubber band), then springs back once the input is quiet
    ui.scrollEditTo(h, 0, 0);
    ui.wheelAt(b[0] + 50, b[1] + 50, 3.5);
    console.log('overscrolled', r(ui.editView(h)[1]));
  }
  if (f === 45) {
    console.log('sprung back', r(ui.editView(h)[1]));
    // mouse notches ease toward 60 px each
    const b = ui.screenBox(h);
    ui.wheelAt(b[0] + 50, b[1] + 50, -2);
    console.log('eased: not there at once', ui.editView(h)[1] < 120);
  }
  if (f === 58) {
    console.log('eased to about 120', Math.abs(ui.editView(h)[1] - 120) < 4);
    quit();
  }
});
