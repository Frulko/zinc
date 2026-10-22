import { getDefinitionByName, Class } from '../definitions';
/**
 * User: guillaume
 * Date: 26/02/13
 * Time: 16:30
 */

import { Assets } from '../assets/Assets';
import { ConstantsPage } from '../constants/ConstantsPage';
import { PageEvent } from '../events/PageEvent';
import { GameManager } from '../game/GameManager';
import { HomePage } from '../home/HomePage';
import { ScorePage } from '../score/ScorePage';
import { Sprite, Image } from '../../compat/starling';

import { APage } from './APage';

export class PageManager extends Sprite {

		private _currentPage:APage;
		private _nextPage:string = '';
		private _score:number = 0;


		public constructor() {
			super();

			this._onCurrentPageHidden = this._onCurrentPageHidden.bind(this);

			this._onNewPageAsked = this._onNewPageAsked.bind(this);

			HomePage;
			ScorePage;
			GameManager;
			//this.x = -6;
			//this.y = -6;
			let background:Image = new Image(Assets.getAtlas().getTexture("fond_vide"));
			this.addChild(background);
			this._updatePage(ConstantsPage.HOME_SCREEN);
		}

		private _updatePage(nextPage : string) :void{
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
			this._currentPage.score = this._score;
			this._currentPage.addEventListener(PageEvent.CHANGE_SCREEN, this._onNewPageAsked);
			this._currentPage.show();

		}

		private _onNewPageAsked(event : PageEvent) : void {
			this._score = event.score;
			this._updatePage(event.page);
		}







	}
