/**
 * User: guillaume
 * Date: 27/02/13
 * Time: 13:44
 */

import { Assets } from '../../../assets/Assets';
import { GameEvent } from '../../../events/GameEvent';
import { Event, MovieClip, Starling, deg2rad } from '../../../../compat/starling';

import { ATarget } from './ATarget';

export class Friend extends ATarget {

		private _nbShoot:number = 1;
		private _friend:MovieClip;

		public constructor(id:number, distance:number, sens:number,angleDepart:number, vitesse:number) {
			super(id,distance,sens,angleDepart,vitesse);

			this.kill = this.kill.bind(this);

			this._point = -5;
			this._vitesse = vitesse;

			let ramdom:number = Math.floor(Math.random() * (2 - 1 + 1)) + 1;
			if(ramdom == 1) this._friend = new MovieClip(Assets.getAtlasElement().getTextures("maki_anim"), 20);
			else this._friend = new MovieClip(Assets.getAtlasElement().getTextures("pomme_anim"), 20);

			this._friend.loop = false;
			this._friend.rotation = deg2rad(90);
			this._friend.x = - 17;
			this._friend.y = - 43;
			Starling.juggler.add(this._friend, this);
			this.addChild(this._friend);
			this._friend.stop();


		}

		protected override actionTarget () :void{
			this._nbShoot --;
			if(this._nbShoot < 1){
				this._friend.play();
				this._friend.addEventListener(Event.COMPLETE, this.kill);
			}
		}

		protected override kill():void{
			this.dispatchEvent(new GameEvent(GameEvent.NO_SHOT, true));
			super.kill();

		}

	}
