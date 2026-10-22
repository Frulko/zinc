/**
 * User: guillaume
 * Date: 28/02/13
 * Time: 08:48
 */

import { Assets } from '../../../assets/Assets';

import { Event, Image, MovieClip, Starling, deg2rad } from '../../../../compat/starling';

import { ATarget } from './ATarget';

export class ThreeShot extends ATarget {

		private _nbShoot:number = 3;
		private _boulon3:Image;
		private _boulon2:Image;
		private _boulon1:MovieClip;

		public constructor(id : number, distance : number, sens : number, angleDepart : number, vitesse:number) {
			super(id,distance,sens,angleDepart,vitesse);

			this._point = 30;
			this._vitesse = vitesse;

			this._boulon3 =new Image(Assets.getAtlas().getTexture("boulon-3"));
			this._boulon3.rotation = deg2rad(90);
			this._boulon3.x = - 30;
			this._boulon3.y = - 30;
			this.addChild(this._boulon3);

			this._boulon2 =new Image(Assets.getAtlas().getTexture("boulon_2"));
			this._boulon2.rotation = deg2rad(90);
			this._boulon2.x = - 30;
			this._boulon2.y = - 30;


			this._boulon1 = new MovieClip(Assets.getAtlasElement().getTextures("boulon_anim"), 12);
			this._boulon1.loop = false;
			this._boulon1.rotation = deg2rad(90);
			this._boulon1.x = - 17;
			this._boulon1.y = - 43;
			Starling.juggler.add(this._boulon1, this);
			this._boulon1.stop();

		}

		protected override actionTarget () :void{
			this._nbShoot --;
			if(this._nbShoot < 3){
				this.removeChild(this._boulon3)
				this.addChild(this._boulon2);
			}
			if(this._nbShoot < 2){
				this.removeChild(this._boulon2)
				this.addChild(this._boulon1);
			}
			if(this._nbShoot < 1){
				this._boulon1.play();
				this._boulon1.addEventListener(Event.COMPLETE, this.kill);
			}
		}
	}
