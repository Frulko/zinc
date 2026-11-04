import {
  W,H,pix,zb,bakedPix,bakedZ,Color,copyInto,drawLeaves,drawTufts,shadowMask,
  project,plot,hash,rgb,rgbColor,sphere,capsule,figure,dynamicAdd,pendingShadows,
  flushShadows,castShadow,applyShadows,shadeEdges,
} from '../renderer';
import { waterPoint, ripple } from '../models/water';
import { gull, fish } from '../models/animals';
import { river, logs, BOAT_Y } from './state';
import { seasons } from './seasons';
import { drawCanoe,logModels } from './models';

const PADDLER = {shirt:[172,78,48],stripe:[194,129,73],legs:[62,67,65],hair:[63,46,34],skin:[214,166,128]};
const PADDLE: Color = [166,128,77];

export function drawRiver(): void {
  const time = Math.floor(river.time*8)/8, season = seasons[river.season];
  copyInto(pix,bakedPix); copyInto(zb,bakedZ); shadowMask.fill(0); pendingShadows.length=0;
  drawLeaves(time); drawTufts(time);
  const foam = rgbColor(season.snow?[173,197,201]:[144,183,160]);
  for(let k=0;k<260;k++) {
    const x=(hash(k,37)-.5)*11.3;
    const y=((hash(k,38)*27+time*(1.7+hash(k,39)))%27)-13.5;
    for(let j=0;j<3;j++) waterPoint(x+Math.sin(y*.5+k)*.12,y+j*.13,foam);
  }
  for(const log of logs) {
    if(!log.active)continue;
    const bob=Math.round(Math.sin(time*2+log.seed)*1)/10;
    logModels[log.model].drawAt(log.x,log.y,bob);
    castShadow(log.x,log.y,.3,.6);
    ripple(log.x,log.y-.6,.35+(time*.8+log.seed)%1,foam,true);
  }
  const boatZ=Math.round(Math.sin(time*2.2)*1)/10;
  drawCanoe(river.x,BOAT_Y,boatZ);
  figure(river.x,BOAT_Y-.15,Math.PI/2,{z:boatZ+.25,scale:.72,crouch:.9,lean:.15,stance:.12,armR:1.1,armL:.8},PADDLER,dynamicAdd);
  const side=river.velocity<0?-1:1;
  const stroke=Math.sin(time*6);
  capsule([river.x+side*.2,BOAT_Y-.25,boatZ+1.1],[river.x+side*1.05,BOAT_Y+stroke*.6,boatZ+.05],.04,.055,():Color=>PADDLE,'solid');
  capsule([river.x+side*.95,BOAT_Y+stroke*.6,boatZ+.15],[river.x+side*1.15,BOAT_Y+stroke*.6-.25,boatZ-.1],.11,.14,():Color=>PADDLE,'solid');
  for(let k=0;k<4;k++)ripple(river.x,BOAT_Y-1.8-k*.42,.22+k*.17,foam,true);
  const flying=time%19>14;
  gull(-2+Math.sin(time*.35)*3,-7, flying?4.5: .2,time,flying);
  const jump=(time+1)%9;
  fish(4.7,7.7,jump<1.1?.12+Math.sin(jump/1.1*Math.PI):.05,Math.PI,time,jump>=1.1);
  // A beaver at the bank shares the same quiet volumes and lighting as the paddler.
  const tail=Math.sin(time*.7)*.06;
  capsule([-7.5,7,.2],[-7.1,7,.3],.23,.3,():Color=>[116,87,60],'rough');
  sphere(-6.9,7,.55,.23,[135,103,70],'solid');
  capsule([-7.7,7,.12],[-8.15,7+tail,.08],.13,.2,():Color=>[80,72,56],'solid');
  sphere(-6.97,7.16,.76,.065,[111,85,61],'solid');
  flushShadows(); applyShadows(bakedZ); shadeEdges();
  if(season.snow) {
    for(let k=0;k<80;k++) {
      const x=(hash(k,71)-.5)*28+Math.sin(time*.4+k)*.4;
      const y=(hash(k,72)-.5)*24;
      const z=7-((hash(k,73)*7+time*.85)%7);
      plot(x,y,z,rgb(228,235,224));
    }
  } else if(river.season===2) {
    for(let k=0;k<14;k++) {
      const age=(time*.16+hash(k,94))%1;
      sphere((k%2===0?-1:1)*(7.3+Math.sin(k)*.7)+age*.9,(hash(k,95)-.5)*22,5-age*5,.07, k%2===0?[198,125,50]:[166,73,40],'solid');
    }
  }
  const impact=river.time-river.hitAt;
  if(impact>=0&&impact<1.2) {
    ripple(river.x,BOAT_Y,.3+impact*1.5,rgb(223,225,191));
    for(let k=0;k<12;k++) {
      const angle=k*Math.PI/6,z=impact*3.5-impact*impact*5;
      if(z>0)plot(river.x+Math.cos(angle)*impact*1.5,BOAT_Y+Math.sin(angle)*impact*1.5,z,rgb(235,235,206));
    }
  }
}
