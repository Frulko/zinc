import { SceneDocument, SceneRecord } from 'zinc:3d/scene';
import { mat4, mat4Compose, mat4Multiply } from 'zinc:3d';
export class Volume {
  id: string; event: string; source: string;
  minX=0; maxX=0; minY=0; maxY=0; minZ=0; maxZ=0;
  constructor(id: string,event: string,source: string) { this.id=id; this.event=event; this.source=source; }
  contains(x: number,z: number,radius: number): boolean {
    const nx=Math.max(this.minX,Math.min(this.maxX,x)), nz=Math.max(this.minZ,Math.min(this.maxZ,z));
    const dx=x-nx,dz=z-nz; return dx*dx+dz*dz<radius*radius;
  }
}
export class World {
  collisions: Volume[]=[]; triggers: Volume[]=[];
  constructor(document: SceneDocument) {
    const records=new Map<string,SceneRecord>(), cache=new Map<string,number[]>();
    for (const n of document.nodes) records.set(n.id,n);
    for (const n of document.nodes) {
      const c=n.metadata.collision, t=n.metadata.trigger;
      if (n.dynamic===true || (c===undefined && t===undefined)) continue;
      const size=c!==undefined?c.size:t!==undefined?t.size:[1,1,1];
      const matrix=worldMatrix(n,records,cache);
      const volume=new Volume(n.id,t!==undefined?t.event:'',n.source.file+' / '+n.source.object);
      volume.minX=volume.minY=volume.minZ=1e9; volume.maxX=volume.maxY=volume.maxZ=-1e9;
      for(let mask=0;mask<8;mask++) {
        const x=((mask&1)!==0?.5:-.5)*size[0],y=((mask&2)!==0?.5:-.5)*size[1],z=((mask&4)!==0?.5:-.5)*size[2];
        const wx=matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],wy=matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],wz=matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14];
        if(!Number.isFinite(wx)||!Number.isFinite(wy)||!Number.isFinite(wz)) throw new Error(n.id+': collision transform overflow');
        volume.minX=Math.min(volume.minX,wx);volume.maxX=Math.max(volume.maxX,wx);
        volume.minY=Math.min(volume.minY,wy);volume.maxY=Math.max(volume.maxY,wy);
        volume.minZ=Math.min(volume.minZ,wz);volume.maxZ=Math.max(volume.maxZ,wz);
      }
      if(c!==undefined)this.collisions.push(volume);if(t!==undefined)this.triggers.push(volume);
    }
  }
  blocked(x:number,z:number,gateOpen:boolean):boolean {
    if(x < -6.4||x>6.4||z < -5.4||z>5.4)return true;
    for(const c of this.collisions) if(!(c.id==='gate'&&gateOpen)&&c.contains(x,z,.22))return true;
    return false;
  }
}
function worldMatrix(n:SceneRecord,records:Map<string,SceneRecord>,cache:Map<string,number[]>):number[] {
  const known=cache.get(n.id);if(known!==undefined)return known;
  const local=mat4Compose(mat4(),n.translation,n.rotation,n.scale);
  const parent=n.parent===null?undefined:records.get(n.parent);
  const world=parent===undefined?local:mat4Multiply(mat4(),worldMatrix(parent,records,cache),local);
  cache.set(n.id,world);return world;
}
