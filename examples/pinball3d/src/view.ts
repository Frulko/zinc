// A layout of the table file placed in the window: the layout is drawn for one window size (landscape 1280 x 800,
// portrait 800 x 1280...), another window shows it whole, scaled and centred. The game takes the portrait layout when
// its window is taller than wide and the landscape one otherwise, unless an option forces one.
import { LayoutDef, TableDef } from '../../pinball-kit/format/table';

export class View {
  layout: LayoutDef;
  /** 'landscape' or 'portrait'. */
  name: string;
  scale: number = 1;
  ox: number = 0;
  oy: number = 0;

  /** `force`: 'landscape', 'portrait', or anything else for the choice by the window. */
  constructor(t: TableDef, width: number, height: number, force: string) {
    this.name = force === 'landscape' || force === 'portrait' ? force : height > width ? 'portrait' : 'landscape';
    this.layout = this.name === 'portrait' ? t.layouts.portrait : t.layouts.landscape;
    this.fit(width, height);
  }
  /** Places the layout in a window of this size. */
  fit(width: number, height: number): void {
    const w = this.layout.window[0], h = this.layout.window[1];
    this.scale = Math.min(width / w, height / h);
    this.ox = Math.round((width - w * this.scale) / 2);
    this.oy = Math.round((height - h * this.scale) / 2);
  }
  /** A box of the layout ([x, y, w, h]) in window pixels. */
  x(box: number[]): number { return Math.round(this.ox + box[0] * this.scale); }
  y(box: number[]): number { return Math.round(this.oy + box[1] * this.scale); }
  w(box: number[]): number { return Math.round(box[2] * this.scale); }
  h(box: number[]): number { return Math.round(box[3] * this.scale); }
}
