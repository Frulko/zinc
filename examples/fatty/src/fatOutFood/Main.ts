import { buttonEventCount, buttonEventButton, buttonEventDown, buttonEventX, buttonEventY } from 'zinc:gfx';
import { popup, item } from 'zinc:system/menu';
import { openUrl } from 'zinc:system/opener';

import { StartUp } from './StartUp';
import { Sprite, Event, Starling } from '../compat/starling';

export class Main extends Sprite{

		private _myStarling:Starling;

		public constructor() {
			super();
			this._toWebsite = this._toWebsite.bind(this);
			this._onStage = this._onStage.bind(this);

			this.addEventListener(Event.ADDED_TO_STAGE, this._onStage);

			/* RIGHT CLICK CONFIG */
			// The school link lives in Zinc's native context menu.




		}

		public frame(dt:number):void {
			for (let i = 0; i < buttonEventCount(); i++) {
				if (buttonEventButton(i) === 2 && buttonEventDown(i)) {
					void popup([item('gobelins', 'Ecole des Gobelins - Annecy')], buttonEventX(i), buttonEventY(i))
						.then(id => { if (id === 'gobelins') this._toWebsite(new Event('menu')); });
				}
			}
			this._myStarling.frame(dt);
		}

		private _toWebsite(event : Event) : void {
			let url : string = "http://www.haute-savoie.cci.fr/se-former/nos-formations/formation-multimedia/crm.html";
			void openUrl(url);
		}

		private _onStage(event : Event) : void {
			this._myStarling = new Starling(StartUp, this.stage!);
			this._myStarling.antiAliasing = 1;
			this._myStarling.start();
			this._myStarling.showStats = false;

			this.x = -1;
			this.y = -1;

		}
	}
