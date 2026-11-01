import {
  width, height, rect, quit, keyCount, keyKind, keyMods, Mod, keyName, buttonEventCount, buttonEventButton, buttonEventDown,
  buttonEventX, buttonEventY, pointerDown, pointerX, pointerY, KeyKind, windowCtl, wheel, pinch, scrollDX, scrollDY, scrollPhase, Cursor,
} from 'zinc:gfx';
import { Sprite, uiState } from 'zinc:stage';
import { PixelSurface, PixelGame, unproject, sound, setAmbience, toggleSound, pauseSound, muted } from './pixel';
import {
  TICK, TOOL_ROAD, TOOL_HOUSE, TOOL_ERASE, TOOL_NONE, MIN_SIZE, MAX_SIZE, PLACE_OK, ROLE_NAMES,
} from './constants';
import * as assets from 'zinc:assets';
import { world, generate, tileAt } from './world/world';
import { economy, loadEconomy } from './world/economy';
import { MODEL_IDS } from './view/models';
import { saveGame, loadGame, eraseSave } from './world/save';
import { parseSeedRequest, randomSeed } from './world/seed';
import { checkTool, applyTool } from './rules/build';
import { stepWorld } from './engine/simulate';
import { bakeVillage, rebakeStatic, moveCamera, setZoom, stepZoom, resetView } from './view/scenery';
import { drawVillage, frameDirty } from './view/frame';
import { adviceLine } from './hud';
import { settings } from './settings';
import { Panel } from './ui/Panel';
import { buildSettingsPanel } from './ui/SettingsPanel';
import { minimapClick } from './ui/Minimap';
import { loadKit, col, beginFrame, hitAt, track, pointer, drawTooltip, updateCursor, text, textC, window_, parchment, kit } from './ui/kit';
import { ui, act, viewport, SPEEDS } from './ui/state';
import { topBar, column, statusStrip, toolList, hudClick } from './ui/Hud';
import { drawFlyout } from './ui/BuildMenu';
import { drawInfo, pickAt, closeInfo } from './ui/Info';
import { look, record, beginGroup, endGroup, undo, drawPlacementLabel, reasonText } from './ui/Placement';
import { WIN_INFO, WIN_MAIN, WIN_ADVISOR, WIN_NONE } from './ui/state';
import { scanEvents, drawBanner } from './ui/Messages';
import { loadPrefs, savePrefs } from './ui/prefs';
import { drawAdvisors, sampleHistory, openAdvisor } from './ui/Advisors';
import { drawMenus, isModal, closeMenus, openNew, openMenu, typeKey } from './ui/Menu';
import { refreshModels, jumpTo } from './view/scenery';
import { camera, DEFAULT_ZOOM, ZOOM_VIEW, cropX, cropY } from './view/camera';
import { W, H } from './pixel';

const PAN_SPEED = 240;                  // source pixels per second with the keys           // screen rows kept for the title row and for the toolbar and texts

export class HamletScene extends Sprite {
  get tool(): number { return ui.tool; }
  set tool(v: number) { ui.tool = v; }
  /** The tools of the column, in order: the fishing hut only exists in a village that has a pond. */
  private tools: number[] = [];
  get paused(): boolean { return ui.paused; }
  set paused(v: boolean) { ui.paused = v; }
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
  private panning: boolean = false;       // dragging the map with the right or middle button
  private panX: number = 0;
  private panY: number = 0;
  private dragging: boolean = false;
  private lastPaint: number = -1;
  private hover: number = -1;
  private message: string = '';
  private messageUntil: number = 0;
  private newVillageAt: number = -100;
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
    loadKit(); loadPrefs(); ui.tool = TOOL_ROAD;
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
    if (loadGame()) ui.window = WIN_MAIN; else generate(randomSeed());
    bakeVillage(); this.baked = world.revision; this.listTools(); this.pendingSize = world.size;
    act.setTool = (tool: number): void => { this.tool = tool; uiState.dirty = true; };
    act.say = (message: string): void => this.say(message);
    act.newVillage = (seed: number, size: number): void => this.createVillage(seed, size);
    act.loaded = (): void => { this.loaded(); saveGame(); };
    act.quit = (): void => quit();
    act.rebake = (): void => { uiState.dirty = true; };
    act.togglePause = (): void => this.key('p', true);
    act.setSpeed = (i: number): void => { ui.speed = i; settings.simSpeed = SPEEDS[i]; savePrefs(); uiState.dirty = true; };
    act.jump = (x: number, y: number): void => { jumpTo(x, y); this.baked = world.revision; uiState.dirty = true; };
    setAmbience('meadow');
    windowCtl(0, 3, 'Hameau', 0, 0);
  }

  private listTools(): void {
    this.tools = toolList();
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
    const vp = viewport();
    this.frame.cropX = cropX(); this.frame.cropY = cropY(); this.frame.cropWidth = W - 20; this.frame.cropHeight = H - 54;
    this.surface.layout(this.frame);
    const k = ZOOM_VIEW[camera.level];
    const s = Math.min(vp.w / 340, vp.h / 226) / k;
    this.surface.scale = s;
    this.surface.x = vp.x + Math.floor((vp.w - this.frame.cropWidth * s) / 2);
    this.surface.y = vp.y + Math.floor((vp.h - this.frame.cropHeight * s) / 2);
  }

  private tileUnder(x: number, y: number): number {
    if (!this.surface.contains(x, y)) return -1;
    const p = unproject(this.surface.sourceXAt(x), this.surface.sourceYAt(y));
    return tileAt(p.x, p.y);
  }

  /** Replaces the village by the one a (seed, size) pair decides, and saves it as the current one. */
  private createVillage(seed: number, size: number): void {
    eraseSave(); generate(seed, size); this.loaded(); saveGame();
    this.say('Nouveau hameau · graine ' + seed + ' · ' + size + '×' + size);
  }
  /** A village was just made or loaded: bake it, rebuild the tools. */
  private loaded(): void { bakeVillage(); this.baked = world.revision; this.listTools(); this.pendingSize = world.size; ui.category = -1; closeInfo(); uiState.dirty = true; }
  /** The panel's "new map": the same seed on another grid size. */
  private resizeVillage(): void { this.createVillage(world.seed, Math.max(MIN_SIZE, Math.min(MAX_SIZE, this.pendingSize))); }
  private act(t: number): void {
    if (this.tool === TOOL_NONE) return;
    const before = look(t), code = applyTool(this.tool, t);
    if (code === PLACE_OK) { record(this.tool, t, before); sound(this.tool === TOOL_ERASE ? 'soft' : 'wood', .5); return; }
    if (this.tool !== TOOL_ROAD && t >= 0) { sound('soft', .4); this.say(reasonText(this.tool, code)); }
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
    else if (name === 'Escape') { if (closeMenus()) { /* a menu closed */ } else if (ui.category >= 0) ui.category = -1; else if (ui.window === WIN_INFO) closeInfo(); else if (ui.window === WIN_ADVISOR) ui.window = WIN_NONE; else if (this.panel.closeMenu()) { /* the dev panel's list closed */ } else if (this.tool !== TOOL_NONE) this.tool = TOOL_NONE; else openMenu(); }
    else if (name === '[' || name === ']') { const i = this.tools.indexOf(this.tool); this.tool = this.tools[(Math.max(0, i) + (name === ']' ? 1 : this.tools.length - 1)) % this.tools.length]; }
    else if (name >= '1' && name <= '9' && Number(name) <= this.tools.length) this.tool = this.tools[Number(name) - 1];
    else if (name === 'p' || name === 'P') { this.paused = !this.paused; this.dragging = false; pauseSound(this.paused); }
    else if (name === 'm' || name === 'M') toggleSound();
    else if (name === 'h' || name === 'H') settings.hints = !settings.hints;
    else if (name === 'f' || name === 'F') openAdvisor(ui.advisor);
    else if (name === 'n' || name === 'N' || name === 'g' || name === 'G') openNew();
    else if (name === 'F2') this.panel.open = !this.panel.open;
    else if (name === 'u' || name === 'U') {
      world.unlimited = !world.unlimited; world.saveDirty = true;
      this.say(world.unlimited ? 'Mode sans limite : arbres et gibier repoussent quand il en manque.' : 'Mode normal : les ressources s’épuisent.');
    }
    uiState.dirty = true;
  }
  private press(x: number, y: number, down: boolean): void {
    if (!down) {
      this.panel.release(); this.onMap = false;
      if (pointer.down !== '') { const hit = hitAt(x, y); if (hit !== null && hit.id === pointer.down && hit.id !== 'map') hudClick(hit.id); pointer.down = ''; }
    }
    if (down) {
      if (this.panel.press(x, y)) { uiState.dirty = true; return; }
      const hit = hitAt(x, y);
      if (hit !== null) {
        pointer.down = hit.id;
        if (hit.id === 'map') { this.onMap = true; minimapClick(x, y); this.baked = world.revision; }
        uiState.dirty = true; return;
      }
      if (this.paused || !this.surface.contains(x, y)) return;
      if (this.tool === TOOL_NONE) { const g = unproject(this.surface.sourceXAt(x), this.surface.sourceYAt(y)); if (!pickAt(g.x, g.y, tileAt(g.x, g.y))) closeInfo(); uiState.dirty = true; return; }
      this.dragging = true; this.lastPaint = -1; beginGroup();
    }
    if (down) this.drag(x, y, true); else { this.dragging = false; endGroup(); }
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
      if (ui.editing) { typeKey(kind, keyName(i)); uiState.dirty = true; continue; }
      if (kind === KeyKind.Text || kind === KeyKind.Repeat) continue;
      if (kind === KeyKind.Down && (keyMods(i) & Mod.Ctrl) !== 0 && keyName(i).toLowerCase() === 'z') { const said = undo(); if (said !== '') this.say(said); this.baked = world.revision; uiState.dirty = true; continue; }
      this.key(keyName(i), kind !== KeyKind.Up);
    }
    let events = 0;
    for (let i = 0; i < buttonEventCount(); i++) {
      if (buttonEventButton(i) !== 0) {                    // the other buttons drag the map; a right click also closes a window
        if (buttonEventDown(i) && buttonEventButton(i) === 2) { if (ui.window === WIN_INFO) closeInfo(); else if (ui.category >= 0) ui.category = -1; else if (this.tool !== TOOL_NONE) this.tool = TOOL_NONE; uiState.dirty = true; }
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
    ui.time += dt;
    if (track(x, y)) uiState.dirty = true;
    this.moveView(dt, x, y);
    this.hover = this.paused || this.tool === TOOL_NONE || hitAt(x, y) !== null ? -1 : this.tileUnder(x, y);
    this.held = held;
    const signature = camera.x * 7919 + camera.y * 31 + camera.level * 100003;
    if (signature !== this.cameraSignature) { this.cameraSignature = signature; this.sinceMove = 0; } else this.sinceMove += dt;
    if (!this.paused && !isModal() && (!settings.pauseOnMove || this.sinceMove > .3)) {
      this.time += dt;
      this.acc += Math.min(.1, dt) * settings.simSpeed;
      while (this.acc >= TICK) { stepWorld(); this.acc -= TICK; }
      scanEvents(); sampleHistory();
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
    if (settings.edgePan && this.pointerMoved && !this.panel.contains(x, y) && hitAt(x, y) === null) {
      const band = 8;
      dx += ((x >= width() - band ? 1 : 0) - (x < band ? 1 : 0)) * PAN_SPEED * dt; dy += ((y >= height() - band ? 1 : 0) - (y < band ? 1 : 0)) * PAN_SPEED * dt;
    }
    if ((dx !== 0 || dy !== 0) && moveCamera(dx, dy)) uiState.dirty = true;
  }

  override onDraw(w: number, h: number): void {
    const ok = this.hover >= 0 && this.tool !== TOOL_NONE && checkTool(this.tool, this.hover) === PLACE_OK;
    drawVillage(Math.floor(this.time * settings.animFps) / settings.animFps, this.hover, ok, this.tool >= TOOL_HOUSE && this.tool < TOOL_ERASE && ok ? this.tool - TOOL_HOUSE : -1);
    this.syncBuffer(); this.layoutSurface();
    const vp = viewport();
    rect(0, 0, w, h, col('stoneDeep'));
    if (frameDirty.full) { this.surface.upload(); frameDirty.full = false; } else this.surface.uploadSpans(frameDirty.spans);
    this.surface.draw();
    beginFrame();
    topBar(); column(); drawFlyout(); drawInfo(); drawAdvisors();
    drawBanner(vp.x + vp.w / 2, vp.y + 8);
    const note = this.time < this.messageUntil;
    statusStrip(note ? this.message : adviceLine(), note ? col('gold') : 0);
    if (this.panel.open) { this.panel.x = w - this.panel.width - 200; this.panel.y = 48; this.panel.draw(); }
    if (this.paused) { const cx = vp.x + vp.w / 2; parchment(cx - 70, vp.y + 14, 140, 34); textC(kit.big, cx, vp.y + 12, 'PAUSE', col('accent')); }
    if (this.tool !== TOOL_NONE && !this.paused && hitAt(pointer.x, pointer.y) === null && this.surface.contains(pointer.x, pointer.y)) drawPlacementLabel(this.tool, this.hover, pointer.x, pointer.y);
    drawMenus();
    drawTooltip();
    updateCursor(this.panning ? Cursor.Grabbing : this.tool === TOOL_NONE ? Cursor.Default : this.tool === TOOL_ERASE ? Cursor.NotAllowed : Cursor.Crosshair);
  }
}
