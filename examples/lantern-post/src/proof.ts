import { GameState } from './state';
import { readText } from 'zinc:assets';
import { SceneDocument } from 'zinc:3d/scene';
function check(ok:boolean,why:string):void{if(!ok)throw new Error('Lantern Post proof: '+why);}
function walkTo(game:GameState,x:number,z:number):void{
  for(let frame=0;frame<800;frame++){
    const dx=x-game.courier.position[0],dz=z-game.courier.position[2],length=Math.sqrt(dx*dx+dz*dz);
    if(length<.07)return;
    game.step(dx/length,dz/length,false,1/60);
  }
  throw new Error('route blocked before '+x+','+z);
}
function deliver(game:GameState,id:string):void{
  const target=game.target('delivery-'+id),x=(target.minX+target.maxX)/2,z=(target.minZ+target.maxZ)/2;
  walkTo(game,x,game.courier.position[2]);walkTo(game,x,z);game.interact();
  check(game.delivered.has(id),'delivery '+id);
}
export function prove(game:GameState):void{
  for(let frame=0;frame<80;frame++)game.step(0,-1,false,1/60);
  check(game.courier.position[2]>.9,'closed gate did not block courier');
  game.interact();check(game.gateOpen,'gate interaction');
  deliver(game,'west');check(game.delivered.size===1,'first delivery');
  game.animation.play('Walk',0);game.animation.seek(.4);
  const beforeDuration=game.animation.model.durations[game.animation.clip],phase=game.animation.time/beforeDuration;
  const x=game.courier.position[0],z=game.courier.position[2];
  check(game.apply(readText('revised.json')),'real Blender edited publication');
  check(game.delivered.size===1&&game.gateOpen&&game.courier.position[0]===x&&game.courier.position[2]===z,'compatible gameplay state lost');
  check(Math.abs(game.animation.model.durations[game.animation.clip]-beforeDuration*2)<.001,'Walk was not really retimed');
  check(Math.abs(game.animation.time/game.animation.model.durations[game.animation.clip]-phase)<.00001,'clip normalized phase lost');
  const document=game.revision.document,model=game.animation.model;
  const malformed:SceneDocument=JSON.parse(readText('revised.json'));
  for(const a of malformed.assets)if(a.kind==='skin'&&a.events!==undefined)a.events[0].time=999;
  check(!game.apply(JSON.stringify(malformed)),'invalid character event metadata accepted');
  check(game.revision.document===document&&game.animation.model===model&&game.delivered.size===1,'failed animation revision changed live game');
  game.badRevision();check(game.revision.document===document&&game.delivered.size===1,'malformed scene changed live game');
  const blocked:SceneDocument=JSON.parse(readText('revised.json'));
  const spawn=blocked.nodes.find((n)=>n.id==='player-spawn');
  const gate=blocked.nodes.find((n)=>n.id==='gate');
  if(spawn!==undefined&&gate!==undefined){gate.translation[0]=spawn.translation[0];gate.translation[2]=spawn.translation[2];}
  game.gateOpen=false;
  check(!game.apply(JSON.stringify(blocked)),'blocked spawn accepted');
  game.gateOpen=true;
  check(game.revision.document===document&&game.delivered.size===1,'blocked spawn changed live state');
  deliver(game,'east');deliver(game,'post');
  const count=game.delivered.size;game.interact();check(game.delivered.size===count,'delivery counted twice');
  game.debug=true;game.debugRoot.visible=true;game.animationPaused=true;game.animation.paused=true;
  game.status='Three deliveries complete. Gate + Walk artist revision preserved state; bad imports rejected.';
  console.log('Lantern Post proof: three collision-aware deliveries; actual gate edit + 1s-to-2s Walk reimport preserves quest, actor and normalized clip phase; bad animation + scene revisions retain live game');
}
