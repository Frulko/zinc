import { ok, equal } from 'zinc:assert';
import { Balote, G as bocce } from '../../../examples/pixel-plays/src/native/games/balote';
import { StariMost, G as diving } from '../../../examples/pixel-plays/src/native/games/stari-most';
import { Laundry, G as laundry } from '../../../examples/pixel-plays/src/native/games/laundry';
import { TieBreak, G as tennis } from '../../../examples/pixel-plays/src/native/games/tie-break';
import { MiniRamp, G as skate } from '../../../examples/pixel-plays/src/native/games/mini-ramp';
import { game, startRound, setAim, throwParcel, advanceGame, boatPosition, flightTo } from '../../../examples/pixel-plays/src/native/harbor/state';
import { river, logs, resetRiver, spawnLog, logHitsBoat, advanceRiver, steerRiver } from '../../../examples/pixel-plays/src/native/river/state';
import { fishing, catches, resetFishing, castLine, strike, reel, advanceFishing, continueFishing, setFishingAim } from '../../../examples/pixel-plays/src/native/fishing/state';

Math.seed(317);
const balote = new Balote(); balote.init();
for (let i = 0; i < 50000 && bocce.phase !== 'over'; i++) {
  if (bocce.phase === 'aim' && bocce.team === 0) {
    for (let n = 0; n < 35; n++) balote.key('ArrowUp',true);
    balote.key(' ',true);
  }
  if (bocce.phase === 'frame-end' && bocce.timer > .6) balote.key(' ',true);
  balote.update(1/60);
}
ok(bocce.phase === 'over' && Math.max(bocce.score[0],bocce.score[1]) >= 5,'bocce match never finished');
console.log('native rules: Balote full match PASS');

const bridge = new StariMost(); bridge.init();
for (let dive = 0; dive < 5; dive++) {
  bridge.key(' ',true);
  for(let i=0;i<30;i++)bridge.update(1/60);
  bridge.key(' ',false);
  for(let i=0;i<600&&diving.phase!=='under';i++)bridge.update(1/60);
  equal(diving.dive,dive+1,'dive never reached water');
  for(let i=0;i<40;i++)bridge.update(1/60);
  if(dive<4)bridge.key(' ',true);
}
ok(diving.finished && Number.isFinite(diving.total),'diving score/finish invalid');
console.log('native rules: five Stari Most dives PASS');

const wash = new Laundry(); wash.init();
for(let i=0;i<3200&&laundry.phase!=='over';i++){
  if(laundry.held===null)wash.key(' ',true);
  wash.update(1/60);
}
ok(laundry.phase==='over'&&laundry.score>0,'washing never reached basket / timed finish');
console.log('native rules: Laundry collection, storm and timed finish PASS');

const tie = new TieBreak(); tie.init();
for(let i=0;i<20000&&tennis.phase!=='over';i++){
  const ball=tennis.ball;
  if(tennis.phase==='serve-wait'&&tennis.server===0)tie.key(' ',true);
  else if(tennis.phase==='toss'&&tennis.server===0&&ball!==null&&ball!.t>.55)tie.key(' ',true);
  else if(tennis.phase==='rally'&&ball!==null&&ball!.by===1&&!ball!.hit&&ball!.t>=(ball!.wS+ball!.wE)/2)tie.key(' ',true);
  else if(tennis.phase==='point-end'&&tennis.timer>.5)tie.key(' ',true);
  tie.update(1/60);
}
ok(tennis.phase==='over'&&Math.max(tennis.score[0],tennis.score[1])>=7&&Math.abs(tennis.score[0]-tennis.score[1])>=2,'tennis tie-break did not finish correctly');
console.log('native rules: Tie-Break serve, rally and full match PASS');

const ramp = new MiniRamp(); ramp.init(); ramp.key(' ',true);
let held=false;
for(let i=0;i<5000&&skate.phase!=='over';i++){
  const want=skate.air ? skate.airTotal-skate.airT>.55 : Math.abs(skate.s)<3.6||skate.v*skate.s<0;
  if(want!==held){ramp.key(' ',want);held=want;}
  ramp.update(1/60);
}
ok(skate.phase==='over'&&skate.airs>0&&skate.score>0,'skate pump/air/score/timer failed');
console.log('native rules: Mini Ramp pumping, air, score and timed finish PASS');

function ledAim():void {
  let duration=1,x=0,y=0;
  for(let i=0;i<12;i++){
    const target=boatPosition(game.elapsed+duration,game.time+duration);
    x=target.x+1.1;y=target.y;duration=flightTo(x,y).duration;
  }
  setAim(x,y);
}
startRound(); game.time=0;
const now=boatPosition(0,0);setAim(now.x+1.1,now.y);throwParcel();
for(let i=0;i<300&&game.phase!=='aim';i++)advanceGame(1/60);
equal(game.delivered,0,'unled throw unexpectedly caught the moving boat');
for(const step of [1/60,.04]){
  startRound();game.time=0;
  for(let shot=0;shot<5;shot++){
    ledAim();ok(throwParcel());ok(!throwParcel(),'flight accepted a second parcel');
    for(let i=0;i<500&&game.phase!=='aim'&&game.phase!=='over';i++)advanceGame(step);
    equal(game.delivered,shot+1,'leading the boat failed');
  }
  ok(game.phase==='over'&&game.remaining===0&&game.cargo.length===5,'harbor final result failed');
}
startRound();game.elapsed=44.99;setAim(11,7);throwParcel();advanceGame(.04);
ok(game.projectile!==null,'deadline removed in-flight parcel');
for(let i=0;i<500&&game.phase!=='over';i++)advanceGame(1/60);
ok(game.phase==='over'&&game.outcome!==null&&game.outcome!.kind==='splash','last-chance throw never resolved');
console.log('native rules: Harbor anticipation, catches, result and final flight PASS');

resetRiver();let previous=-1;const variants=new Set<number>();
for(let i=0;i<40;i++){
  ok(spawnLog());const log=logs.find((item):boolean=>item.active)!;
  ok(log.variant!==previous,'consecutive logs repeated the same variant');
  variants.add(log.variant);previous=log.variant;log.active=false;
}
equal(variants.size,7,'log variety incomplete');
resetRiver();river.nextLog=1000;
const obstacle=logs[0];obstacle.active=true;obstacle.variant=0;obstacle.x=0;obstacle.baseX=0;obstacle.y=4;obstacle.yaw=0;obstacle.speed=0;obstacle.hit=false;
ok(logHitsBoat(obstacle),'visible trunk did not collide');river.x=4;ok(!logHitsBoat(obstacle),'open lane collided');river.x=0;
advanceRiver(1/60);equal(river.lives,2);
obstacle.hit=false;advanceRiver(1/60);equal(river.lives,2,'invulnerability lost multiple hearts');
resetRiver();river.nextLog=1000;steerRiver(-100);
for(let i=0;i<3000&&river.phase==='play';i++)advanceRiver(1/60);
ok(river.phase==='won'&&river.x>=-4.8&&river.x<=4.8,'river timer or bank bounds failed');
console.log('native rules: seven log shapes, collision, protection, steering and arrival PASS');

resetFishing();ok(!strike(),'hooked before bite');setFishingAim(5,2);ok(castLine());ok(!castLine());
for(let i=0;i<600&&fishing.phase!=='bite';i++)advanceFishing(1/60);
ok(fishing.phase==='bite','no fish ever approached the bait');
for(let i=0;i<120;i++)advanceFishing(1/60);
ok(fishing.phase==='escaped'&&catches.length===0,'late strike was rewarded');
continueFishing();castLine();
for(let i=0;i<600&&fishing.phase!=='bite';i++)advanceFishing(1/60);
ok(strike());reel(true);
for(let i=0;i<600&&fishing.phase==='reeling';i++)advanceFishing(1/60);
ok(fishing.phase==='escaped'&&catches.length===0,'overloaded line did not break');
const seen=new Set<number>();
for(let attempt=0;attempt<6;attempt++){
  continueFishing();castLine();
  for(let i=0;i<600&&fishing.phase!=='bite';i++)advanceFishing(1/60);
  ok(strike());
  let pulling=true;
  for(let i=0;i<2400&&fishing.phase==='reeling';i++){
    if(fishing.tension>.74)pulling=false;
    if(fishing.tension<.32)pulling=true;
    reel(pulling);advanceFishing(1/60);
  }
  ok(fishing.phase==='caught','managed tension did not land fish');
  equal(catches.length,attempt+1);seen.add(fishing.species);
}
ok(seen.size>=3&&fishing.best>0,'catch variation or best length missing');
console.log('native rules: casting, bite window, line break, managed reeling and varied catches PASS');
console.log('pixel-plays native rules PASS');
