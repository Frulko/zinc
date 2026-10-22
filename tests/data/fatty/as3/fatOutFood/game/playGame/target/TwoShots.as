/**
 * User: guillaume
 * Date: 28/02/13
 * Time: 10:34
 */
package fatOutFood.game.playGame.target {

	import fatOutFood.assets.Assets;
	import fatOutFood.events.GameEvent;

	import starling.core.Starling;

	import starling.display.Image;
	import starling.display.MovieClip;
	import starling.events.Event;
	import starling.utils.deg2rad;

	public class TwoShots extends ATarget{

		private var _nbShoot:int = 2;
		private var _animBiere:MovieClip;
		private var OneShotImage:Image;

		public function TwoShots(id:int, distance:Number, sens:int, angleDepart:Number,vitesse:Number) {
			super(id,distance,sens,angleDepart,vitesse);
			_point = 20;
			_vitesse = vitesse;

			_animBiere = new MovieClip(Assets.getAtlasElement().getTextures("biere_anim"), 12);
			_animBiere.loop = false;
			_animBiere.rotation = deg2rad(90);
			_animBiere.x = - 17;
			_animBiere.y = - 43;
			Starling.juggler.add(_animBiere);


			OneShotImage = new Image(Assets.getAtlas().getTexture("biere-3"));
			OneShotImage.rotation = deg2rad(90);
			OneShotImage.x = - 30;
			OneShotImage.y = - 30;

			addChild(OneShotImage);
		}

		override protected function actionTarget () :void{
			_nbShoot --;
			if(_nbShoot < 2){
				removeChild(OneShotImage);
				addChild(_animBiere);
				_animBiere.stop();
			}

			if(_nbShoot < 1){
				_animBiere.play();
				_animBiere.addEventListener(Event.COMPLETE, kill);
			}
		}

	}
}
