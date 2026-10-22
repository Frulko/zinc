import { HomePage } from '../../../examples/fatty/src/fatOutFood/home/HomePage';
import { TutorialPage } from '../../../examples/fatty/src/fatOutFood/game/tutorialGame/TutorialPage';
import { EndPage } from '../../../examples/fatty/src/fatOutFood/game/endGame/EndPage';
// Only the T1 test imports this: no test hooks or instrumentation in the shipped game.
import { DisplayObject } from 'zinc:stage';
import { Sprite } from '../../../examples/fatty/src/compat/display';
import { TextInput } from '../../../examples/fatty/src/compat/text';
import { PlayPage } from '../../../examples/fatty/src/fatOutFood/game/playGame/PlayPage';
import { ScorePage } from '../../../examples/fatty/src/fatOutFood/score/ScorePage';
import { GameEvent } from '../../../examples/fatty/src/fatOutFood/events/GameEvent';
import { ATarget } from '../../../examples/fatty/src/fatOutFood/game/playGame/target/ATarget';
const watched = new Set<DisplayObject>();
export function probe(node: DisplayObject): void {
  if ((node instanceof HomePage || node instanceof TutorialPage || node instanceof EndPage || node instanceof ScorePage) && !watched.has(node)) {
    watched.add(node);
    console.log('fatty page '+(node instanceof HomePage ? 'home' : node instanceof TutorialPage ? 'tutorial' : node instanceof EndPage ? 'end' : 'scores'));
  }
  if (node instanceof PlayPage && !watched.has(node)) {
    watched.add(node);
    (node as Sprite).addEventListener(GameEvent.ON_DIE, (event: GameEvent) => console.log('fatty hit '+(event.target as ATarget).points));
  }
  if (node instanceof TextInput && !watched.has(node)) {
    watched.add(node);
    console.log('fatty name entry');
  }
  for (const child of node.children) probe(child);
}
