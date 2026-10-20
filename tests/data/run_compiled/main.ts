// zinc run compiles a program that draws (ZN-398): the same output and frames as the interpreter, its arguments passed through.
import { onFrame, clear, rect, width } from 'zinc:gfx';
import { args } from 'zinc:sys';

console.log(`args ${args().join(',')} width ${width()}`);
let n = 0;
onFrame(() => { clear(0x203040); rect(10 + n, 10, 20, 20, 0xffcc00); n++; });
