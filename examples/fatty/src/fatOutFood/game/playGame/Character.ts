/**
 * User: guillaume
 * Date: 26/02/13
 * Time: 15:45
 */

import { Assets } from '../../assets/Assets';
import { ConstantsGame } from '../../constants/ConstantsGame';
import { Sprite, Event, EnterFrameEvent, MovieClip, Starling, deg2rad } from '../../../compat/starling';

export class Character extends Sprite{

		private _gros:MovieClip;
		private _grosbarbouile:MovieClip;
		private _nbLife:number = ConstantsGame.LIFE;
		private _angleGros:number = 0;

		public constructor() {
			super();
			this._animationGros = this._animationGros.bind(this);


			this.addEventListener(Event.ENTER_FRAME, this._animationGros);
			// create movie clip
			this._gros = new MovieClip(Assets.getAtlasGros().getTextures("anim_gros"), 24);

			this._gros.pivotX = (this._gros.width/2);
			this._gros.pivotY = (this._gros.height/2);
			this.addChild(this._gros);
			Starling.juggler.add(this._gros, this);


			this._grosbarbouile = new MovieClip(Assets.getAtlasGrosBarbouille().getTextures("anim_gros_barbouillé"), 40);

			this._grosbarbouile.pivotX = (this._grosbarbouile.width/2);
			this._grosbarbouile.pivotY = (this._grosbarbouile.height/2);

			Starling.juggler.add(this._grosbarbouile, this);


		}


		private _animationGros(event : EnterFrameEvent) : void {
			this._gros.rotation = deg2rad(this._angleGros);
			this._grosbarbouile.rotation = deg2rad(this._angleGros + 3);
			this._angleGros -= ConstantsGame.VITESSE_ROTATION_GROS;


		}


		public get life():number{
			return this._nbLife;
		}

		public set life(newLife:number){
			this.removeChild(this._gros);
			this.addChild(this._grosbarbouile);

			this._grosbarbouile.play();
			this._nbLife += newLife;
		}
	}
