import { Stage } from 'zinc:stage';
import { Sprite, Event, TouchEvent, Starling, Tween } from '../../../examples/fatty/src/compat/starling';
import { Juggler } from '../../../examples/fatty/src/compat/animation';
import { TextInput } from '../../../examples/fatty/src/compat/text';
import { Assets } from '../../../examples/fatty/src/fatOutFood/assets/Assets';
import { GameEvent } from '../../../examples/fatty/src/fatOutFood/events/GameEvent';
import { PageEvent } from '../../../examples/fatty/src/fatOutFood/events/PageEvent';
import { ConstantsPage } from '../../../examples/fatty/src/fatOutFood/constants/ConstantsPage';
import { ConstantsGame } from '../../../examples/fatty/src/fatOutFood/constants/ConstantsGame';
import { ATarget } from '../../../examples/fatty/src/fatOutFood/game/playGame/target/ATarget';
import { OneShot } from '../../../examples/fatty/src/fatOutFood/game/playGame/target/OneShot';
import { TwoShots } from '../../../examples/fatty/src/fatOutFood/game/playGame/target/TwoShots';
import { ThreeShot } from '../../../examples/fatty/src/fatOutFood/game/playGame/target/ThreeShot';
import { Friend } from '../../../examples/fatty/src/fatOutFood/game/playGame/target/Friend';
import { Character } from '../../../examples/fatty/src/fatOutFood/game/playGame/Character';
import { PageManager } from '../../../examples/fatty/src/fatOutFood/pageManager/PageManager';
import { HomePage } from '../../../examples/fatty/src/fatOutFood/home/HomePage';
import { GameManager } from '../../../examples/fatty/src/fatOutFood/game/GameManager';
import { TutorialPage } from '../../../examples/fatty/src/fatOutFood/game/tutorialGame/TutorialPage';
import { PlayPage } from '../../../examples/fatty/src/fatOutFood/game/playGame/PlayPage';
import { EndPage } from '../../../examples/fatty/src/fatOutFood/game/endGame/EndPage';
import { ScorePage } from '../../../examples/fatty/src/fatOutFood/score/ScorePage';
import { Button } from '../../../examples/fatty/src/compat/display';
import { getHighScores, saveScore } from '../../../examples/fatty/src/services/scores';
import { set } from 'zinc:storage';

function check(ok: boolean, message: string): void { if (!ok) throw new Error(message); }
const stage = new Stage();
const arena = new Sprite();
stage.addChild(arena);
Assets.loadSprites();
let points = 0, deaths = 0, misses = 0;
arena.addEventListener(GameEvent.ON_DIE, (e: GameEvent) => { points += (e.target as ATarget).points; deaths++; });
arena.addEventListener(GameEvent.NO_SHOT, () => { misses++; });
function advance(frames: number): void {
  for (let i = 0; i < frames; i++) { Starling.juggler.advanceTime(1/60); stage.updateTree(1/60); }
}
const targets: ATarget[] = [new OneShot(0,370,1,0,0), new TwoShots(1,370,1,0,0),
  new ThreeShot(2,370,1,0,0), new Friend(3,370,1,0,0)];
for (let i = 0; i < targets.length; i++) {
  const target = targets[i];
  arena.addChild(target);
  const shots = i === 3 ? 1 : i+1;
  const before = deaths;
  for (let shot = 1; shot <= shots; shot++) {
    target.dispatchEvent(new TouchEvent());
    if (shot < shots) { advance(3); check(deaths === before,'target died before enough clicks'); }
  }
  advance(240);
  check(deaths === before+1,'animation COMPLETE must kill exactly one target');
  target.dispatchEvent(new TouchEvent());
  advance(3);
  check(deaths === before+1,'dead target must not score twice');
  arena.removeChild(target);
}
check(points === 55 && misses === 1,'1/2/3-click targets and friend score/life events');
const character = new Character();
check(character.life === 3,'initial lives'); character.life = -1;
check(character.life === 2,'AS3 incremental life setter');

// A detached page must neither finish a transition nor run its old countdown later.
const isolated = new Juggler();
const owner = new Sprite(); arena.addChild(owner);
let calls = 0;
isolated.delayCall(() => calls++,1,owner);
const tween = new Tween(owner,1); tween.onComplete = () => calls++;
isolated.add(tween,owner); isolated.advanceTime(0.1);
arena.removeChild(owner); isolated.advanceTime(2);
check(calls === 0 && isolated.size === 0,'detached animations/timers leaked');

const manager = new PageManager(); stage.addChild(manager); advance(24);
let page = manager.children[1] as Sprite;
check(page instanceof HomePage,'home page');
function navigate(from: Sprite, next: string, score = 0): void {
  const event = new PageEvent(PageEvent.CHANGE_SCREEN); event.page = next; event.score = score;
  from.dispatchEvent(event); advance(24);
}
navigate(page,ConstantsPage.GAME_SCREEN);
const game = manager.children[1] as GameManager;
check(game instanceof GameManager,'game manager');
page = game.children[0] as Sprite;
check(page instanceof TutorialPage,'tutorial');
navigate(page,ConstantsGame.START_PAGE);
page = game.children[0] as Sprite;
check(page instanceof PlayPage,'play page');
advance(300);
check(game.children[0] === page,'skipped tutorial countdown replaced the running game');
navigate(page,ConstantsGame.END_PAGE,55);
page = game.children[0] as EndPage;
check(page instanceof EndPage && (page as EndPage).score === 55,'inherited score getter');
advance(300);
page = game.children[0] as Sprite;
check(page instanceof ScorePage,'automatic end → scores transition');
const table = page.children.find(c => c.children.some(x => x instanceof TextInput));
check(table !== undefined,'new high score must offer a name, including first place/empty table');
const input = table!.children.find(c => c instanceof TextInput) as TextInput;
input.text = 'Guillaume';
const submit = table!.children.find(c => c instanceof Button) as Button;
submit.dispatchEvent(new Event(Event.TRIGGERED)); advance(2);
check(getHighScores()[0].user_name === 'Guillaume' && getHighScores()[0].score === 55,'save from the original score screen');

saveScore('A',10); saveScore('B',100); saveScore('C',40); saveScore('D',20); saveScore('E',5);
check(getHighScores().map(s => s.score).join(',') === '100,55,40,20,10','persistent sorted Top 5');
let refused = false;
try { saveScore('bad',NaN); } catch { refused = true; }
check(refused,'non-finite score accepted');
set('fatty.top5','{"broken":true}');
refused = false;
try { saveScore('bad',200); } catch { refused = true; }
check(refused,'corrupt data silently overwritten');
set('fatty.top5','[{"user_name":"Guillaume","score":55}]');
console.log('fatty logic: targets, bubbling, lives, timers, pages and saved Top 5 ok');
