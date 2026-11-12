import { Table, parseTable } from '../../../examples/pinball-kit/format/table';
import { TableSource } from '../../../examples/pinball-kit/format/source';
import { TableScene } from '../../../examples/pinball3d/src/scene';
import { TableAudio } from '../../../examples/pinball3d/src/audio';
import { resourceStats } from 'zinc:__diagnostics';
import { onFrame, quit } from 'zinc:gfx';
import { tone } from 'zinc:audio';
function check(ok: boolean, why: string): void { if (!ok) throw new Error(why); }
function definition(): any { return parseTable('{"format":"zinc-pinball-table","version":1,"name":"lifetime","plunger":{"at":[48.35,100]},"sounds":[{"id":"beep","hz":440,"seconds":0.01}]}','lifetime'); }
function count(name: string): number {
  const stats: any = JSON.parse(resourceStats());
  check(stats[name] !== undefined, 'real native resource provider ' + name);
  return stats[name].objects;
}
class BrokenSource extends TableSource {
  has(name: string): boolean { return true; }
  text(name: string): string { throw new Error('deliberate model read failure'); }
}
let ran = false;
onFrame(() => {
  if (ran) return; ran = true;
  // Register the actual provider before recording the empty-pool baseline.
  const warm = new TableScene(new Table(definition(),null)); warm.dispose();
  const meshes = count('3d.meshes'), targets = count('3d.targets');
  for (let cycle = 0; cycle < 3; cycle++) {
    const table = new Table(definition(),null), old = new TableScene(table);
    if (cycle > 0) { old.setBall(0,10,10,1,0,0,0,1); old.setBall(1,20,20,1,0,0,0,1); }
    old.setCamera(table.def.layouts.landscape); old.render(0,0,32,32);
    check(count('3d.meshes') > meshes && count('3d.targets') > targets, 'scene owns native meshes/target');
    old.dispose();
    check(count('3d.meshes') === meshes && count('3d.targets') === targets, 'scene releases unique meshes including unused/shared ball mesh');
    const next = new TableScene(table); old.dispose();
    check(count('3d.meshes') > meshes, 'repeat close cannot free replacement');
    let refused = false; try { old.render(0,0,32,32); } catch (error) { refused = true; }
    check(refused,'closed render refused'); next.dispose();
  }
  const broken: any = definition(); broken.models = [{id:'broken',mesh:'bad.obj',shape:'box',at:[0,0,0],rotation:[0,0,0],scale:[1,1,1],collide:'none',surface:'',look:'',sounds:{hit:''}}];
  let failed = false;
  try { new TableScene(new Table(broken,new BrokenSource())); } catch (error) { failed = true; }
  check(failed && count('3d.meshes') === meshes && count('3d.targets') === targets,'partial scene construction rollback');
  const outside = tone(880,0.1); outside.loop = true; outside.play();
  const table = new Table(definition(),null), audio = new TableAudio(table); audio.preview('beep'); audio.stop();
  check(outside.playing,'table stop preserves another owner'); audio.dispose();
  const replacement = new TableAudio(table); audio.dispose(); check(replacement.preview('beep'),'repeat unload preserves replacement'); replacement.dispose();
  let refused = false; try { audio.preview('beep'); } catch (error) { refused = true; }
  check(refused,'closed audio refused'); outside.unload();
  const bad: any = definition(); bad.sounds.push(bad.sounds[0]);
  for (let i=0;i<260;i++) {
    let rejected=false;try { new TableAudio(new Table(bad,null)); } catch(error) { rejected=true; }
    check(rejected,'duplicate sound rollback');
    const current=new TableAudio(table);check(current.preview('beep'),'released native sound slot reused');current.dispose();
  }
  console.log('pinball lifetime: native mesh/target release, constructor rollback, stale owner and audio slot reuse passed');
  quit();
});
