/**
 * User: guillaume
 * Date: 26/02/13
 * Time: 16:30
 */

import { PageEvent } from '../events/PageEvent';
import { Sprite, Tween, Starling } from '../../compat/starling';

export class APage extends Sprite{

		private _score:number = 0;

		public constructor() {
			super();

			this._onPageShown = this._onPageShown.bind(this);

			this._onPageHidden = this._onPageHidden.bind(this);
			this.alpha = 0;
		}

		public show() :void{
			let tw : Tween = new Tween(this,  0.3);
			tw.onComplete = this._onPageShown;
			tw.fadeTo(1);

			Starling.juggler.add(tw, this);

		}

		private _onPageShown() : void {
			this.dispatchEvent(new PageEvent(PageEvent.SHOWN));
		}

		public hide() :void{

			let tw : Tween = new Tween(this,  0.3);
			tw.onComplete = this._onPageHidden;
			tw.fadeTo(0);

			Starling.juggler.add(tw, this);
		}

		protected _onPageHidden() : void {
			this.dispatchEvent(new PageEvent(PageEvent.HIDDEN));
		}

		public set score(val:number){
			this._score = val;
		}

		public get score():number{
			return this._score;
		}

	}
