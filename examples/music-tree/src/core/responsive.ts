// Native screen layout; the desktop arrangement keeps its original dimensions.
export function isCompactScreen(width: number, height: number): boolean {
  return width < 900 || height < 600;
}

export function mediaColumns(width: number, maximum: i32 = 4): i32 {
  const gap = maximum === 5 ? 18 : 24;
  const minimum = maximum === 5 ? 120 : 140;
  return Math.max(1, Math.min(maximum, Math.floor((width + gap) / (minimum + gap)))) as i32;
}

export class PlayerLayout {
  compact: boolean = false;
  stacked: boolean = false;
  padding: number = 36;
  left: number = 0;
  coverX: number = 0;
  coverY: number = 0;
  coverSize: number = 0;
  textX: number = 0;
  textY: number = 0;
  textWidth: number = 0;
  progressY: number = 0;
  transportY: number = 0;
  modeY: number = 0;
  volumeY: number = 0;
  contentHeight: number = 0;

  update(width: number, height: number, sidebar: number, handoff: boolean): void {
    const full = sidebar === 0;
    this.compact = isCompactScreen(width, height);
    this.padding = this.compact ? 20 : full ? 64 : 36;
    this.left = sidebar + this.padding;
    const available = Math.max(1, width - this.left - this.padding);
    this.stacked = this.compact && available < 520;
    this.contentHeight = Math.max(height, this.compact ? this.stacked ? 680 : 450 : height) + (this.compact && handoff ? 92 : 0);
    this.coverY = this.compact ? 72 : full ? 86 : 96;
    if (!this.compact) {
      this.coverSize = full ? 430 : 340;
      this.coverX = this.left;
      this.textX = this.left + this.coverSize + (full ? 64 : 44);
      this.textWidth = width - this.textX - this.padding;
      this.textY = this.coverY + 6;
      this.progressY = this.coverY + this.coverSize * 0.58;
      this.transportY = this.coverY + this.coverSize * 0.79;
      this.modeY = this.coverY + this.coverSize - 4;
      this.volumeY = this.coverY + this.coverSize + 50;
    } else {
      const bottomReserve = handoff ? 92 : 0;
      this.volumeY = this.contentHeight - 42 - bottomReserve;
      if (this.stacked) {
        this.coverSize = Math.max(80, Math.min(available, this.contentHeight - 430 - bottomReserve));
        this.coverX = this.left + (available - this.coverSize) / 2;
        this.textX = this.left;
        this.textWidth = available;
        this.textY = this.coverY + this.coverSize + 18;
        this.progressY = this.volumeY - 166;
        this.transportY = this.volumeY - 98;
        this.modeY = this.volumeY - 40;
      } else {
        this.coverSize = Math.max(80, Math.min(340, (available - 24) * 0.43, this.contentHeight - 168 - bottomReserve));
        this.coverX = this.left;
        this.textX = this.left + this.coverSize + 24;
        this.textWidth = width - this.textX - this.padding;
        this.textY = this.coverY + 6;
        this.progressY = this.volumeY - 166;
        this.transportY = this.volumeY - 98;
        this.modeY = this.volumeY - 40;
      }
    }
  }
}
