import { PixelGame } from '../game';
import { unproject } from '../renderer';
import { sound,setAmbience } from '../audio';
import { river,logs,spawnLog,resetRiver,advanceRiver,steerRiver,RUN_SECONDS } from './state';
import { seasons } from './seasons';
import { bakeRiver } from './scenery';
import { bakeRiverModels } from './models';
import { drawRiver } from './render';

export class RiverGame extends PixelGame {
  private lastHits: number = 0;
  private lastPaddle: number = -10;
  private lastBird: number = 0;
  constructor() {
    super('river','LES DRAVEURS','← → / A D : pagayer · Glisser : diriger · S : saison · P : pause');
    this.cropX=5;this.cropY=35;this.cropWidth=350;this.cropHeight=220;
    this.seasonNames=['PRINTEMPS','ÉTÉ','AUTOMNE','HIVER'];
    this.selectedSeason=1;
  }
  override init():void {
    river.time=0;resetRiver();river.phase='ready';this.lastHits=0;
    this.season(this.selectedSeason);
    for(let i=0;i<3;i++){spawnLog();logs[i].y=-8+i*5;logs[i].baseX=i===1?-2.5:2.5;logs[i].x=logs[i].baseX;}
  }
  override reset():void {resetRiver();this.lastHits=0;}
  override season(index:i32):void {
    this.selectedSeason=index<0?((this.selectedSeason+1)%4) as i32:index;
    river.season=this.selectedSeason;
    const season=seasons[this.selectedSeason];
    bakeRiver(season);bakeRiverModels(season.snow);setAmbience(season.ambience);
  }
  override update(dt:number):void {
    advanceRiver(dt);
    if(river.hits!==this.lastHits){sound('wood',1);sound('splash',.4);this.lastHits=river.hits;}
    if(river.phase==='play'&&Math.abs(river.velocity)>.3&&river.time-this.lastPaddle>.65){sound('soft',.4);this.lastPaddle=river.time;}
    if(river.time-this.lastBird>13&&!seasons[river.season].snow){sound('bird',.3);this.lastBird=river.time;}
    this.actionLabel=river.phase==='ready'?'EMBARQUER [ENTRÉE]':river.phase==='over'||river.phase==='won'?'REPARTIR [ENTRÉE]':'';
    this.score='COQUE '+river.lives+'/3 · '+river.avoided+' rondins évités · '+Math.max(0,Math.ceil(RUN_SECONDS-river.elapsed))+' s';
    this.status=river.phase==='ready'?'Descendez la rivière et évitez les rondins pendant 45 secondes.':river.phase==='over'?'La coque a cédé. Une autre descente ?':river.phase==='won'?'Le camp est en vue. Belle descente !':'Anticipez les passages et gardez une voie libre.';
    if(river.phase==='play'&&river.time-river.hitAt<1.2)this.status='Un choc ! La coque peut encore tenir.';
  }
  override draw():void {drawRiver();}
  override pointer(x:number,y:number,phase:i32):void {
    if(phase===0||phase===1){if(river.phase!=='play')return;const p=unproject(x,y);steerRiver(p.x);}
    if(phase===2||phase===3)river.steering=false;
  }
  override key(name:string,down:boolean):void {
    if(down&&(name==='Enter'||name===' ')&&river.phase!=='play'){this.reset();return;}
    if(name==='ArrowLeft'||name==='a'||name==='A'){river.left=down;river.steering=false;}
    if(name==='ArrowRight'||name==='d'||name==='D'){river.right=down;river.steering=false;}
  }
}
