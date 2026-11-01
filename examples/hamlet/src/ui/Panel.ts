import { font, textWidth, drawText, rrect, rect, shadow } from 'zinc:gfx';

// A small live-tweaking panel in the look of Tweakpane (dark blue-grey, 20 px blades, folders, sliders, checkboxes, lists, buttons, a graph monitor).
// Widgets bind to a getter and a setter, so any value of the game can be edited without reflection. Immediate mode: draw() paints, press/drag/release feed input.
const BASE = 0x28292e, FOLDER = 0x2f3036, INPUT = 0x37383d, LABEL = 0xbbbcc4, VALUE = 0xbbbcc4, FILL = 0x4a4b53, BUTTON = 0xaaabb3, BUTTON_TEXT = 0x28292e, ACCENT = 0x9b9cff;
const ROW = 20, GAP = 4, PAD = 4, LABEL_SHARE = .4;

const KIND_FOLDER = 0, KIND_NUMBER = 1, KIND_BOOL = 2, KIND_LIST = 3, KIND_BUTTON = 4, KIND_MONITOR = 5, KIND_TEXT = 6;

class Row {
  kind: number = KIND_TEXT;
  label: string = '';
  folder: number = -1;                    // index of the folder row it belongs to, -1 for none
  open: boolean = true;                   // folders only
  min: number = 0; max: number = 1; step: number = .01;
  options: string[] = [];
  read: () => number = (): number => 0;
  write: (v: number) => void = (v: number): void => {};
  text: () => string = (): string => '';
  click: () => void = (): void => {};
  samples: number[] = [];                 // monitor ring
}

export class Panel {
  x: number = 0; y: number = 0; width: number = 280;
  title: string;
  open: boolean = true;
  private rows: Row[] = [];
  private current: number = -1;           // the folder new rows go into
  private font: i32 = -1;
  private active: number = -1;
  private dropdown: number = -1;          // the list row whose options are open            // the slider being dragged
  onChange: () => void = (): void => {};  // after any edit

  constructor(title: string) { this.title = title; this.font = font('mono', 11); }

  folder(label: string, open: boolean = true): void {
    const row = new Row(); row.kind = KIND_FOLDER; row.label = label; row.open = open;
    this.rows.push(row); this.current = this.rows.length - 1;
  }
  private add(row: Row): Row { row.folder = this.current; this.rows.push(row); return row; }
  number(label: string, read: () => number, write: (v: number) => void, min: number, max: number, step: number): void {
    const row = new Row(); row.kind = KIND_NUMBER; row.label = label; row.read = read; row.write = write; row.min = min; row.max = max; row.step = step; this.add(row);
  }
  bool(label: string, read: () => boolean, write: (v: boolean) => void): void {
    const row = new Row(); row.kind = KIND_BOOL; row.label = label; row.read = (): number => read() ? 1 : 0; row.write = (v: number): void => write(v !== 0); this.add(row);
  }
  list(label: string, options: string[], read: () => number, write: (v: number) => void): void {
    const row = new Row(); row.kind = KIND_LIST; row.label = label; row.options = options; row.read = read; row.write = write; this.add(row);
  }
  button(label: string, click: () => void): void {
    const row = new Row(); row.kind = KIND_BUTTON; row.label = label; row.click = click; this.add(row);
  }
  text(label: string, text: () => string): void {
    const row = new Row(); row.kind = KIND_TEXT; row.label = label; row.text = text; this.add(row);
  }
  /** A graph monitor: push() a sample every frame, the last 60 are drawn. */
  monitor(label: string): number {
    const row = new Row(); row.kind = KIND_MONITOR; row.label = label; this.add(row);
    return this.rows.length - 1;
  }
  push(monitorRow: number, sample: number): void {
    const row = this.rows[monitorRow];
    row.samples.push(sample);
    if (row.samples.length > 60) row.samples.shift();
  }

  private visible(row: Row): boolean { return row.kind === KIND_FOLDER || row.folder < 0 || this.rows[row.folder].open; }
  private rowY(index: number): number {
    let y = this.y + ROW + GAP;                     // under the title
    for (let i = 0; i < index; i++) if (this.visible(this.rows[i])) y += (this.rows[i].kind === KIND_MONITOR ? 2 * ROW : ROW) + GAP;
    return y;
  }
  height(): number {
    if (!this.open) return ROW + 2 * PAD;
    return this.rowY(this.rows.length) - this.y + PAD - GAP;
  }
  contains(px: number, py: number): boolean { return px >= this.x && px < this.x + this.width && py >= this.y && py < this.y + this.height(); }

  private rowAt(py: number): number {
    for (let i = 0; i < this.rows.length; i++) {
      if (!this.visible(this.rows[i])) continue;
      const top = this.rowY(i);
      if (py >= top && py < top + (this.rows[i].kind === KIND_MONITOR ? 2 * ROW : ROW)) return i;
    }
    return -1;
  }
  private trackX(): number { return this.x + PAD + (this.width - 2 * PAD) * LABEL_SHARE; }
  private trackWidth(): number { return (this.width - 2 * PAD) * (1 - LABEL_SHARE) - 4; }

  private setNumber(row: Row, px: number): void {
    const t = Math.max(0, Math.min(1, (px - this.trackX()) / this.trackWidth()));
    const v = Math.round((row.min + t * (row.max - row.min)) / row.step) * row.step;
    row.write(Math.max(row.min, Math.min(row.max, Math.round(v * 1000) / 1000)));
    this.onChange();
  }

  /** True when the press landed on the panel (the game must not act on it). */
  press(px: number, py: number): boolean {
    if (this.dropdown >= 0) {
      const row = this.rows[this.dropdown], top = this.rowY(this.dropdown) + ROW;
      this.dropdown = -1;
      if (px >= this.trackX() && px < this.trackX() + this.trackWidth() && py >= top) {
        const k = Math.floor((py - top) / ROW);
        if (k < row.options.length) { row.write(k); this.onChange(); }
        return true;
      }
    }
    if (!this.contains(px, py)) return false;
    if (py < this.y + ROW + GAP) { this.open = !this.open; return true; }
    const i = this.rowAt(py);
    if (i < 0) return true;
    const row = this.rows[i];
    if (row.kind === KIND_FOLDER) row.open = !row.open;
    else if (row.kind === KIND_BOOL) { row.write(row.read() === 0 ? 1 : 0); this.onChange(); }
    else if (row.kind === KIND_LIST) this.dropdown = i;
    else if (row.kind === KIND_BUTTON) row.click();
    else if (row.kind === KIND_NUMBER) { this.active = i; this.setNumber(row, px); }
    return true;
  }
  /** Closes an open select; true when there was one (Escape). */
  closeMenu(): boolean { const was = this.dropdown >= 0; this.dropdown = -1; return was; }
  drag(px: number): void { if (this.active >= 0) this.setNumber(this.rows[this.active], px); }
  release(): void { this.active = -1; }
  dragging(): boolean { return this.active >= 0; }

  draw(): void {
    const h = this.height();
    shadow(this.x, this.y, this.width, h, 6, 12, 0x000000, 70);
    rrect(this.x, this.y, this.width, h, 6, BASE, 238);
    this.label(this.x + PAD + 4, this.y + PAD + 4, (this.open ? '▾ ' : '▸ ') + this.title, LABEL);
    if (!this.open) return;
    this.drawRows();
    this.drawDropdown();
  }
  private drawRows(): void {
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      if (!this.visible(row)) continue;
      const y = this.rowY(i), x = this.x + PAD, w = this.width - 2 * PAD;
      if (row.kind === KIND_FOLDER) {
        rrect(x, y, w, ROW, 2, FOLDER, 255);
        this.label(x + 6, y + 5, (row.open ? '▾ ' : '▸ ') + row.label, LABEL);
        continue;
      }
      const inset = row.folder >= 0 ? 6 : 0;
      this.label(x + inset + 4, y + 5, row.label, LABEL);
      const tx = this.trackX(), tw = this.trackWidth();
      if (row.kind === KIND_NUMBER) {
        const v = row.read(), t = (v - row.min) / (row.max - row.min);
        rrect(tx, y + 2, tw, ROW - 4, 2, INPUT, 255);
        rrect(tx, y + 2, Math.max(2, tw * Math.max(0, Math.min(1, t))), ROW - 4, 2, FILL, 255);
        rect(tx + tw * Math.max(0, Math.min(1, t)) - 1, y + 2, 2, ROW - 4, VALUE);
        const label = String(Math.round(v * 100) / 100);
        this.label(tx + tw - textWidth(this.font, label, 0) - 5, y + 5, label, VALUE);
      } else if (row.kind === KIND_BOOL) {
        rrect(tx, y + 2, ROW - 4, ROW - 4, 2, INPUT, 255);
        if (row.read() !== 0) rrect(tx + 3, y + 5, ROW - 10, ROW - 10, 1, ACCENT, 255);
      } else if (row.kind === KIND_LIST) {
        rrect(tx, y + 2, tw, ROW - 4, 2, INPUT, 255);
        const label = row.options[row.read()];
        this.label(tx + 5, y + 5, label, VALUE);
        this.label(tx + tw - 12, y + 5, i === this.dropdown ? '▴' : '▾', LABEL);
      } else if (row.kind === KIND_BUTTON) {
        rrect(x, y, w, ROW, 2, BUTTON, 255);
        this.label(x + (w - textWidth(this.font, row.label, 0)) / 2, y + 5, row.label, BUTTON_TEXT);
      } else if (row.kind === KIND_TEXT) {
        rrect(tx, y + 2, tw, ROW - 4, 2, INPUT, 255);
        this.label(tx + 5, y + 5, row.text(), VALUE);
      } else if (row.kind === KIND_MONITOR) {
        rrect(tx, y + 2, tw, 2 * ROW - 4, 2, INPUT, 255);
        const last = row.samples.length > 0 ? row.samples[row.samples.length - 1] : 0;
        let peak = 1;
        for (const s of row.samples) peak = Math.max(peak, s);
        for (let k = 0; k < row.samples.length; k++) {
          const bar = Math.max(1, (2 * ROW - 10) * row.samples[k] / peak);
          rect(tx + 2 + k * (tw - 4) / 60, y + 2 * ROW - 4 - bar, Math.max(1, (tw - 4) / 60 - 1), bar, k === row.samples.length - 1 ? ACCENT : FILL);
        }
        this.label(x + 10, y + 22, String(Math.round(last)), VALUE);
      }
    }
  }
  /** The open select: its options listed under the row, the current one marked. Drawn last so it covers what is below. */
  private drawDropdown(): void {
    if (this.dropdown < 0) return;
    const row = this.rows[this.dropdown], tx = this.trackX(), tw = this.trackWidth(), top = this.rowY(this.dropdown) + ROW, h = row.options.length * ROW + 4;
    shadow(tx, top, tw, h, 3, 8, 0x000000, 90);
    rrect(tx, top, tw, h, 3, 0x1f2024, 255);
    for (let k = 0; k < row.options.length; k++) {
      const y = top + 2 + k * ROW, current = k === row.read();
      if (current) rrect(tx + 2, y, tw - 4, ROW, 2, FILL, 255);
      this.label(tx + 8, y + 5, row.options[k], current ? 0xffffff : LABEL);
    }
  }
  private label(x: number, y: number, text: string, color: u32): void { drawText(this.font, x, y, text, color, 255, 0); }
}
