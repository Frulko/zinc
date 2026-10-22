/**
 * User: guillaume
 * Date: 26/02/13
 * Time: 20:10
 */

import { Assets } from './assets/Assets';

import { PageEvent } from './events/PageEvent';
import { PageManager } from './pageManager/PageManager';
import { Sprite } from '../compat/starling';

export class StartUp extends Sprite{
		private _manager:PageManager;


		public constructor() {
			super();

			//var background:Quad = new Quad(1024, 768, 0xf1bb4f);
			//addChild(background);


			Assets.loadFont();
			Assets.loadSprites();
			Assets.loadMusic();
			Assets.playMusic();
			this._manager = new PageManager();
			this.addChild(this._manager);
			//_manager.setPage(new PageEvent(PageEvent.CHANGE_SCREEN,ScreenConstants.HOME_SCREEN));
			//dispatchEvent(new PageEvent(PageEvent.CHANGE_SCREEN,ScreenConstants.HOME_SCREEN,true));
		}
	}
