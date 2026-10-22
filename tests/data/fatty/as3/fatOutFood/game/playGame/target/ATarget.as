/**
 * User: guillaume
 * Date: 26/02/13
 * Time: 15:45
 */
package fatOutFood.game.playGame.target {

	import fatOutFood.constants.ConstantsGame;
	import fatOutFood.events.GameEvent;

	import starling.animation.Tween;

	import starling.core.Starling;

	import starling.display.Sprite;
	import starling.events.EnterFrameEvent;
	import starling.events.Touch;
	import starling.events.TouchEvent;
	import starling.events.TouchPhase;
	import starling.utils.deg2rad;

	public class ATarget extends Sprite{

		protected var _distance:Number;
		protected var _id:int;
		protected var _sens:Number;
		protected var _enPause : Boolean;
		protected var _point : int;
		protected var _vitesse:Number;


		public function ATarget(id:int, distance:Number, sens:int, angleDepart:Number, vitesse:Number) {
			super();
			this._id = id;
			this._distance = distance;
			this._sens = sens;
			this._vitesse = vitesse;
			this.useHandCursor = true;
			this.addEventListener(TouchEvent.TOUCH, _onClick);
			this.addEventListener(GameEvent.ON_PAUSE, _onPause);
			this.addEventListener(EnterFrameEvent.ENTER_FRAME, _animation);
			updatePosition(this, angleDepart);
		}

		public function _onPause() : void {
			if(!_enPause){
				trace('Pause');

				_enPause = true;
			}else{
				trace('Play');

				_enPause = false;
			}
		}



		protected function _onClick(event : TouchEvent) : void {
			var touch:Touch = event.getTouch(this, TouchPhase.BEGAN);

			if(touch){

				actionTarget();

			}

		}

		protected function actionTarget() : void {

		}

		protected function kill() : void {
			alpha = 0;
			this.removeEventListener(TouchEvent.TOUCH, _onClick);
			this.removeEventListener(GameEvent.ON_PAUSE, _onPause);
			this.removeEventListener(EnterFrameEvent.ENTER_FRAME, _animation);
			dispatchEvent(new GameEvent(GameEvent.ON_DIE, true));
		}

		private function _checkDistance() : void {

			if(_distance < 230 ){
				//trace('OK')
				dispatchEvent(new GameEvent(GameEvent.ON_NEW_LINE, true));
			}

			if(_distance < ConstantsGame.MINIMUM_LINE_DISTANCE){
				dispatchEvent(new GameEvent(GameEvent.ON_DISTANCE_MIN, true));
			}
		}


		private function _animation(event: EnterFrameEvent) : void {
			updatePosition(this, this.rotation+deg2rad(ConstantsGame.VITESSE_ANGLE * _sens));

			this.distance -= _vitesse;
		}

		private function updatePosition(target:ATarget, angleRad:Number) :void{
			target.x = Math.cos(angleRad)* target.distance;
			target.y = Math.sin(angleRad) * target.distance;
			target.rotation = angleRad;
			_checkDistance();
		}


		public function get points():Number{
			return _point;
		}

		public function get distance():Number{
			return _distance;
		}

		public function set distance(value:Number):void{
			_distance = value;
		}
	}
}
