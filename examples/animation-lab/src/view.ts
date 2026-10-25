import { Sprite, registerTapZone, uiState } from 'zinc:stage';
import { text, rect, wasPressed, Btn } from 'zinc:gfx';
import { render } from 'zinc:3d';
import { LabState } from './state';
export class LabView extends Sprite {
  state: LabState;
  title = ''; timeline = ''; diagnostics = ''; eventLabel = '';
  pauseAction: () => void; nextAction: () => void; backAction: () => void; seekAction: () => void; stepAction: () => void; loopAction: () => void;
  private labelAge = 0;
  constructor(state: LabState) {
    super('AnimationLab'); this.state = state;
    this.pauseAction = (): void => { state.player.paused = !state.player.paused; this.refresh(); };
    this.nextAction = (): void => { state.next(); this.refresh(); };
    this.backAction = (): void => { state.seek(-.1); this.refresh(); };
    this.seekAction = (): void => { state.seek(.1); this.refresh(); };
    this.stepAction = (): void => { state.player.paused=true; state.player.step(1/24); this.refresh(); };
    this.loopAction = (): void => { state.player.loop=!state.player.loop; this.refresh(); };
    this.refresh();
  }
  refresh(): void {
    const s=this.state, p=s.player;
    this.title = `${s.model.clips[p.clip]} / ${p.paused ? 'PAUSED' : 'PLAYING'} / speed ${p.speed.toFixed(2)}`;
    this.timeline = `time ${p.time.toFixed(3)} / ${s.model.durations[p.clip].toFixed(3)} s   blend ${p.blend.toFixed(2)}   loop ${p.loop ? 'on' : 'off'} [C]`;
    this.diagnostics = `${s.model.vertices} skinned vertices / ${s.model.jointCount} joints / mouth socket Head / root motion: controller`;
    this.eventLabel = `events ${s.eventCount} / ${s.lastEvent} / seeking never emits events`;
    uiState.dirty=true;
  }
  override onUpdate(dt: number): void {
    const p=this.state.player;
    if (wasPressed(Btn.A)) this.pauseAction();
    if (wasPressed(Btn.Start)) this.nextAction();
    if (wasPressed(Btn.Left)) this.backAction();
    if (wasPressed(Btn.Right)) this.seekAction();
    if (wasPressed(Btn.B)) this.stepAction();
    if (wasPressed(Btn.X)) this.loopAction();
    if (wasPressed(Btn.Up)) { p.speed=Math.min(3,p.speed+.25); this.refresh(); }
    if (wasPressed(Btn.Down)) { p.speed=Math.max(0,p.speed-.25); this.refresh(); }
    p.update(dt);
    if (!p.paused && p.speed>0) uiState.dirty=true;
    this.labelAge+=dt;
    if (this.labelAge>.1 && !p.paused) { this.labelAge=0; this.refresh(); }
  }
  override onDraw(w: number, h: number): void {
    const p=this.state.player;
    render(this.state.scene,this.state.camera,0,0,w,h);
    rect(0,0,w,115,0x172129);
    text(20,18,'COMPANION / ANIMATION LAB',0xf4ddae,2);
    text(20,52,this.title,0xffffff,1); text(20,75,this.timeline,0x90b3ba,1);
    rect(0,h-130,w,130,0x172129);
    text(20,h-112,this.diagnostics,0xf4ddae,1); text(20,h-90,this.eventLabel,0x90b3ba,1);
    rect(20,h-63,w-40,4,0x40565b);
    rect(20,h-63,(w-40)*p.time/this.state.model.durations[p.clip],4,0xf5c257);
    text(20,h-36,'PAUSE [SPACE]    CLIP [ENTER]    SEEK [LEFT/RIGHT]    STEP [X]    SPEED [UP/DOWN]',0xffffff,1);
    registerTapZone('loop', 600, 65, 250, 35, this.loopAction);
    registerTapZone('pause',10,h-50,150,45,this.pauseAction);
    registerTapZone('clip',165,h-50,145,45,this.nextAction);
    registerTapZone('back',310,h-50,130,45,this.backAction);
    registerTapZone('seek',440,h-50,140,45,this.seekAction);
    registerTapZone('step',585,h-50,150,45,this.stepAction);
  }
}
