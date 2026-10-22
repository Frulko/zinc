/**
 * User: guillaume
 * Date: 28/02/13
 * Time: 11:54
 */
package fatOutFood.game.playGame {

	import fatOutFood.constants.ConstantsGame;
	import fatOutFood.events.GameEvent;
	import fatOutFood.game.playGame.target.ATarget;
	import fatOutFood.game.playGame.target.Friend;
	import fatOutFood.game.playGame.target.OneShot;
	import fatOutFood.game.playGame.target.ThreeShot;
	import fatOutFood.game.playGame.target.TwoShots;
	import fatOutFood.pageManager.APage;

	import starling.animation.Tween;

	import starling.core.Starling;

	import starling.display.Sprite;

	import starling.utils.deg2rad;

	public class Line extends Sprite{

		private var _target:Vector.<ATarget>;
		private var _vitesse:Number;
		private var _sens:int;
		private static var vProportion:Vector.<Class> = new Vector.<Class>;
		vProportion.push(TwoShots, TwoShots, TwoShots, TwoShots,TwoShots, OneShot, OneShot, OneShot, OneShot, OneShot, OneShot, OneShot,ThreeShot ,ThreeShot ,ThreeShot ,ThreeShot);



		public function Line(vitesse:Number, sens:int) {

			this._vitesse = vitesse;
			this._sens = sens;
			alpha = 0;



			_target = new Vector.<ATarget>();
			if(vProportion.length < 30){
				vProportion.push(Friend,Friend);
			}


			this.addEventListener(GameEvent.ON_DISTANCE_MIN, _onDistanceMin);
			this.addEventListener(GameEvent.ON_NEW_LINE, _onFirstStep);
			_vitesse = _vitesse /10;
			var angleRad:Number = 0;

			for(var i:uint=0; i<ConstantsGame.NUMBER_OF_ENNEMIES; i++){

				var num:int = Math.floor(Math.random()*vProportion.length);
				var C:Class = vProportion[num];

				_target[i] = new C(i,ConstantsGame.ENNEMIES_DEFAULT_DISTANCE,_sens,angleRad,_vitesse);
				addChild(_target[i]);
				angleRad += deg2rad(360/ConstantsGame.NUMBER_OF_ENNEMIES);
			}

		}

		public function show() :void{
			var tw : Tween = new Tween(this,  3);
			tw.fadeTo(1);
			Starling.juggler.add(tw);
		}

		private function _onFirstStep(event : GameEvent) : void {
			event.stopPropagation();
			removeEventListener(GameEvent.ON_NEW_LINE, _onFirstStep);
			dispatchEvent(new GameEvent(GameEvent.ON_FIRST_STEP, true));
		}

		private function _onDistanceMin(event : GameEvent) : void {
			event.stopPropagation();
			removeEventListener(GameEvent.ON_DISTANCE_MIN, _onDistanceMin);
			while(_target.length > 0){

				var t:ATarget = _target.shift();
				removeChild(t);
			}
			dispatchEvent(new GameEvent(GameEvent.ON_LINE_DEAD, true));
		}

	}
}
