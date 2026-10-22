/**
 * User: guillaume
 * Date: 26/02/13
 * Time: 15:45
 */

import { ConstantsGame } from '../../../constants/ConstantsGame';
import { GameEvent } from '../../../events/GameEvent';
import { Sprite, EnterFrameEvent, Touch, TouchEvent, TouchPhase, deg2rad } from '../../../../compat/starling';

export class ATarget extends Sprite{

		protected _distance:number = 0;
		protected _id:number = 0;
		protected _sens:number = 0;
		protected _enPause : boolean = false;
		protected _point : number = 0;
		protected _vitesse:number = 0;


		public constructor(id:number, distance:number, sens:number, angleDepart:number, vitesse:number) {
			super();
			this._onPause = this._onPause.bind(this);
			this._onClick = this._onClick.bind(this);

			this.kill = this.kill.bind(this);

			this._animation = this._animation.bind(this);

			this._id = id;
			this._distance = distance;
			this._sens = sens;
			this._vitesse = vitesse;
			this.useHandCursor = true;
			this.addEventListener(TouchEvent.TOUCH, this._onClick);
			this.addEventListener(GameEvent.ON_PAUSE, this._onPause);
			this.addEventListener(EnterFrameEvent.ENTER_FRAME, this._animation);
			this.updatePosition(this, angleDepart);
		}

		public _onPause() : void {
			if(!this._enPause){
				console.log('Pause');

				this._enPause = true;
			}else{
				console.log('Play');

				this._enPause = false;
			}
		}



		protected _onClick(event : TouchEvent) : void {
			let touch:Touch = event.getTouch(this, TouchPhase.BEGAN);

			if(touch){

				this.actionTarget();

			}

		}

		protected actionTarget() : void {

		}

		protected kill() : void {
			this.alpha = 0;
			this.removeEventListener(TouchEvent.TOUCH, this._onClick);
			this.removeEventListener(GameEvent.ON_PAUSE, this._onPause);
			this.removeEventListener(EnterFrameEvent.ENTER_FRAME, this._animation);
			this.dispatchEvent(new GameEvent(GameEvent.ON_DIE, true));
		}

		private _checkDistance() : void {

			if(this._distance < 230 ){
				//trace('OK')
				this.dispatchEvent(new GameEvent(GameEvent.ON_NEW_LINE, true));
			}

			if(this._distance < ConstantsGame.MINIMUM_LINE_DISTANCE){
				this.dispatchEvent(new GameEvent(GameEvent.ON_DISTANCE_MIN, true));
			}
		}


		private _animation(event: EnterFrameEvent) : void {
			this.updatePosition(this, this.rotation+deg2rad(ConstantsGame.VITESSE_ANGLE * this._sens));

			this.distance -= this._vitesse;
		}

		private updatePosition(target:ATarget, angleRad:number) :void{
			target.x = Math.cos(angleRad)* target.distance;
			target.y = Math.sin(angleRad) * target.distance;
			target.rotation = angleRad;
			this._checkDistance();
		}


		public get points():number{
			return this._point;
		}

		public get distance():number{
			return this._distance;
		}

		public set distance(value:number){
			this._distance = value;
		}
	}
