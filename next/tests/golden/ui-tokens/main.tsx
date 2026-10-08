// The class-token parser (ZN-252): accepted tokens set the expected fields, unknown ones are refused (the diagnostic of isKnownClass).
// Each line: token, accepted, then pt pr pb pl | mt mr mb ml | autoMargins | gap gapX gapY | left top right bottom abs | w h wFrac hFrac | minW maxW minH maxH aspect.
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';
const toks = [
  'p-4', 'px-2', 'pt-1', 'm-2', 'mx-3', 'mt-1', 'ml-6', '-mt-2', '-m-4', '-mx-1', '-ml-px', 'mx-auto', 'ml-auto', 'mr-auto', 'mt-auto', 'm-auto', 'my-auto',
  'gap-2', 'gap-x-4', 'gap-y-2', 'gap-[10px]', 'inset-0', 'inset-4', 'inset-x-2', 'inset-y-1', 'inset-[8px]', 'top-2', 'left-3', 'right-1', 'bottom-0',
  'w-4', 'h-8', 'w-full', 'w-1/2', 'h-1/3', 'w-[50%]', 'h-[25%]', 'w-[2rem]', 'h-[1.5rem]', 'w-[100px]', 'h-[10vh]', 'w-[10vw]',
  'flex-row', 'flex-wrap', 'items-center', 'justify-between', 'grow', 'hidden', 'absolute', 'rounded-lg', 'border', 'opacity-50', 'bg-white', 'text-lg',
  'min-w-0', 'max-w-md', 'max-w-full', 'max-h-[300px]', 'min-h-screen', 'aspect-video', 'aspect-square', 'aspect-[4/3]', 'aspect-auto', 'w-screen', 'h-screen', 'size-8', 'max-w-bogus', 'aspect-foo', 'min-x-4',
  'grow-2', 'grow-[0.5]', 'shrink', 'shrink-0', 'shrink-[0.5]', 'flex-none', 'flex-auto', 'basis-0', 'basis-32', 'basis-1/2', 'basis-full', 'basis-auto', 'order-2', 'order-first', 'order-last', 'self-end', 'self-auto', 'content-between', 'content-evenly', 'flex-row-reverse', 'flex-col-reverse', 'grow-x', 'self-top', 'order-x', 'content-foo', 'shrink-x',
  'z-10', '-z-10', 'z-[5]', 'z-auto', 'z-x', 'relative', 'sticky', 'static', 'invisible', 'visible', 'pointer-events-none', 'pointer-events-auto', 'pointer-events-x',
  'snap-y', 'snap-x', 'snap-both', 'snap-none', 'snap-mandatory', 'snap-proximity', 'snap-start', 'snap-center', 'snap-end', 'snap-align-none', 'scroll-p-4', 'scroll-pt-2', 'scroll-px-3', 'scroll-pz-1', 'snap-foo',
  'border-dashed', 'border-dotted', 'border-solid', 'border-t-red-500', 'border-x-blue-600', 'border-b-white/50', 'border-t-nocolor-9', 'rounded-t-lg', 'rounded-tl-xl', 'rounded-br', 'rounded-l-full', 'rounded-b-[6px]', 'rounded-x-lg', 'rounded-tx',
  'ring', 'ring-0', 'ring-2', 'ring-4', 'ring-indigo-500', 'ring-offset-2', 'outline', 'outline-2', 'outline-none', 'outline-offset-1', 'outline-red-500', 'focus-visible:ring-2', 'focus-visible:ring-indigo-500', 'focus:ring-4', 'focus-visible:outline-none', 'ring-x', 'ring-offset-x', 'outline-foo', 'focus-visible:bg-red-500',
  'bogus', '-bogus-3', '-mx-auto', 'gap-x', 'mx-', 'w-[', 'inset-q-3', 'foo:bar', '-w-4', 'm-xyz',
];
const h = ui.createNode(ui.VIEW);
for (const t of toks) {
  ui.setClass(h, '');
  const ok = ui.isKnownClass(t);
  ui.setClass(h, ok ? t : '');
  const n = ui.inspectNode(h);
  if (n === null) continue;
  console.log(t, ok, `${n.pt} ${n.pr} ${n.pb} ${n.pl}`, `${n.mt} ${n.mr} ${n.mb} ${n.ml}`, n.mAuto, `${n.gap} ${n.gapX} ${n.gapY}`, `${n.left} ${n.top} ${n.right} ${n.bottom}`, n.abs, `${n.w} ${n.h}`, `${n.wFrac} ${n.hFrac}`, `${n.minW} ${n.maxW} ${n.minH} ${n.maxH}`, n.aspect, `${n.grow} ${n.shrink} ${n.basis} ${n.basisFrac}`, `${n.order} ${n.selfAlign} ${n.alignContent} ${n.reverse}`, `${n.z} ${n.invisible} ${n.noPointer} ${n.rel} ${n.sticky}`, `${n.snap} ${n.snapProx} ${n.snapAlign} ${n.spt} ${n.spb} ${n.spl} ${n.spr}`, `${n.borderStyle} ${n.bcT} ${n.bcR} ${n.bcB} ${n.bcL} | ${n.crTL} ${n.crTR} ${n.crBR} ${n.crBL}`, `${n.ringW} ${n.ringC} ${n.ringO} ${n.outW} ${n.outC} ${n.outO} ${n.outNone} | ${n.fRingW} ${n.fRingC} ${n.fRingO} ${n.fOutW} ${n.fOutC} ${n.fOutO} ${n.fVisible}`);
}
quit();
