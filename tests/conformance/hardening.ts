// Security hardening regressions (docs/reports/security-audit.md): each block crashed, hung or corrupted memory
// before its fix (visible under --debug, ASan + UBSan).
import { onFrame, path, polygon, clear, quit } from 'zinc:gfx';

// a pooled object that was weakly referenced goes back to its pool (was: freed with the system allocator)
@pooled(2)
class Node { @weak peer: Node | null = null; v = 0; }
function pooledWeak(): number {
  const a = new Node(), b = new Node();
  a.peer = b; b.peer = a;
  a.v = 1; b.v = 2;
  return a.peer!.v + b.peer!.v;
}
let s = 0;
for (let i = 0; i < 4; i++) s += pooledWeak();
console.log('pooled weak', s);

// an arena disposed while a newer one is still open leaves the chain (was: the newer one kept a dangling link)
let keep: Arena | null = null;
function arenas(): void {
  using a = Arena.frame(1024);
  keep = Arena.frame(1024);
}
arenas();
keep = null;
console.log('arenas ok');

// lastIndexOf with an empty needle never ended; it is one backward scan now
console.log('abc'.lastIndexOf(''), 'abcabc'.lastIndexOf('bc'), 'abcabc'.lastIndexOf('bc', 3), 'héllo wörld'.lastIndexOf('ö'),
  'aaa'.lastIndexOf('a', -5), 'x😀y😀'.lastIndexOf('😀'), 'abc'.lastIndexOf('abcd'));

// contour counts are program data: negative, fractional, huge or NaN counts and NaN points draw nothing wrong
let frames = 0;
onFrame(() => {
  clear(0x102030);
  path([-3, 1, 2, 3, 4], 0xffffff, 255);
  path([2147483648, 0, 0, 10, 10, 20, 0], 0xffffff, 255);
  path([4294967295, 1, 1], 0xffffff, 255);
  path([NaN, 1, 1, 2, 2], 0xffffff, 255);
  path([2.5, 0, 0, 10, 0, 10, 10, 3, 0, 0, 5, 5, 0, 5], 0xff0000, 255);
  path([3, 0, 0, NaN, NaN, 10, 10], 0x00ff00, 255);
  polygon([0, 0, 1e30, 1e30, -1e30, 5, NaN, 2], 0x0000ff, 128);
  if (++frames === 2) { console.log('paths ok'); quit(); }
});
