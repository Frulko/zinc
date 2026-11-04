import {
  width, height, font, textWidth, drawText, rect, keyCount, keyKind, keyName,
  buttonEventCount, buttonEventButton, buttonEventDown, buttonEventX, buttonEventY,
  pointerDown, pointerX, pointerY, KeyKind, windowCtl,
} from 'zinc:gfx';
import { Sprite, uiState } from 'zinc:stage';
import { PixelGame } from './game';
import { PixelSurface } from './surface';
import { muted, toggleSound, pauseSound, setAmbience } from './audio';

const GAME_LABELS: string[] = ['1 BALOTE','2 PONT','3 LINGE','4 TENNIS','5 SKATE','6 QUAI','7 CANADA','8 PÊCHE','9 DROIT','0 STAND','- ESPACE','= LUNE'];

export class GameScene extends Sprite {
  active: PixelGame;
  paused: boolean = false;
  private games: PixelGame[];
  private surface = new PixelSurface();
  private time: number = 0;
  private lastPose: number = -1;
  private lastWidth: number = 0;
  private lastHeight: number = 0;
  private held: boolean = false;
  private dragging: boolean = false;
  private lastX: number = -1;
  private lastY: number = -1;
  private small: i32 = -1;
  private titleFont: i32 = -1;
  private body: i32 = -1;

  constructor(games: PixelGame[], selected: i32) {
    super('PixelPlays');
    this.games = games;
    this.active = games[selected];
    this.small = font('mono', 11);
    this.body = font('mono', 14);
    this.titleFont = font('mono', 21);
    this.select(selected);
  }
  select(index: i32): void {
    setAmbience('');
    this.active = this.games[index];
    this.active.init();
    this.active.update(0);
    this.surface.layout(this.active);
    this.paused = false;
    this.dragging = false;
    this.lastPose = -1;
    windowCtl(0, 3, 'Pixel Plays — ' + this.active.title, 0, 0);
    uiState.dirty = true;
  }
  private key(name: string, down: boolean): void {
    if (down && name.length === 1 && '1234567890-='.includes(name)) {
      const index = '1234567890-='.indexOf(name);
      if (index < this.games.length) this.select(index as i32);
      return;
    }
    if (down && (name === 'p' || name === 'P' || name === 'Escape')) {
      this.paused = !this.paused;
      this.dragging = false;
      this.active.pointer(0, 0, 3);
      pauseSound(this.paused);
    } else if (down && (name === 'm' || name === 'M')) toggleSound();
    else if (!this.paused && down && this.active.selectedSeason >= 0 && (name === 's' || name === 'S')) this.active.season(-1);
    else if (!this.paused && down && (name === 'r' || name === 'R')) this.active.reset();
    else if (!this.paused) this.active.key(name, down);
    uiState.dirty = true;
  }
  private press(x: number, y: number, down: boolean): void {
    if (down && y > height() - 36) {
      const index = Math.floor(x / (width() / this.games.length));
      if (index >= 0 && index < this.games.length) this.select(index as i32);
      return;
    }
    if (down && this.active.selectedSeason >= 0 && y >= 99 && y <= 128) {
      const start = width() / 2 - 200;
      if (x >= start && x < start + 400) this.active.season(Math.floor((x - start) / 100) as i32);
      uiState.dirty = true;
      return;
    }
    if (down && this.active.actionLabel !== '' && y >= height() - 138 && y <= height() - 94 && Math.abs(x - width() / 2) <= 115) {
      this.active.key('Enter', true);
      uiState.dirty = true;
      return;
    }
    if (down && y < 40) {
      if (x < 135) toggleSound();
      else if (x > width() - 140) this.key('p', true);
      uiState.dirty = true;
      return;
    }
    if (this.paused) return;
    if (down) {
      if (!this.surface.contains(x, y)) return;
      this.dragging = true;
    }
    if (this.dragging) {
      this.active.pointer(this.surface.sourceXAt(x), this.surface.sourceYAt(y), down ? 0 : 2);
      uiState.dirty = true;
    }
    if (!down) this.dragging = false;
  }
  override onUpdate(dt: number): void {
    this.surface.layout(this.active);
    for (let i = 0; i < keyCount(); i++) {
      const kind = keyKind(i);
      if (kind === KeyKind.Text) continue;
      const name = keyName(i);
      if (kind === KeyKind.Repeat && (name === ' ' || name === 'Enter')) continue;
      this.key(name, kind !== KeyKind.Up);
    }
    let events = 0;
    for (let i = 0; i < buttonEventCount(); i++) {
      if (buttonEventButton(i) !== 0) continue;
      this.press(buttonEventX(i), buttonEventY(i), buttonEventDown(i));
      events++;
    }
    const held = pointerDown(), x = pointerX(), y = pointerY();
    if (events === 0 && held !== this.held) this.press(x, y, held);
    if (this.dragging && held && (x !== this.lastX || y !== this.lastY) && !this.paused) {
      this.active.pointer(this.surface.sourceXAt(x), this.surface.sourceYAt(y), 1);
      uiState.dirty = true;
    }
    this.held = held; this.lastX = x; this.lastY = y;
    if (!this.paused) {
      this.time += dt;
      this.active.update(Math.min(.04, dt));
      const pose = Math.floor(this.time * 24);
      if (pose !== this.lastPose) uiState.dirty = true;
      this.lastPose = pose;
    }
    if (this.lastWidth !== width() || this.lastHeight !== height()) uiState.dirty = true;
    this.lastWidth = width(); this.lastHeight = height();
  }
  private centered(fontId: i32, y: number, label: string, color: u32): void {
    drawText(fontId, (width() - textWidth(fontId, label, 0)) / 2, y, label, color, 255, 0);
  }
  override onDraw(w: number, h: number): void {
    this.active.draw();
    this.surface.upload();
    this.surface.draw();
    drawText(this.small, 24, 20, muted ? 'SON COUPÉ [M]' : 'SON [M]', 0x8e8270, 255, 0);
    const pause = this.paused ? 'REPRENDRE [P]' : 'PAUSE [P]';
    drawText(this.small, w - textWidth(this.small, pause, 0) - 24, 20, pause, 0x8e8270, 255, 0);
    this.centered(this.titleFont, 43, this.active.title, 0x514b3e);
    this.centered(this.body, 76, this.active.score, 0x315e5a);
    if (this.active.selectedSeason >= 0) {
      for (let i = 0; i < this.active.seasonNames.length; i++) {
        const x = w / 2 - 200 + i * 100;
        const selected = i === this.active.selectedSeason;
        if (selected) rect(x + 2, 99, 96, 26, 0x315e5a);
        const label = this.active.seasonNames[i];
        drawText(this.small, x + (100 - textWidth(this.small, label, 0)) / 2, 106, label, selected ? 0xfff6db : 0x8e8270, 255, 0);
      }
    }
    if (this.active.actionLabel !== '') {
      rect(w / 2 - 115, h - 138, 230, 44, 0x315e5a);
      this.centered(this.body, h - 124, this.active.actionLabel, 0xfff6db);
    }
    this.centered(this.body, h - 78, this.active.status, 0x74674f);
    this.centered(this.small, h - 50, this.active.help, 0x9a8c76);
    const tabWidth = w / this.games.length;
    for (let i = 0; i < this.games.length; i++) {
      const label = GAME_LABELS[i];
      const center = (i + .5) * tabWidth;
      drawText(this.small, center - textWidth(this.small, label, 0) / 2, h - 24, label, this.games[i].id === this.active.id ? 0x315e5a : 0x9a8c76, 255, 0);
    }
    this.active.drawHud();
    if (this.paused) {
      rect(w / 2 - 100, h / 2 - 30, 200, 60, 0xfffdf1);
      this.centered(this.titleFont, h / 2 - 9, 'PAUSE', 0x315e5a);
    }
  }
}
