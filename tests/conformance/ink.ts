// zinc:ink: scripted pen input (pressure, pen up, eraser end, sub-pixel moves), undo, clear, JSON round trip, SVG.
import { Ink, parseStrokes } from 'zinc:ink';

const DOWN: i32 = 1, ERASER: i32 = 2, HOVER: i32 = 4;
const ink = new Ink();
ink.w = 100; ink.h = 80;
// a light-to-firm stroke, then a red dot
for (let i = 0; i <= 4; i++) ink.feed(10 + i * 10, 20, i / 4, DOWN);
ink.feed(50.2, 20.1, 1, DOWN);   // sub-pixel: dropped
ink.feed(50, 20, 0, HOVER);
ink.color = 0xe11d48; ink.width = 8;
ink.feed(70, 60, 0.5, DOWN);
ink.feed(70, 60, 0, 0);
console.log('strokes', ink.strokes.length, 'points', ink.strokes[0].count(), ink.strokes[1].count(), 'version', ink.version);
console.log('widths', ink.strokes[0].segWidth(0).toFixed(2), ink.strokes[0].segWidth(4).toFixed(2), ink.strokes[1].segWidth(0).toFixed(2));
const json = ink.toJSON();
console.log(json);
console.log(ink.toSVG());

// eraser end over the first stroke removes it; undo brings it back
ink.feed(31, 22, 0.3, DOWN | ERASER);
ink.feed(31, 22, 0, ERASER | HOVER);
console.log('after erase', ink.strokes.length, ink.strokes[0].color === 0xe11d48, 'undo?', ink.canUndo());
ink.undo();
console.log('after undo', ink.strokes.length);
ink.clear();
console.log('after clear', ink.strokes.length);
ink.undo();
console.log('after undo', ink.strokes.length);

// JSON round trip
const back = parseStrokes(json);
const copy = new Ink();
copy.w = 100; copy.h = 80;
copy.setStrokes(back);
console.log('round trip', copy.toJSON() === json, back.length, back[1].width, back[1].color === 0xe11d48);
