// Flash reflection knew every page class, even when another manager requested it.
import { APage } from './pageManager/APage';
import { HomePage } from './home/HomePage';
import { ScorePage } from './score/ScorePage';
import { GameManager } from './game/GameManager';
import { TutorialPage } from './game/tutorialGame/TutorialPage';
import { PlayPage } from './game/playGame/PlayPage';
import { EndPage } from './game/endGame/EndPage';
import { ConstantsPage } from './constants/ConstantsPage';
import { ConstantsGame } from './constants/ConstantsGame';
export type Class = new () => APage;
export function getDefinitionByName(name: string): Class {
  switch (name) {
    case ConstantsPage.HOME_SCREEN: return HomePage;
    case ConstantsPage.SCORE_SCREEN: return ScorePage;
    case ConstantsPage.GAME_SCREEN: return GameManager;
    case ConstantsGame.TUTORIAL_PAGE: return TutorialPage;
    case ConstantsGame.START_PAGE: return PlayPage;
    case ConstantsGame.END_PAGE: return EndPage;
    default: throw new Error('Unknown page: '+name);
  }
}
