import { PlayerLayout, isCompactScreen, mediaColumns } from '../../../examples/music-tree/src/core/responsive';
function check(ok: boolean, message: string): void { if (!ok) throw new Error(message); }
const widths = [320, 480, 640, 800, 1024, 1280, 1920];
const heights = [480, 800, 360, 480, 768, 720, 1080];
const layout = new PlayerLayout();
for (let i = 0; i < widths.length; i++) {
  for (let full = 0; full < 2; full++) {
    for (let handoff = 0; handoff < 2; handoff++) {
      const w = widths[i];
      const h = heights[i] - 30;
      const side = full === 1 ? 0 : isCompactScreen(w, h + 30) ? 64 : 240;
      layout.update(w, h, side, handoff === 1);
      check(layout.coverSize > 0 && layout.coverX >= side && layout.coverX + layout.coverSize <= w, 'cover outside screen');
      check(layout.textWidth >= 180 && layout.textX + layout.textWidth <= w, 'controls outside screen');
      check(layout.progressY < layout.transportY - 44 && layout.transportY + 44 < layout.modeY, 'overlapping controls');
      check(layout.volumeY + (handoff === 1 && layout.compact ? 118 : 26) <= layout.contentHeight, 'footer outside scroll content');
      if (layout.stacked) check(layout.coverY + layout.coverSize < layout.textY && layout.textY + 114 < layout.progressY, 'portrait metadata overlaps cover/seek');
    }
  }
}
layout.update(1024, 738, 240, false);
check(layout.left === 276 && layout.coverSize === 340 && layout.textX === 660 && layout.volumeY === 486, 'desktop layout changed');
check(mediaColumns(712) === 4 && mediaColumns(712, 5) === 5 && mediaColumns(180) === 1, 'grid columns');
console.log('responsive layout: PASS');
