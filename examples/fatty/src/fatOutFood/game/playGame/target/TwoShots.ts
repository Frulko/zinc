/**
 * User: guillaume
 * Date: 28/02/13
 * Time: 10:34
 */

import { Assets } from '../../../assets/Assets';

import { Event, Image, MovieClip, Starling, deg2rad } from '../../../../compat/starling';

import { ATarget } from './ATarget';

export class TwoShots extends ATarget{

		private _nbShoot:number = 2;
		private _animBiere:MovieClip;
		private OneShotImage:Image;

		public constructor(id:number, distance:number, sens:number, angleDepart:number,vitesse:number) {
			super(id,distance,sens,angleDepart,vitesse);

			this._point = 20;
			this._vitesse = vitesse;

			this._animBiere = new MovieClip(Assets.getAtlasElement().getTextures("biere_anim"), 12);
			this._animBiere.loop = false;
			this._animBiere.rotation = deg2rad(90);
			this._animBiere.x = - 17;
			this._animBiere.y = - 43;
			Starling.juggler.add(this._animBiere, this);


			this.OneShotImage = new Image(Assets.getAtlas().getTexture("biere-3"));
			this.OneShotImage.rotation = deg2rad(90);
			this.OneShotImage.x = - 30;
			this.OneShotImage.y = - 30;

			this.addChild(this.OneShotImage);
		}

		protected override actionTarget () :void{
			this._nbShoot --;
			if(this._nbShoot < 2){
				this.removeChild(this.OneShotImage);
				this.addChild(this._animBiere);
				this._animBiere.stop();
			}

			if(this._nbShoot < 1){
				this._animBiere.play();
				this._animBiere.addEventListener(Event.COMPLETE, this.kill);
			}
		}

	}
