/**
 * User: guillaume
 * Date: 27/02/13
 * Time: 13:45
 */

import { Assets } from '../../../assets/Assets';

import { Event, Image, MovieClip, Starling, deg2rad } from '../../../../compat/starling';

import { ATarget } from './ATarget';

export class OneShot extends ATarget {

		private _nbShoot:number = 1;
		private _animHotdog:MovieClip;
		private OneShotImage:Image

		public constructor(id:number, distance:number, sens:number, angleDepart:number,vitesse:number) {
			super(id,distance,sens,angleDepart,vitesse);


			this._point = 10;
			this._vitesse = vitesse;

			this._animHotdog = new MovieClip(Assets.getAtlasElement().getTextures("hotdog_anim"), 12);
			this._animHotdog.loop = false;
			this._animHotdog.rotation = deg2rad(90);
			this._animHotdog.x = - 17;
			this._animHotdog.y = - 43;
			Starling.juggler.add(this._animHotdog, this);
			this.addChild(this._animHotdog);
			this._animHotdog.stop();
		}

		protected override actionTarget () :void{

			this._nbShoot --;
			if(this._nbShoot < 1){
				this._animHotdog.play();
				this._animHotdog.addEventListener(Event.COMPLETE, this.kill);
			}
		}
	}
