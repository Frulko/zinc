import { getDefinitionByName, Class } from '../definitions';
/**
 * User: guillaume
 * Date: 27/02/13
 * Time: 09:33
 */

import { ConstantsGame } from '../constants/ConstantsGame';

import { PageEvent } from '../events/PageEvent';
import { EndPage } from './endGame/EndPage';
import { PlayPage } from './playGame/PlayPage';
import { TutorialPage } from './tutorialGame/TutorialPage';
import { APage } from '../pageManager/APage';

export class GameManager extends APage{

		private _currentPage:APage;
		private _nextPage:string = '';
		private _gameScore:number = 0;

		public constructor() {
			super();

			this._onCurrentPageHidden = this._onCurrentPageHidden.bind(this);

			this._onNewPageAsked = this._onNewPageAsked.bind(this);

			TutorialPage;
			PlayPage;
			EndPage;

			this._updatePage(ConstantsGame.TUTORIAL_PAGE);
		}

		private _updatePage(nextPage : string) :void {
			this._nextPage = nextPage;
			if (this._currentPage){
				this._currentPage.addEventListener(PageEvent.HIDDEN, this._onCurrentPageHidden);
				this._currentPage.hide();
			}
			else {
				this._addNewPage();

			}

		}

		private _onCurrentPageHidden(e : PageEvent) : void {

			this.removeChild(this._currentPage);
			this._currentPage.removeEventListener(PageEvent.HIDDEN, this._onCurrentPageHidden);
			this._currentPage.removeEventListener(PageEvent.CHANGE_SCREEN, this._onNewPageAsked);
			this._currentPage = null;
			this._addNewPage();


		}

		private _addNewPage() : void {

			let screen:Class = getDefinitionByName(this._nextPage) as Class;
			this._currentPage = new screen() as APage;
			this.addChild(this._currentPage);

			this._currentPage.score = this._gameScore;
			this._currentPage.addEventListener(PageEvent.CHANGE_SCREEN, this._onNewPageAsked);
			this._currentPage.show();

		}

		private _onNewPageAsked(event : PageEvent) : void {
				this._gameScore = event.score;
				this._updatePage(event.page);
		}

	}
