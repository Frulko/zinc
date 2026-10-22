/**
 * User: guillaume
 * Date: 27/02/13
 * Time: 13:45
 */
package fatOutFood.game.playGame.target {

	import fatOutFood.assets.Assets;
	import fatOutFood.events.GameEvent;

	import starling.core.Starling;

	import starling.display.Image;
	import starling.display.MovieClip;
	import starling.events.Event;
	import starling.utils.deg2rad;



	public class OneShot extends ATarget {

		private var _nbShoot:int = 1;
		private var _animHotdog:MovieClip;
		private var OneShotImage:Image

		public function OneShot(id:int, distance:Number, sens:int, angleDepart:Number,vitesse:Number) {
			super(id,distance,sens,angleDepart,vitesse);

			_point = 10;
			_vitesse = vitesse;

			_animHotdog = new MovieClip(Assets.getAtlasElement().getTextures("hotdog_anim"), 12);
			_animHotdog.loop = false;
			_animHotdog.rotation = deg2rad(90);
			_animHotdog.x = - 17;
			_animHotdog.y = - 43;
			Starling.juggler.add(_animHotdog);
			addChild(_animHotdog);
			_animHotdog.stop();
		}

		override protected function actionTarget () :void{

			_nbShoot --;
			if(_nbShoot < 1){
				_animHotdog.play();
				_animHotdog.addEventListener(Event.COMPLETE, kill);
			}
		}
	}
}
