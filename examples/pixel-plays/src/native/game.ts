export class PixelGame {
  id: string;
  title: string;
  help: string;
  score: string = '';
  status: string = '';
  actionLabel: string = '';
  seasonNames: string[] = [];
  selectedSeason: i32 = -1;
  cropX: number = 0;
  cropY: number = 0;
  cropWidth: number = 360;
  cropHeight: number = 280;
  constructor(id: string, title: string, help: string) {
    this.id = id;
    this.title = title;
    this.help = help;
  }
  init(): void {}
  reset(): void {}
  update(dt: number): void {}
  draw(): void {}
  drawHud(): void {}
  key(name: string, down: boolean): void {}
  pointer(x: number, y: number, phase: i32): void {}
  season(index: i32): void {}
}
