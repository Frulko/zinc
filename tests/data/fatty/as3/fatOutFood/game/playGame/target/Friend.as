/**
 * User: guillaume
 * Date: 27/02/13
 * Time: 13:44
 */
package fatOutFood.game.playGame.target {

	import fatOutFood.assets.Assets;
	import fatOutFood.events.GameEvent;

	import starling.core.Starling;

	import starling.display.MovieClip;
	import starling.events.Event;


	import starling.utils.deg2rad;

	public class Friend extends ATarget {

		private var _nbShoot:int = 1;
		private var _friend:MovieClip;

		public function Friend(id:int, distance:Number, sens:int,angleDepart:Number, vitesse:Number) {
			super(id,distance,sens,angleDepart,vitesse);

			_point = -5;
			_vitesse = vitesse;

			var ramdom:Number = Math.floor(Math.random() * (2 - 1 + 1)) + 1;
			if(ramdom == 1) _friend = new MovieClip(Assets.getAtlasElement().getTextures("maki_anim"), 20);
			else _friend = new MovieClip(Assets.getAtlasElement().getTextures("pomme_anim"), 20);

			_friend.loop = false;
			_friend.rotation = deg2rad(90);
			_friend.x = - 17;
			_friend.y = - 43;
			Starling.juggler.add(_friend);
			addChild(_friend);
			_friend.stop();


		}

		override protected function actionTarget () :void{
			_nbShoot --;
			if(_nbShoot < 1){
				_friend.play();
				_friend.addEventListener(Event.COMPLETE, kill);
			}
		}

		override protected function kill():void{
			dispatchEvent(new GameEvent(GameEvent.NO_SHOT, true));
			super.kill();

		}

	}
}
