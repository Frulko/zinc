import { SceneRevision } from 'zinc:3d/scene';
import { readText } from 'zinc:assets';
import { render, Light } from 'zinc:3d';
import { onFrame, width, height, rect, text, wasPressed, Btn } from 'zinc:gfx';
const revision=new SceneRevision();
if(!revision.reload(readText('scene.runtime.json'),''))throw new Error(revision.error);
const camera=revision.cameraFor('overview-camera');
const document=revision.document;
if(document===null||document.worlds===undefined||document.worlds.length!==1)throw new Error('missing compiled world');
console.log(`world scene ${document.nodes.length} entities ${document.assets.length} assets ${document.worlds[0].cells} cells ${document.worlds[0].chunks.length} chunks`);
const before=revision.scene;
if(revision.reload('{broken','')||revision.scene!==before)throw new Error('failed revision replaced live world');
console.log('world rollback preserved');
const world=document.worlds[0];
let selected:i32=0;
onFrame((dt:number)=>{
  if(wasPressed(Btn.Right))selected=(selected+1)%world.provenance.logicalNodes.length;
  revision.updateWorlds(camera,width()/height(),dt);render(revision.scene,camera,0,0,width(),height());
  rect(0,0,width(),82,0x172129);text(20,18,'LANTERN / BLENDER WORLD',0xf4ddae,2);
  text(20,52,'26 authored nodes / 12 entities / 14 fused identities / 2 cells',0xffffff,1);
  const source=world.provenance.logicalNodes[selected];
  rect(0,height()-78,width(),78,0x172129);text(20,height()-62,source.id,0xf4ddae,1);
  text(20,height()-42,source.source.file+' / '+source.source.object,0x90b3ba,1);
  text(20,height()-22,'SOURCE [RIGHT] / static collision metadata preserved / original Blender project included',0xffffff,1);
});
if(world.provenance.logicalNodes.length!==14)throw new Error('lost static object identities');
let walls:i32=0;
for(const record of world.provenance.logicalNodes){
  if(revision.nodes.has(record.id))throw new Error('static descendant became an entity');
  if(record.metadata.collision!==undefined)walls++;
}
if(walls!==2)throw new Error('static collisions lost');
let mapped=false;
for(const source of world.provenance.sources)for(const location of source.in){
  let chunk:i32=-1;for(let i=0;i<world.chunks.length;i++)if(world.chunks[i].uri===location[2])chunk=i;
  if(chunk<0)throw new Error('provenance references absent chunk');
  const candidates=revision.sourcesForWorld(world.id,chunk,location[3],location[0]);
  for(const candidate of candidates)if(candidate.id===source.id)mapped=true;
}
if(!mapped)throw new Error('Inspector source mapping unavailable');
const saved=revision.worlds.get(world.id);
const publication=readText('scene.runtime.json');
for(let i=0;i<8;i++)if(!revision.reload(publication,'')||revision.worlds.get(world.id)!==saved)throw new Error('unchanged world was replaced');
const bad:any=JSON.parse(publication);bad.worlds[0].chunks[0].hash='0'.repeat(64);
if(revision.reload(JSON.stringify(bad),'')||revision.worlds.get(world.id)!==saved)throw new Error('bad chunk replaced live world');
console.log('world proof: static collisions, Inspector candidates, reuse and rollback');

revision.scene.background=0x24333b;revision.scene.ambient=0xa0a0a0;
revision.scene.lights.push(new Light(-.4,-1,-.6,0xffffff));
