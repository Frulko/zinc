import { Color, clamp } from '../renderer';

export interface Species { name: string; color: Color; length: number; strength: number; }
export const species: Species[] = [
  {name:'Truite',color:[125,139,111],length:34,strength:.7},
  {name:'Perche',color:[122,143,79],length:26,strength:.55},
  {name:'Carpe',color:[163,141,85],length:45,strength:.85},
  {name:'Brochet',color:[108,132,99],length:58,strength:1},
  {name:'Gardon',color:[164,176,153],length:21,strength:.45},
];
export interface Catch { species: number; length: number; }
export const catches: Catch[] = [];
export const fishing = {
  phase:'ready',time:0,phaseTime:0,aimX:5.2,aimY:1.8,floatX:5.2,floatY:1.8,
  holding:false,aiming:false,tension:.3,distance:0,initialDistance:0,overload:0,slack:0,
  wait:0,attempts:0,species:0,length:0,best:0,seed:31987 as u32,reason:'',event:'',eventId:0,
};
function random():number {
  fishing.seed=(Math.imul(fishing.seed as i32,1664525)+1013904223) as u32;
  return fishing.seed/4294967296;
}
function phase(name:string):void {fishing.phase=name;fishing.phaseTime=0;}
function event(name:string):void {fishing.event=name;fishing.eventId++;}
export function resetFishing():void {
  catches.length=0;fishing.attempts=0;fishing.best=0;fishing.seed=31987;
  fishing.aimX=5.2;fishing.aimY=1.8;fishing.holding=false;fishing.aiming=false;
  fishing.event='';fishing.reason='';phase('idle');
}
export function setFishingAim(x:number,y:number):void {
  if(fishing.phase!=='idle'||!Number.isFinite(x)||!Number.isFinite(y))return;
  fishing.aimX=clamp(x,1.8,11.5);fishing.aimY=clamp(y,-6.5,7.5);
}
export function castLine():boolean {
  if(fishing.phase!=='idle')return false;
  fishing.floatX=fishing.aimX;fishing.floatY=fishing.aimY;
  fishing.wait=3+random()*3.5;
  fishing.species=(fishing.attempts*3+Math.floor(random()*2))%species.length;
  fishing.length=Math.round(species[fishing.species].length*(.8+random()*.5));
  fishing.attempts++;fishing.aiming=false;phase('casting');event('throw');return true;
}
export function strike():boolean {
  if(fishing.phase!=='bite')return false;
  fishing.initialDistance=6+species[fishing.species].strength*4;
  fishing.distance=fishing.initialDistance;fishing.tension=.35;fishing.overload=0;fishing.slack=0;
  phase('reeling');event('line');return true;
}
export function reel(holding:boolean):void {fishing.holding=fishing.phase==='reeling'&&holding;}
export function continueFishing():void {
  if(fishing.phase==='caught'||fishing.phase==='escaped'){fishing.holding=false;phase('idle');}
}
function escape(reason:string):void {
  fishing.holding=false;fishing.reason=reason;phase('escaped');event('splash');
}
export function advanceFishing(seconds:number):void {
  const dt=Math.max(0,Math.min(.04,seconds));
  fishing.time+=dt;fishing.phaseTime+=dt;
  if(fishing.phase==='casting'&&fishing.phaseTime>.9){phase('waiting');event('soft');}
  else if(fishing.phase==='waiting'&&fishing.phaseTime>=fishing.wait){phase('bite');event('fish');}
  else if(fishing.phase==='bite'&&fishing.phaseTime>1.8)escape('Le bouchon a plongé… le poisson est reparti.');
  else if(fishing.phase==='reeling'){
    const strength=species[fishing.species].strength;
    const rush=(Math.sin(fishing.time*2.3)+1)*.5;
    fishing.tension=clamp(fishing.tension+((fishing.holding ? .25 : -.42)+rush*.19*strength)*dt,0,1.2);
    fishing.distance=Math.max(0,fishing.distance+(fishing.holding?-(1.9-rush*.6*strength):.18)*dt);
    fishing.overload=fishing.tension>1?fishing.overload+dt:0;
    fishing.slack=fishing.tension<.04?fishing.slack+dt:0;
    if(fishing.overload>.35){escape('Le fil était trop tendu. Relâchez un peu la prochaine fois.');return;}
    if(fishing.slack>2.8){escape('Le fil est resté détendu. Le poisson s’est libéré.');return;}
    if(fishing.distance<.65){
      catches.push({species:fishing.species,length:fishing.length});
      fishing.best=Math.max(fishing.best,fishing.length);fishing.holding=false;
      phase('caught');event('fish');
    }
  }
}
