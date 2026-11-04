import {
  W,H,R2,COS,pix,zb,ground,groundZ,kinds,KIND_GRASS,bakedPix,bakedZ,shadowMask,staticShadow,
  Color,rgbColor,hash,noise,unproject,configureRenderer,setLighting,setVegetation,
  growTree,growGrass,sphere,plot,capsule,bakeOcclusion,applyShadows,copyInto,
} from '../renderer';
import { pine } from '../models/pine';
import { Season } from './seasons';

export function channelHalf(y: number): number { return 6.3 + Math.sin(y * .24) * .55; }
export function bakeRiver(season: Season): void {
  configureRenderer(16,.95,-.25);
  setLighting(season.cool,season.warm);
  setVegetation(season.grass,season.deep,season.mid,season.light);
  for (let iy = 0; iy < H; iy++) {
    for (let ix = 0; ix < W; ix++) {
      const p = unproject(ix+.5,iy+.5), index = iy*W+ix;
      const edge = Math.pow(Math.pow(Math.abs(p.x)/15.2,4)+Math.pow(Math.abs(p.y)/13.2,4),.25);
      const rough = edge + (noise(p.x*.8,p.y*.8)-.5)*.09;
      if (rough > 1.035 || rough > .94 && hash(ix,iy) < (rough-.94)/.095) continue;
      const shore = Math.abs(p.x) - channelHalf(p.y);
      let color: Color;
      if (shore < 0) {
        kinds[index] = 2;
        const tone = Math.max(0,Math.min(3,Math.floor(1.2+noise(p.x*.35,p.y*.3)*1.5+hash(ix,iy)*.2)));
        color = season.snow && shore > -1.2 && hash(ix,iy)>.2 ? [183,204,202] : season.water[tone];
      } else if (shore < .75) {
        kinds[index] = 1;
        color = season.soil;
      } else {
        kinds[index] = KIND_GRASS;
        color = season.grass[Math.max(0,Math.min(4,Math.floor(noise(p.x*.6,p.y*.6)*4+hash(ix,iy)*.5)))];
      }
      pix[index] = rgbColor(color); ground[index] = 1; zb[index] = (p.x+p.y)/R2*COS;
    }
  }
  copyInto(groundZ,zb);
  if (!season.snow) growGrass();
  const pines: number[][] = [[-10,-8,4.8],[-12,-2,6.8],[-10,7,6],[-12,8,7.2],[10,-9,7.5],[12,-3,6.8],[10,6,6.5],[12,8.5,7]];
  for (let i = 0; i < pines.length; i++) pine(pines[i][0],pines[i][1],pines[i][2],season.pine,season.snow,i*19);
  growTree(-9,1.4,1.1,season.snow?0:220,123);
  growTree(10,2.5,.9,season.snow?0:190,432);
  if (season.snow) {
    for (const x of [-9,10]) {
      for (let k = 0; k < 5; k++) {
        const side = k%2===0 ? -1 : 1;
        capsule([x,.5,2.6],[x+side*(.7+k*.12),.5+k*.3,4.3+k*.18],.10,.025,():Color=>[109,98,83],'rough');
      }
    }
  }
  for (let i = 0; i < 20; i++) {
    const y = -11 + hash(i,91)*22;
    const x = (i%2===0?-1:1)*(channelHalf(y)+hash(i,92)*1.6);
    const radius = .28+hash(i,93)*.65;
    sphere(x,y,radius*.18,radius,season.snow?[208,218,213]:[143,145,124],'rough');
  }
  if (!season.snow) {
    for (let i = 0; i < 110; i++) {
      const x=(i%2===0?-1:1)*(7.4+hash(i,15)*4.5),y=(hash(i,16)-.5)*24;
      if (season.name==='PRINTEMPS') sphere(x,y,.18,.07,i%3===0?[237,220,148]:[220,214,193],'solid');
    }
  }
  bakeOcclusion(); copyInto(staticShadow,shadowMask); applyShadows(groundZ);
  copyInto(bakedPix,pix); copyInto(bakedZ,zb);
}
