import { width,rect,drawText,font,textWidth } from 'zinc:gfx';
import { PixelGame } from '../game';
import { unproject } from '../renderer';
import { sound,setAmbience } from '../audio';
import { bakeFishing } from './scenery';
import { drawFishing } from './render';
import { fishing,catches,species,resetFishing,advanceFishing,setFishingAim,castLine,strike,reel,continueFishing } from './state';

export class FishingGame extends PixelGame {
  private dragging:boolean=false;
  private lastEvent:number=-1;
  private lastReel:number=-10;
  private lastBird:number=0;
  private meterFont:i32=-1;
  constructor(){
    super('fishing','AU FIL DE LA DORDOGNE','Glisser pour lancer · Espace / toucher pour ferrer · Maintenir pour ramener, relâcher pour détendre');
    this.cropX=30;this.cropY=40;this.cropWidth=300;this.cropHeight=210;
    this.meterFont=font('mono',11);
  }
  override init():void {
    bakeFishing();resetFishing();fishing.phase='ready';fishing.time=0;
    this.lastEvent=fishing.eventId;this.lastBird=0;this.lastReel=-10;
    setAmbience('fishing');
  }
  override reset():void {resetFishing();this.dragging=false;}
  override update(dt:number):void {
    advanceFishing(dt);
    if(fishing.eventId!==this.lastEvent){sound(fishing.event,.55);this.lastEvent=fishing.eventId;}
    if(fishing.phase==='reeling'&&fishing.holding&&fishing.time-this.lastReel>.16){sound('reel',.3);this.lastReel=fishing.time;}
    if(fishing.time-this.lastBird>17){sound('bird',.25);this.lastBird=fishing.time;}
    this.actionLabel=fishing.phase==='ready'?'S’INSTALLER [ENTRÉE]':fishing.phase==='caught'||fishing.phase==='escaped'?'PÊCHER ENCORE [ENTRÉE]':'';
    this.score=catches.length+' prise'+(catches.length===1?'':'s')+' · plus belle prise '+fishing.best+' cm';
    this.status='Choisissez un coin de rivière, lancez et attendez la touche.';
    if(fishing.phase==='waiting')this.status='Le bouchon danse doucement. Prenez votre temps…';
    if(fishing.phase==='casting')this.status='La ligne se déploie au-dessus de l’eau.';
    if(fishing.phase==='bite')this.status='ÇA MORD ! Espace / touchez pour ferrer maintenant.';
    if(fishing.phase==='reeling')this.status='Maintenez pour ramener. Relâchez avant que la jauge passe dans le rouge.';
    if(fishing.phase==='caught')this.status=species[fishing.species].name+' de '+fishing.length+' cm. Une belle prise !';
    if(fishing.phase==='escaped')this.status=fishing.reason;
  }
  override draw():void {drawFishing();}
  override drawHud():void {
    if(fishing.phase!=='reeling')return;
    const x=width()/2-130;
    rect(x,106,260,9,0xebe6d8);
    rect(x,106,260*Math.min(1,fishing.tension),9,fishing.tension>.85?0xb36d51:fishing.tension>.65?0xc2a663:0x79957d);
    const label='TENSION DU FIL · '+Math.ceil(fishing.distance)+' m à ramener';
    drawText(this.meterFont,(width()-textWidth(this.meterFont,label,0))/2,122,label,0x84745c,255,0);
  }
  private aim(x:number,y:number):void {const p=unproject(x,y);setFishingAim(p.x,p.y);}
  override pointer(x:number,y:number,phase:i32):void {
    if(phase===0){
      if(fishing.phase==='bite'){strike();reel(true);return;}
      if(fishing.phase==='reeling'){reel(true);return;}
      if(fishing.phase==='idle'){this.dragging=true;fishing.aiming=true;this.aim(x,y);}
    }else if(phase===1&&this.dragging)this.aim(x,y);
    else if(phase===2){
      if(this.dragging){this.aim(x,y);castLine();}
      this.dragging=false;fishing.aiming=false;reel(false);
    }else if(phase===3){this.dragging=false;fishing.aiming=false;reel(false);}
  }
  override key(name:string,down:boolean):void {
    if(name!==' '&&name!=='Enter'){
      if(!down)return;
      if(name==='ArrowLeft')setFishingAim(fishing.aimX-.3,fishing.aimY+.3);
      if(name==='ArrowRight')setFishingAim(fishing.aimX+.3,fishing.aimY-.3);
      if(name==='ArrowUp')setFishingAim(fishing.aimX-.3,fishing.aimY-.3);
      if(name==='ArrowDown')setFishingAim(fishing.aimX+.3,fishing.aimY+.3);
      return;
    }
    if(!down){reel(false);return;}
    if(fishing.phase==='ready'){this.reset();return;}
    if(fishing.phase==='caught'||fishing.phase==='escaped'){continueFishing();return;}
    if(fishing.phase==='idle')castLine();
    else if(fishing.phase==='bite'){strike();reel(true);}
    else if(fishing.phase==='reeling')reel(true);
  }
}
