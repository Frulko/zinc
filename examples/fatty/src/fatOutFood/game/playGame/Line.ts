/**
 * User: guillaume
 * Date: 28/02/13
 * Time: 11:54
 */

import { ConstantsGame } from '../../constants/ConstantsGame';
import { GameEvent } from '../../events/GameEvent';
import { ATarget } from './target/ATarget';
import { Friend } from './target/Friend';
import { OneShot } from './target/OneShot';
import { ThreeShot } from './target/ThreeShot';
import { TwoShots } from './target/TwoShots';

import { Sprite, Tween, Starling, deg2rad } from '../../../compat/starling';

type TargetClass = new (id: number, distance: number, sens: number, angle: number, speed: number) => ATarget;

export class Line extends Sprite{

		private _target:ATarget[];
		private _vitesse:number = 0;
		private _sens:number = 0;
		private static vProportion:TargetClass[] = [TwoShots, TwoShots, TwoShots, TwoShots,TwoShots, OneShot, OneShot, OneShot, OneShot, OneShot, OneShot, OneShot,ThreeShot ,ThreeShot ,ThreeShot ,ThreeShot];



		public constructor(vitesse:number, sens:number) {
			super();

			this._onFirstStep = this._onFirstStep.bind(this);
			this._onDistanceMin = this._onDistanceMin.bind(this);

			this._vitesse = vitesse;
			this._sens = sens;
			this.alpha = 0;



			this._target = [] as ATarget[];
			if(Line.vProportion.length < 30){
				Line.vProportion.push(Friend,Friend);
			}


			this.addEventListener(GameEvent.ON_DISTANCE_MIN, this._onDistanceMin);
			this.addEventListener(GameEvent.ON_NEW_LINE, this._onFirstStep);
			this._vitesse = this._vitesse /10;
			let angleRad:number = 0;

			for(let i:number=0; i<ConstantsGame.NUMBER_OF_ENNEMIES; i++){

				let num:number = Math.floor(Math.random()*Line.vProportion.length);
				let C:TargetClass = Line.vProportion[num];

				this._target[i] = new C(i,ConstantsGame.ENNEMIES_DEFAULT_DISTANCE,this._sens,angleRad,this._vitesse);
				this.addChild(this._target[i]);
				angleRad += deg2rad(360/ConstantsGame.NUMBER_OF_ENNEMIES);
			}

		}

		public show() :void{
			let tw : Tween = new Tween(this,  3);
			tw.fadeTo(1);
			Starling.juggler.add(tw, this);
		}

		private _onFirstStep(event : GameEvent) : void {
			event.stopPropagation();
			this.removeEventListener(GameEvent.ON_NEW_LINE, this._onFirstStep);
			this.dispatchEvent(new GameEvent(GameEvent.ON_FIRST_STEP, true));
		}

		private _onDistanceMin(event : GameEvent) : void {
			event.stopPropagation();
			this.removeEventListener(GameEvent.ON_DISTANCE_MIN, this._onDistanceMin);
			while(this._target.length > 0){

				let t:ATarget = this._target.shift();
				this.removeChild(t);
			}
			this.dispatchEvent(new GameEvent(GameEvent.ON_LINE_DEAD, true));
		}

	}
