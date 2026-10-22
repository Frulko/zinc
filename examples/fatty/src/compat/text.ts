import { drawImageRect, startTextInput, stopTextInput, keyCount, keyKind, keyName } from 'zinc:gfx';
import { uiState } from 'zinc:stage';
import { Sprite } from './display';
import { Event } from './events';
import { atlasData, loadImage, Glyph } from './textures';

class BitmapFont {
  image = loadImage('typo/Cubano_green_64.png');
  lineHeight = atlasData().lineHeight;
  glyphs = new Map<number, Glyph>();
  kernings = new Map<number, number>();
  constructor() {
    for (const glyph of atlasData().glyphs) this.glyphs.set(Number(glyph.id),glyph);
    for (const kern of atlasData().kernings) this.kernings.set(Number(kern.first)*65536+Number(kern.second),Number(kern.amount));
  }
}
let bitmapFont: BitmapFont | null = null;
export class TextField extends Sprite {
  color = 0xffffff;
  private bitmap: BitmapFont;
  constructor(w: number, h: number, public text = '', public fontName = 'Cubano', public fontSize = 64) {
    super(); this.width = w; this.height = h;
    if (!bitmapFont) bitmapFont = new BitmapFont();
    this.bitmap = bitmapFont;
  }
  override onDraw(w: number, h: number): void {
    if (!this.text) return;
    const data = this.bitmap;
    const scale = this.fontSize/64;
    let length = 0;
    let previous = -1;
    for (let i = 0; i < this.text.length; i++) {
      const id = this.text.charCodeAt(i);
      const glyph = data.glyphs.get(id);
      if (!glyph) continue;
      const kern = data.kernings.get(previous*65536+id);
      length += Number(glyph.xadvance)+(kern || 0);
      previous = id;
    }
    let x = (w-length*scale)/2;
    const y = (h-data.lineHeight*scale)/2;
    previous = -1;
    for (let i = 0; i < this.text.length; i++) {
      const id = this.text.charCodeAt(i);
      const glyph = data.glyphs.get(id);
      if (!glyph) continue;
      const kern = data.kernings.get(previous*65536+id);
      x += (kern || 0)*scale;
      drawImageRect(data.image,Number(glyph.x),Number(glyph.y),Number(glyph.width),Number(glyph.height),
        x+Number(glyph.xoffset)*scale,y+Number(glyph.yoffset)*scale,Number(glyph.width)*scale,Number(glyph.height)*scale,
        Math.round(this.worldAlpha*255),0,0,this.color,0);
      x += Number(glyph.xadvance)*scale;
      previous = id;
    }
  }
}
export class TextInput extends TextField {
  minTouchWidth = 150; minTouchHeight = 30;
  textEditorProperties = { fontFamily: 'Cubano', fontSize: 22, color: 0xfd5d00 };
  private focused = false;
  private static focusedInput: TextInput | null = null;
  constructor() {
    super(150,30,'','Cubano',22);
    this.addEventListener(Event.TRIGGERED, () => this.setFocus());
  }
  setFocus(): void {
    if (TextInput.focusedInput) TextInput.focusedInput.focused = false;
    TextInput.focusedInput = this;
    this.focused = true;
    startTextInput(this.tx,this.ty,this.width,this.height);
  }
  static routeKeyboard(): void {
    if (TextInput.focusedInput) TextInput.focusedInput.processKeyboard();
  }
  private processKeyboard(): void {
    if (!this.focused) return;
    for (let i = 0; i < keyCount(); i++) {
      const kind = keyKind(i), key = keyName(i);
      if (kind === 3) {
        if (this.text === 'Ton nom') this.text = '';
        this.text = (this.text+key).slice(0,24);
      }
      if ((kind === 0 || kind === 2) && key === 'Backspace') this.text = this.text.slice(0,-1);
      if (kind === 0 && (key === 'Enter' || key === 'Escape')) { this.focused = false; TextInput.focusedInput = null; stopTextInput(); }
      uiState.dirty = true;
    }
  }
  override onRemovedFromStage(): void {
    if (TextInput.focusedInput === this) { TextInput.focusedInput = null; this.focused = false; stopTextInput(); }
  }
  override onDraw(w: number, h: number): void {
    this.fontSize = this.textEditorProperties.fontSize;
    this.color = this.textEditorProperties.color;
    super.onDraw(w,h);
  }
}
