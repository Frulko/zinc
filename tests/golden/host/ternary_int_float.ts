// A conditional with an i32 branch and a number branch is a number, whichever comes first, also with no type asked for (ZN-880: the
// width of a picture run, an i32, truncated the text widths beside it).
function iw(): i32 { return 3; }
function fw(): number { return 2.5; }
function a1(a: boolean, b: boolean): number { return a ? (b ? iw() : 0) : fw(); }
function a2(a: boolean): number { let w: number = 0; w += a ? iw() : fw(); return w; }
function a3(a: boolean, b: boolean): number { const v = a ? (b ? iw() : 0) : fw(); return v; }
function a4(a: boolean): number { const v = a ? fw() : iw(); return v; }
console.log(a1(false, true), a2(false), a3(false, true), a4(true), a2(true));
