import { Sprite, registerTapZone, uiState, isZonePressed } from 'zinc:stage';
import { text, rect, isDown, wasPressed, Btn, gamepadAxis, GamepadAxis } from 'zinc:gfx';
import { render } from 'zinc:3d';
import { GameState } from './state';
export class GameView extends Sprite {
  state:GameState;
  title='';description='';animationLabel='';budget='';source='';
  triangles:i32=0;draws:i32=0;
  interactAction:()=>void;reloadAction:()=>void;debugAction:()=>void;sourceAction:()=>void;failAction:()=>void;pauseAction:()=>void;seekAction:()=>void;
  private age=0;
  private idleAction:()=>void=():void=>{};
  constructor(state:GameState){
    super('LanternPost');this.state=state;
    this.interactAction=():void=>{state.interact();this.refresh();};
    this.reloadAction=():void=>{state.reload();this.refresh();};
    this.debugAction=():void=>{state.toggleDebug();this.refresh();};
    this.sourceAction=():void=>{state.nextSource();this.refresh();};
    this.failAction=():void=>{state.badRevision();this.refresh();};
    this.pauseAction=():void=>{state.animationPaused=!state.animationPaused;this.refresh();};
    this.seekAction=():void=>{state.animation.seek(state.animation.time+1/24);this.refresh();};
    this.refresh();
  }
  refresh():void{
    const s=this.state,p=s.animation;
    this.title=`LANTERN POST / ${s.delivered.size} OF 3 DELIVERED`;
    this.description=s.status;
    this.animationLabel=`Companion ${p.model.clips[p.clip]}  ${p.time.toFixed(2)}s  blend ${p.blend.toFixed(2)} / foot events ${s.footEvents}`;
    const d=s.revision.document;
    this.budget=d===null?'':`${d.nodes.length} entities / ${d.assets.length} shared assets / ${p.model.vertices} skin vertices / ${this.triangles} drawn triangles`;
    this.source=s.source;uiState.dirty=true;
  }
  override onUpdate(dt:number):void{
    const s=this.state;
    if(wasPressed(Btn.A))this.interactAction();
    if(wasPressed(Btn.Start))this.reloadAction();
    if(wasPressed(Btn.X))this.debugAction();
    if(wasPressed(Btn.Y))this.failAction();
    if(wasPressed(Btn.Select))this.sourceAction();
    if(wasPressed(Btn.L))this.pauseAction();
    if(wasPressed(Btn.R))this.seekAction();
    let dx=gamepadAxis(0,GamepadAxis.LeftX),dz=gamepadAxis(0,GamepadAxis.LeftY);
    if(Math.abs(dx)<.15)dx=0;if(Math.abs(dz)<.15)dz=0;
    dx+=(isDown(Btn.Right)||isZonePressed('right')?1:0)-(isDown(Btn.Left)||isZonePressed('left')?1:0);
    dz+=(isDown(Btn.Down)||isZonePressed('down')?1:0)-(isDown(Btn.Up)||isZonePressed('up')?1:0);
    s.step(dx,dz,isDown(Btn.B)||isZonePressed('run'),Math.min(dt,.05));
    if(dx!==0||dz!==0||!s.animationPaused)uiState.dirty=true;
    this.age+=dt;if(this.age>.2){this.age=0;this.refresh();}
  }
  override onDraw(w:number,h:number):void{
    const s=this.state;this.draws++;this.triangles=render(s.revision.scene,s.camera,0,0,w,h);
    rect(0,0,w,88,0x172129);text(20,16,this.title,0xf4ddae,2);text(20,53,this.description,0xffffff,1);
    rect(0,h-104,w,104,0x172129);
    text(20,h-88,'ARROWS / WASD MOVE   X RUN   SPACE INTERACT   ENTER REIMPORT   C INSPECT   V BAD REVISION',0xf4ddae,1);
    text(20,h-64,this.animationLabel,0x90b3ba,1);
    text(20,h-42,'Q PAUSE POSE / E SEEK POSE / TAB SOURCE',0xffffff,1);
    text(20,h-21,this.budget,0x90b3ba,1);
    if(s.debug){rect(12,103,w-24,70,0x172129);text(20,115,'INSPECTOR / authored collision + trigger boxes',0xf4ddae,1);text(20,139,this.source,0xffffff,1);}
    const y=h-270;
    rect(18,y,132,132,0x172129);text(68,y+12,'UP',0xffffff,1);text(27,y+60,'<',0xffffff,2);text(115,y+60,'>',0xffffff,2);text(60,y+104,'DOWN',0xffffff,1);
    registerTapZone('up',55,y,58,45,this.idleAction);registerTapZone('left',18,y+42,45,52,this.idleAction);registerTapZone('right',108,y+42,45,52,this.idleAction);registerTapZone('down',55,y+90,58,42,this.idleAction);
    rect(w-195,y+60,175,65,0x172129);text(w-170,y+84,'DELIVER / GATE',0xf4ddae,1);
    registerTapZone('interact',w-195,y+60,175,65,this.interactAction);
    rect(w-195,y+8,175,44,0x172129);text(w-155,y+22,'HOLD RUN',0xffffff,1);registerTapZone('run',w-195,y+8,175,44,this.idleAction);
    registerTapZone('reload',0,0,w*.5,85,this.reloadAction);registerTapZone('inspect',w*.5,0,w*.5,85,this.debugAction);
    registerTapZone('source',20,h-48,400,30,this.sourceAction);
  }
}
