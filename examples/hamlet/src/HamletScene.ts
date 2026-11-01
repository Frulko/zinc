import {
  width, height, font, startTextInput, stopTextInput, textWidth, drawText, rect, keyCount, keyKind, keyName, buttonEventCount, buttonEventButton, buttonEventDown,
  buttonEventX, buttonEventY, pointerDown, pointerX, pointerY, KeyKind, windowCtl, wheel, pinch, scrollDX, scrollDY, scrollPhase,
} from 'zinc:gfx';
import { Sprite, uiState } from 'zinc:stage';
import { PixelSurface, PixelGame, unproject, sound, setAmbience, toggleSound, pauseSound, muted } from './pixel';
import {
  TICK, TOOL_ROAD, TOOL_HOUSE, TOOL_ERASE, TOOL_NONE, MIN_SIZE, MAX_SIZE, PLACE_OK, PLACE_NO_ROAD, PLACE_NO_STOCK, PLACE_NO_WATER, ROLE_NAMES,
} from './constants';
import { HUD_INK, HUD_TEAL, HUD_MUTED, HUD_PAPER, HUD_WARM, HUD_ALERT, HUD_DISABLED } from './palettes';
import * as assets from 'zinc:assets';
import { world, generate, tileAt } from './world/world';
import { economy, loadEconomy, amountText } from './world/economy';
import { MODEL_IDS } from './view/models';
import { saveGame, loadGame, eraseSave } from './world/save';
import { parseSeedRequest, randomSeed } from './world/seed';
import { checkTool, applyTool } from './rules/build';
import { stepWorld } from './engine/simulate';
import { bakeVillage, rebakeStatic, moveCamera, setZoom, stepZoom, resetView } from './view/scenery';
import { drawVillage, frameDirty } from './view/frame';
import { adviceLine, resourceLine } from './hud';
import { settings } from './settings';
import { Panel } from './ui/Panel';
import { buildSettingsPanel } from './ui/SettingsPanel';
import { drawMinimap, minimapContains, minimapClick } from './ui/Minimap';
import { refreshModels } from './view/scenery';
import { camera, DEFAULT_ZOOM, ZOOM_VIEW, cropX, cropY } from './view/camera';
import { W, H } from './pixel';

const TOP = 70, BOTTOM = 150;
const PAN_SPEED = 240;                  // source pixels per second with the keys           // screen rows kept for the title row and for the toolbar and texts

export class HamletScene extends Sprite {
  tool: number = TOOL_ROAD;
  /** The tools on the toolbar, in order: the fishing hut only exists in a village that has a pond. */
  private tools: number[] = [];
  paused: boolean = false;
  private surface = new PixelSurface();
  private frame = new PixelGame('hamlet', 'Hameau', '');
  private time: number = 0;
  private acc: number = 0;               // seconds the simulation still owes: it advances in whole ticks of TICK
  private lastPose: number = -1;
  private baked: number = -1;
  private held: boolean = false;
  private panLeft: boolean = false;
  private panRight: boolean = false;
  private panUp: boolean = false;
  private panDown: boolean = false;
  private editing: boolean = false;       // typing a seed
  private seedText: string = '';
  private panning: boolean = false;       // dragging the map with the right or middle button
  private panX: number = 0;
  private panY: number = 0;
  private dragging: boolean = false;
  private lastPaint: number = -1;
  private hover: number = -1;
  private message: string = '';
  private messageUntil: number = 0;
  private newVillageAt: number = -100;
  private small: i32 = -1;
  private body: i32 = -1;
  private titleFont: i32 = -1;
  private panel: Panel;
  private fpsRow: number = 0;
  private cameraSignature: number = 0;
  private sinceMove: number = 10;        // seconds since the camera last moved or zoomed
  private bufferW: number = 360;
  private bufferH: number = 280;
  private pendingSize: number = 0;      // the grid size the panel asks for (applied by "new map")
  private pointerStart: number = -1;     // first pointer position seen, so a pointer that never moved does not scroll the map
  private pointerMoved: boolean = false;
  private onMap: boolean = false;         // dragging on the minimap

  constructor() {
    super('Hamlet');
    loadEconomy(assets.readText('economy.json'), MODEL_IDS, ROLE_NAMES);
    this.small = font('mono', 11); this.body = font('mono', 14); this.titleFont = font('mono', 21);
    this.frame.cropX = 10; this.frame.cropY = 22; this.frame.cropWidth = 340; this.frame.cropHeight = 226;
    const built = buildSettingsPanel({
      zoom: (): number => DEFAULT_ZOOM - camera.level,
      setZoom: (step: number): void => { setZoom(DEFAULT_ZOOM - step); this.baked = world.revision; },
      resetView: (): void => { resetView(); this.baked = world.revision; },
      mapSize: (): number => this.pendingSize,
      setMapSize: (size: number): void => { this.pendingSize = size; },
      newMap: (): void => this.resizeVillage(),
      refreshModels: (): void => { refreshModels(); this.baked = world.revision; },
    });
    this.panel = built.panel; this.fpsRow = built.fps; this.panel.open = false;
    world.autosave = true;
    if (!loadGame()) generate(randomSeed());
    bakeVillage(); this.baked = world.revision; this.listTools(); this.pendingSize = world.size;
    setAmbience('meadow');
    windowCtl(0, 3, 'Hameau', 0, 0);
  }

  private listTools(): void {
    this.tools = [TOOL_ROAD];
    const types: number[] = [];                                    // the buildings in the order of the file's "order"; the shore ones need a pond
    for (let type = 0; type < economy.buildings.length; type++) if (economy.buildings[type].gather !== 'shore' || world.hasWater) types.push(type);
    types.sort((a: number, b: number): number => economy.buildings[a].order - economy.buildings[b].order);
    for (const type of types) this.tools.push(TOOL_HOUSE + type);
    this.tools.push(TOOL_ERASE);
    if (this.tool !== TOOL_NONE && this.tools.indexOf(this.tool) < 0) this.tool = TOOL_ROAD;
  }
  private say(text: string): void { this.message = text; this.messageUntil = this.time + 3; }

  /** The renderer's window changes size with the zoom level: the surface (its image and byte buffer) must follow before it reads the pixels. */
  private syncBuffer(): void {
    if (W !== this.bufferW || H !== this.bufferH) { this.surface.resize(); this.bufferW = W; this.bufferH = H; }
  }
  private layoutSurface(): void {
    // Zooming out shows a wider window with smaller pixels: the buffer follows the level, the picture is scaled by the normal integer scale divided by the window's growth.
    this.syncBuffer();
    this.frame.cropX = cropX(); this.frame.cropY = cropY(); this.frame.cropWidth = W - 20; this.frame.cropHeight = H - 54;
    this.surface.layout(this.frame);
    const k = ZOOM_VIEW[camera.level];
    const s = Math.max(1, Math.floor(Math.min(width() / 340, (height() - TOP - BOTTOM) / 226))) / k;
    this.surface.scale = s;
    this.surface.x = Math.floor((width() - this.frame.cropWidth * s) / 2);
    this.surface.y = TOP + Math.floor((height() - TOP - BOTTOM - this.frame.cropHeight * s) / 2);
  }
  private buttonWidth(): number { return Math.min(190, (width() - 40 - (this.tools.length - 1) * 10) / this.tools.length); }
  private buttonX(i: number): number { const bw = this.buttonWidth(); return (width() - (this.tools.length * bw + (this.tools.length - 1) * 10)) / 2 + i * (bw + 10); }
  private buttonY(): number { return height() - 128; }

  private tileUnder(x: number, y: number): number {
    if (!this.surface.contains(x, y)) return -1;
    const p = unproject(this.surface.sourceXAt(x), this.surface.sourceYAt(y));
    return tileAt(p.x, p.y);
  }

  private newVillage(): void {
    if (this.time - this.newVillageAt > 3) { this.newVillageAt = this.time; this.say('Appuyez encore sur N pour recommencer un nouveau hameau.'); return; }
    this.createVillage(randomSeed(), world.size);
  }
  /** Replaces the village by the one a (seed, size) pair decides, and saves it as the current one. */
  private createVillage(seed: number, size: number): void {
    eraseSave(); generate(seed, size); bakeVillage(); this.baked = world.revision; this.listTools(); this.pendingSize = size; saveGame();
    this.say('Nouveau hameau · graine ' + seed + ' · ' + size + '×' + size);
  }
  /** The panel's "new map": the same seed on another grid size, after a second press (it replaces the village). */
  private resizeVillage(): void {
    const size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, this.pendingSize));
    if (this.time - this.newVillageAt > 3) { this.newVillageAt = this.time; this.say('Appuyez encore pour refaire la carte en ' + size + '×' + size + '.'); return; }
    this.createVillage(world.seed, size);
  }
  /** Seed entry: typed text arrives as Text events; Enter creates, Escape cancels. */
  private edit(kind: KeyKind, name: string): void {
    if (kind === KeyKind.Text) { if (this.seedText.length < 24) this.seedText += name; }
    else if (name === 'Backspace') this.seedText = this.seedText.slice(0, -1);
    else if (name === 'Enter') { this.editing = false; stopTextInput(); const request = parseSeedRequest(this.seedText); this.createVillage(request.seed, request.size); }
    else if (name === 'Escape') { this.editing = false; stopTextInput(); }
    uiState.dirty = true;
  }
  private act(t: number): void {
    if (this.tool === TOOL_NONE) return;
    const code = applyTool(this.tool, t);
    if (code === PLACE_OK) { sound(this.tool === TOOL_ERASE ? 'soft' : 'wood', .5); return; }
    if (this.tool !== TOOL_ROAD && t >= 0) {
      sound('soft', .4);
      const missing = this.tool >= TOOL_HOUSE && this.tool < TOOL_ERASE ? amountText(economy.buildings[this.tool - TOOL_HOUSE].cost, world.stock) : '';
      this.say(code === PLACE_NO_WATER ? 'Ce bâtiment se pose au bord de l’étang.' : code === PLACE_NO_ROAD ? 'Il faut poser le bâtiment au bord d’une route.' : code === PLACE_NO_STOCK ? 'Il manque : ' + missing + '.' : 'Cette case n’est pas libre.');
    }
  }
  private key(name: string, down: boolean): void {
    if (name === 'ArrowLeft' || name === 'a' || name === 'A') this.panLeft = down;
    else if (name === 'ArrowRight' || name === 'd' || name === 'D') this.panRight = down;
    else if (name === 'ArrowUp' || name === 'w' || name === 'W') this.panUp = down;
    else if (name === 'ArrowDown' || name === 's' || name === 'S') this.panDown = down;
    if (!down) return;
    if (name === '+' || name === '=') { stepZoom(1); this.baked = world.revision; }
    else if (name === '-' || name === '_') { stepZoom(-1); this.baked = world.revision; }
    else if (name === '0' || name === 'Home') { resetView(); this.baked = world.revision; }
    else if (name === 'Escape') { if (!this.panel.closeMenu()) this.tool = TOOL_NONE; }
    else if (name >= '1' && name <= '9' && Number(name) <= this.tools.length) this.tool = this.tools[Number(name) - 1];
    else if (name === 'p' || name === 'P') { this.paused = !this.paused; this.dragging = false; pauseSound(this.paused); }
    else if (name === 'm' || name === 'M') toggleSound();
    else if (name === 'h' || name === 'H') settings.hints = !settings.hints;
    else if (name === 'n' || name === 'N') this.newVillage();
    else if (name === 'g' || name === 'G') { this.editing = true; this.seedText = ''; startTextInput(width() / 2 - 200, height() / 2, 400, 40); }
    else if (name === 'Tab') this.panel.open = !this.panel.open;
    else if (name === 'u' || name === 'U') {
      world.unlimited = !world.unlimited; world.saveDirty = true;
      this.say(world.unlimited ? 'Mode sans limite : arbres et gibier repoussent quand il en manque.' : 'Mode normal : les ressources s’épuisent.');
    }
    uiState.dirty = true;
  }
  private press(x: number, y: number, down: boolean): void {
    if (!down) { this.panel.release(); this.onMap = false; }
    if (down) {
      if (this.panel.press(x, y)) { uiState.dirty = true; return; }
      if (minimapContains(x, y)) { this.onMap = true; minimapClick(x, y); this.baked = world.revision; uiState.dirty = true; return; }
      for (let i = 0; i < this.tools.length; i++) {
        if (x >= this.buttonX(i) && x < this.buttonX(i) + this.buttonWidth() && y >= this.buttonY() && y < this.buttonY() + 44) { this.tool = this.tools[i]; uiState.dirty = true; return; }
      }
      if (y < 40 && x > width() - 330 && x < width() - 150) { this.panel.open = !this.panel.open; uiState.dirty = true; return; }
      if (y < 40) { if (x < 135) toggleSound(); else if (x > width() - 140) this.key('p', true); uiState.dirty = true; return; }
      if (this.paused || !this.surface.contains(x, y)) return;
      this.dragging = true; this.lastPaint = -1;
    }
    if (down) this.drag(x, y, true); else this.dragging = false;
    uiState.dirty = true;
  }
  /** Roads and demolition are painted by dragging; a building is placed once, on the press. */
  private drag(x: number, y: number, first: boolean): void {
    if (this.tool === TOOL_NONE) return;
    const t = this.tileUnder(x, y);
    if (t < 0 || t === this.lastPaint) return;
    this.lastPaint = t;
    if (first || this.tool === TOOL_ROAD || this.tool === TOOL_ERASE) this.act(t);
  }

  override onUpdate(dt: number): void {
    this.layoutSurface();
    for (let i = 0; i < keyCount(); i++) {
      const kind = keyKind(i);
      if (this.editing) { this.edit(kind, keyName(i)); continue; }
      if (kind === KeyKind.Text || kind === KeyKind.Repeat) continue;
      this.key(keyName(i), kind !== KeyKind.Up);
    }
    let events = 0;
    for (let i = 0; i < buttonEventCount(); i++) {
      if (buttonEventButton(i) !== 0) {                    // the other buttons drag the map
        this.panning = buttonEventDown(i); this.panX = buttonEventX(i); this.panY = buttonEventY(i);
        continue;
      }
      this.press(buttonEventX(i), buttonEventY(i), buttonEventDown(i)); events++;
    }
    const held = pointerDown(), x = pointerX(), y = pointerY();
    if (events === 0 && held !== this.held) this.press(x, y, held);
    else if (events === 0 && held && this.dragging) this.drag(x, y, false);
    if (held && this.panel.dragging()) { this.panel.drag(x); uiState.dirty = true; }
    if (held && this.onMap) { minimapClick(x, y); uiState.dirty = true; }
    const where = x * 10000 + y;
    if (this.pointerStart < 0) this.pointerStart = where; else if (where !== this.pointerStart) this.pointerMoved = true;
    this.moveView(dt, x, y);
    this.hover = this.paused ? -1 : this.tileUnder(x, y);
    this.held = held;
    const signature = camera.x * 7919 + camera.y * 31 + camera.level * 100003;
    if (signature !== this.cameraSignature) { this.cameraSignature = signature; this.sinceMove = 0; } else this.sinceMove += dt;
    if (!this.paused && (!settings.pauseOnMove || this.sinceMove > .3)) {
      this.time += dt;
      this.acc += Math.min(.1, dt) * settings.simSpeed;
      while (this.acc >= TICK) { stepWorld(); this.acc -= TICK; }
      const pose = Math.floor(this.time * settings.animFps);
      this.panel.push(this.fpsRow, dt > 0 ? 1 / dt : 0);
      if (pose !== this.lastPose) uiState.dirty = true;
      this.lastPose = pose;
    }
    if (this.baked !== world.revision) { rebakeStatic(); this.baked = world.revision; uiState.dirty = true; }
  }

  /** Camera: keys, right-button drag and trackpad scroll pan; the wheel, a pinch and + / - zoom. */
  private moveView(dt: number, x: number, y: number): void {
    if (this.paused) return;
    let dx = ((this.panRight ? 1 : 0) - (this.panLeft ? 1 : 0)) * PAN_SPEED * dt, dy = ((this.panDown ? 1 : 0) - (this.panUp ? 1 : 0)) * PAN_SPEED * dt;
    if (this.panning) { dx += (this.panX - x) / this.surface.scale; dy += (this.panY - y) / this.surface.scale; this.panX = x; this.panY = y; }
    if (scrollPhase() !== 0) { dx -= scrollDX() / this.surface.scale; dy -= scrollDY() / this.surface.scale; }
    else if (wheel() !== 0) { stepZoom(wheel() > 0 ? 1 : -1); this.baked = world.revision; uiState.dirty = true; }
    if (pinch() !== 1) { stepZoom(pinch() > 1 ? 1 : -1); this.baked = world.revision; uiState.dirty = true; }
    if (settings.edgePan && this.pointerMoved && !this.panel.contains(x, y)) {
      const band = 8;
      dx += ((x >= width() - band ? 1 : 0) - (x < band ? 1 : 0)) * PAN_SPEED * dt; dy += ((y >= height() - band ? 1 : 0) - (y < band ? 1 : 0)) * PAN_SPEED * dt;
    }
    if ((dx !== 0 || dy !== 0) && moveCamera(dx, dy)) uiState.dirty = true;
  }

  private centered(fontId: i32, y: number, label: string, color: u32): void {
    drawText(fontId, (width() - textWidth(fontId, label, 0)) / 2, y, label, color, 255, 0);
  }
  override onDraw(w: number, h: number): void {
    const ok = this.hover >= 0 && this.tool !== TOOL_NONE && checkTool(this.tool, this.hover) === PLACE_OK;
    drawVillage(Math.floor(this.time * settings.animFps) / settings.animFps, this.hover, ok, this.tool >= TOOL_HOUSE && this.tool < TOOL_ERASE && ok ? this.tool - TOOL_HOUSE : -1);
    this.syncBuffer(); this.layoutSurface();
    if (frameDirty.full) { this.surface.upload(); frameDirty.full = false; } else this.surface.uploadSpans(frameDirty.spans);
    this.surface.draw();
    drawText(this.small, 24, 42, 'GRAINE ' + world.seed + ' · ' + world.size + '×' + world.size + ' [G]', HUD_MUTED, 255, 0);
    drawMinimap();
    this.panel.x = w - this.panel.width - 12; this.panel.y = 70; this.panel.draw();
    drawText(this.small, w - 320, 20, 'RÉGLAGES [TAB]', HUD_MUTED, 255, 0);
    drawText(this.small, 24, 20, muted ? 'SON COUPÉ [M]' : 'SON [M]', HUD_MUTED, 255, 0);
    const pause = this.paused ? 'REPRENDRE [P]' : 'PAUSE [P]';
    drawText(this.small, w - textWidth(this.small, pause, 0) - 24, 20, pause, HUD_MUTED, 255, 0);
    this.centered(this.titleFont, 14, 'HAMEAU', HUD_INK);
    this.centered(this.body, 46, resourceLine(), HUD_TEAL);
    for (let i = 0; i < this.tools.length; i++) {
      const tool = this.tools[i], build = tool >= TOOL_HOUSE && tool < TOOL_ERASE, def = build ? economy.buildings[tool - TOOL_HOUSE] : null;
      let affordable = true;
      if (def !== null) for (let k = 0; k < def.cost.length; k++) if (def.cost[k] > world.stock[k]) affordable = false;
      const selected = tool === this.tool, color = selected ? HUD_PAPER : affordable ? HUD_WARM : HUD_DISABLED;
      const name = (i + 1) + ' ' + (def !== null ? def.short : tool === TOOL_ROAD ? 'Route' : 'Démolir'), cost = def !== null ? amountText(def.cost, null) : '';
      const bx = this.buttonX(i), bw = this.buttonWidth();
      if (selected) rect(bx, this.buttonY(), bw, 44, HUD_TEAL); else rect(bx, this.buttonY(), bw, 44, 0xefe8d4);
      drawText(this.small, bx + (bw - textWidth(this.small, name, 0)) / 2, this.buttonY() + (cost === '' ? 17 : 8), name, color, 255, 0);
      if (cost !== '') drawText(this.small, bx + (bw - textWidth(this.small, cost, 0)) / 2, this.buttonY() + 26, cost, color, 255, 0);
    }
    const text = this.time < this.messageUntil ? this.message : adviceLine();
    this.centered(this.body, h - 66, text, this.time < this.messageUntil ? HUD_ALERT : HUD_WARM);
    this.centered(this.small, h - 40, (world.unlimited ? 'SANS LIMITE · ' : '') + 'Glisser pour tracer · clic pour poser · Échap: désélectionner · flèches/bord/clic droit: déplacer · +/-/0: zoom · Tab: réglages', 0x9a8c76);
    if (this.editing) {
      rect(w / 2 - 230, h / 2 - 70, 460, 140, 0xfffdf1);
      this.centered(this.body, h / 2 - 54, 'Graine du hameau', HUD_TEAL);
      rect(w / 2 - 200, h / 2 - 22, 400, 40, 0xefe8d4);
      drawText(this.body, w / 2 - 190, h / 2 - 12, this.seedText + (Math.floor(this.time * 2) % 2 === 0 ? '_' : ''), HUD_INK, 255, 0);
      this.centered(this.small, h / 2 + 28, 'Entrée: créer · Échap: annuler · vide: au hasard', HUD_WARM);
      this.centered(this.small, h / 2 + 46, 'un nombre ou un mot · mot@32 pour la taille (12 à 32)', HUD_MUTED);
    }
    if (this.paused) { rect(w / 2 - 100, h / 2 - 30, 200, 60, 0xfffdf1); this.centered(this.titleFont, h / 2 - 9, 'PAUSE', HUD_TEAL); }
  }
}
