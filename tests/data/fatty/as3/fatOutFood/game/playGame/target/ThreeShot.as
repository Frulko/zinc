/**
 * User: guillaume
 * Date: 28/02/13
 * Time: 08:48
 */
package fatOutFood.game.playGame.target {
	import fatOutFood.assets.Assets;
	import fatOutFood.events.GameEvent;

	import starling.core.Starling;

	import starling.display.Image;
	import starling.display.MovieClip;
	import starling.events.Event;
	import starling.utils.deg2rad;

	public class ThreeShot extends ATarget {

		private var _nbShoot:int = 3;
		private var _boulon3:Image;
		private var _boulon2:Image;
		private var _boulon1:MovieClip;

		public function ThreeShot(id : int, distance : Number, sens : int, angleDepart : Number, vitesse:Number) {
			super(id,distance,sens,angleDepart,vitesse);
			_point = 30;
			_vitesse = vitesse;

			_boulon3 =new Image(Assets.getAtlas().getTexture("boulon-3"));
			_boulon3.rotation = deg2rad(90);
			_boulon3.x = - 30;
			_boulon3.y = - 30;
			addChild(_boulon3);

			_boulon2 =new Image(Assets.getAtlas().getTexture("boulon_2"));
			_boulon2.rotation = deg2rad(90);
			_boulon2.x = - 30;
			_boulon2.y = - 30;


			_boulon1 = new MovieClip(Assets.getAtlasElement().getTextures("boulon_anim"), 12);
			_boulon1.loop = false;
			_boulon1.rotation = deg2rad(90);
			_boulon1.x = - 17;
			_boulon1.y = - 43;
			Starling.juggler.add(_boulon1);
			_boulon1.stop();

		}

		override protected function actionTarget () :void{
			_nbShoot --;
			if(_nbShoot < 3){
				removeChild(_boulon3)
				addChild(_boulon2);
			}
			if(_nbShoot < 2){
				removeChild(_boulon2)
				addChild(_boulon1);
			}
			if(_nbShoot < 1){
				_boulon1.play();
				_boulon1.addEventListener(Event.COMPLETE, kill);
			}
		}
	}
}
