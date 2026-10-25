import { Node, Camera, Light, Material, Blend, cube } from 'zinc:3d';
import { AnimatedScene } from 'zinc:animation/scene';
import { AnimationPlayer, SkinnedModel } from 'zinc:animation';
import { validateScene, SceneRecord, SceneAsset } from 'zinc:3d/scene';
import { readText } from 'zinc:assets';
import { env } from 'zinc:sys';
import * as fs from 'zinc:fs';
import { World, Volume } from './world';

export class GameState {
  revision=new AnimatedScene(); world:World;
  camera=new Camera(); courier:Node; companion:Node; animation:AnimationPlayer;
  delivered=new Set<string>(); gateOpen=false; debug=false; animationPaused=false;
  status='Three parcels. A courtyard. One loyal companion.';
  source=''; selected:i32=0; footEvents:i32=0;
  base=env('ZINC_SCENE_DIR');
  private stick=new Node(cube(.07),new Material(0xf5c257));
  private debugMesh=cube(1);
  debugRoot=new Node(null,null);
  private heading=0;
  constructor() {
    if(this.base.length>0&&!this.base.endsWith('/'))this.base+='/';
    this.world=new World({schema:'zinc.scene',version:1,id:'empty',revision:'',source:{tool:'',file:'',scene:''},assets:[],nodes:[]});
    this.courier=new Node(null,null);this.companion=new Node(null,null);
    const factory=this.revision.skinFactory;
    this.revision.skinFactory=(record:SceneRecord,asset:SceneAsset,file:string):Node=>{
      if(factory===null)throw new Error('missing animation factory');
      const model=factory(record,asset,file) as SkinnedModel;
      if(record.id==='companion')for(const clip of ['Idle','Walk','Run'])if(!model.clips.includes(clip)){model.dispose();throw new Error('companion: missing required clip '+clip);}
      return model;
    };
    this.stick.setScale(8,1,1);
    if(!this.reload())throw new Error(this.status);
    const animation=this.revision.animations.get('companion');
    if(animation===undefined)throw new Error('missing companion');
    this.animation=animation;
  }
  text():string { return this.base.length>0?fs.readText(this.base+'scene.json'):readText('scene.json'); }
  reload():boolean { try{return this.apply(this.text());}catch(e){this.status=(e as Error).message;return false;} }
  apply(text:string):boolean {
    try {
      const document=validateScene(text), ids=new Set<string>();for(const n of document.nodes)ids.add(n.id);
      for(const id of ['player-spawn','companion','gate','overview-camera','delivery-west','delivery-east','delivery-post'])if(!ids.has(id))throw new Error('Lantern Post: missing required authored node '+id);
      for(const n of document.nodes){
        if(n.id==='overview-camera'&&n.metadata.camera===undefined)throw new Error('overview-camera: camera metadata required');
        if(n.id==='gate'&&(n.metadata.collision===undefined||n.metadata.gate===undefined))throw new Error('gate: collision and gate metadata required');
        if(n.id.startsWith('delivery-')&&(n.metadata.trigger===undefined||n.metadata.trigger.event!=='delivery:'+n.id.slice(9)))throw new Error(n.id+': unknown delivery behavior');
        if(n.id==='companion'){
          const asset=document.assets.find((a:SceneAsset)=>a.id===n.asset);
          if(asset===undefined||asset.kind!=='skin'||asset.sockets===undefined||!asset.sockets.some((s)=>s.name==='mouth'))throw new Error('companion: skinned asset and mouth socket required');
        }
      }
      const world=new World(document), prior=this.revision.document;
      const authoredSpawn=document.nodes.find((n:SceneRecord)=>n.id==='player-spawn');
      if(authoredSpawn===undefined||authoredSpawn.parent!==null||world.blocked(authoredSpawn.translation[0],authoredSpawn.translation[2],this.gateOpen))throw new Error('player-spawn: blocked or parented spawn; publication rejected');
      const preserve=prior!==null&&prior.id===document.id;
      const x=this.courier.position[0],z=this.courier.position[2],dogX=this.companion.position[0],dogZ=this.companion.position[2];
      if(!this.revision.reload(text,this.base)){this.status=this.revision.error;return false;}
      const actor=this.revision.nodes.get('player-spawn'),dog=this.revision.nodes.get('companion'),animation=this.revision.animations.get('companion');
      if(actor===undefined||dog===undefined||animation===undefined)throw new Error('Lantern Post: companion must be a validated animated asset');
      this.courier=actor;this.companion=dog;this.animation=animation;this.world=world;
      if(preserve){actor.position[0]=x;actor.position[2]=z;dog.position[0]=dogX;dog.position[2]=dogZ;}
      else {this.delivered.clear();this.gateOpen=false;}
      // A moved collider never leaves the courier trapped after a compatible revision.
      if(this.world.blocked(actor.position[0],actor.position[2],this.gateOpen)) {
        actor.position[0]=authoredSpawn.translation[0];actor.position[2]=authoredSpawn.translation[2];
        this.status='Moved collision: courier recovered at authored spawn; deliveries retained.';
      } else this.status=preserve?'Reimported: deliveries, courier and compatible clip phase retained.':'Deliver to the three brass mailboxes.';
      this.animation.onEvent=(name:string):void=>{this.footEvents++;};
      const socket=this.revision.sockets.get('companion/mouth');if(socket!==undefined)socket.add(this.stick);
      this.camera.dispose();this.camera=this.revision.cameraFor('overview-camera');
      this.revision.scene.background=0x25343c;this.revision.scene.ambient=0x898989;
      this.revision.scene.lights.push(new Light(-.4,-1,-.6,0xffffff));
      this.buildDebug();this.poseGate();this.inspect();return true;
    }catch(e){this.status=(e as Error).message;return false;}
  }
  private buildDebug():void {
    this.debugRoot=new Node(null,null);
    const collision=new Material(0xf0a34e),trigger=new Material(0x56d2c4);
    collision.blend=trigger.blend=Blend.Alpha;collision.opacity=trigger.opacity=.22;collision.doubleSided=trigger.doubleSided=true;
    for(const box of this.world.collisions)this.debugBox(box,collision);
    for(const box of this.world.triggers)this.debugBox(box,trigger);
    this.debugRoot.visible=this.debug;this.revision.scene.add(this.debugRoot);
  }
  private debugBox(box:Volume,material:Material):void {
    const node=new Node(this.debugMesh,material);
    node.setPosition((box.minX+box.maxX)/2,(box.minY+box.maxY)/2,(box.minZ+box.maxZ)/2);
    node.setScale(box.maxX-box.minX,box.maxY-box.minY,box.maxZ-box.minZ);this.debugRoot.add(node);
  }
  toggleDebug():void {this.debug=!this.debug;this.debugRoot.visible=this.debug;this.inspect();}
  inspect():void {
    const d=this.revision.document;if(d===null)return;
    const n=d.nodes[this.selected%d.nodes.length];this.source=n.id+' / '+n.source.file+' / '+n.source.object;
  }
  nextSource():void {this.selected++;this.inspect();}
  badRevision():void {this.apply('{"schema":"broken"}');}
  private poseGate():void {const gate=this.revision.nodes.get('gate');if(gate!==undefined)gate.visible=!this.gateOpen;}
  interact():void {
    const x=this.courier.position[0],z=this.courier.position[2];
    for(const target of this.world.triggers)if(target.contains(x,z,.45)) {
      if(!target.event.startsWith('delivery:'))continue;
      const id=target.event.slice(9);
      if(this.delivered.has(id)){this.status='This parcel is already delivered.';return;}
      this.delivered.add(id);
      this.status=this.delivered.size===3?'All three delivered. The lanterns are home.':`Delivered ${id}. ${3-this.delivered.size} parcels remain.`;
      this.revision.state.set('player-spawn',JSON.stringify(this.delivered.values()));return;
    }
    const gate=this.revision.nodes.get('gate');
    if(gate!==undefined&&Math.hypot(x-gate.position[0],z-gate.position[2])<1.5){this.gateOpen=!this.gateOpen;this.poseGate();this.status=this.gateOpen?'Courtyard gate opened.':'Courtyard gate closed.';return;}
    this.status='Stand by a brass mailbox or the courtyard gate, then interact.';
  }
  step(dx:number,dz:number,run:boolean,dt:number):void {
    const length=Math.hypot(dx,dz);if(length>1){dx/=length;dz/=length;}
    const speed=run?4:2.5,actor=this.courier.position;
    if(!this.world.blocked(actor[0]+dx*speed*dt,actor[2],this.gateOpen))actor[0]+=dx*speed*dt;
    if(!this.world.blocked(actor[0],actor[2]+dz*speed*dt,this.gateOpen))actor[2]+=dz*speed*dt;
    if(length>.05){this.heading=Math.atan2(-dx,-dz);this.courier.setRotation(0,this.heading,0);}
    const targetX=actor[0]+Math.sin(this.heading)*.75+Math.cos(this.heading)*.5;
    const targetZ=actor[2]+Math.cos(this.heading)*.75-Math.sin(this.heading)*.5;
    const dog=this.companion.position,fx=targetX-dog[0],fz=targetZ-dog[2],distance=Math.hypot(fx,fz);
    const dogSpeed=distance<.10?0:Math.min(run?4.6:3.4,distance*3);
    if(distance>.01){
      const sx=fx/distance*dogSpeed*dt,sz=fz/distance*dogSpeed*dt;
      if(!this.world.blocked(dog[0]+sx,dog[2],this.gateOpen))dog[0]+=sx;
      if(!this.world.blocked(dog[0],dog[2]+sz,this.gateOpen))dog[2]+=sz;
      this.companion.setRotation(0,Math.atan2(-fx,-fz),0);
    }
    this.animation.play(dogSpeed<.1?'Idle':dogSpeed>3?'Run':'Walk',.2);
    this.animation.paused=this.animationPaused;this.animation.speed=dogSpeed<.1?1:Math.max(.5,dogSpeed/2);
    this.animation.update(dt);
  }
  target(id:string):Volume {for(const v of this.world.triggers)if(v.id===id)return v;throw new Error('missing target '+id);}
}
