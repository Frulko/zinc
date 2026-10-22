/**
 * User: guillaume
 * Date: 26/02/13
 * Time: 15:45
 */
package fatOutFood.game.playGame {

	import fatOutFood.assets.Assets;
	import fatOutFood.constants.ConstantsGame;


	import starling.core.Starling;

	import starling.display.MovieClip;
	import starling.display.Sprite;
	import starling.events.EnterFrameEvent;
	import starling.events.Event;
	import starling.utils.deg2rad;

	public class Character extends Sprite{

		private var _gros:MovieClip;
		private var _grosbarbouile:MovieClip;
		private var _nbLife:int = ConstantsGame.LIFE;
		private var _angleGros:Number = 0;

		public function Character() {


			this.addEventListener(Event.ENTER_FRAME, _animationGros);
			// create movie clip
			_gros = new MovieClip(Assets.getAtlasGros().getTextures("anim_gros"), 24);

			_gros.pivotX = (_gros.width/2);
			_gros.pivotY = (_gros.height/2);
			addChild(_gros);
			Starling.juggler.add(_gros);


			_grosbarbouile = new MovieClip(Assets.getAtlasGrosBarbouille().getTextures("anim_gros_barbouillé"), 40);

			_grosbarbouile.pivotX = (_grosbarbouile.width/2);
			_grosbarbouile.pivotY = (_grosbarbouile.height/2);

			Starling.juggler.add(_grosbarbouile);


		}


		private function _animationGros(event : EnterFrameEvent) : void {
			_gros.rotation = deg2rad(_angleGros);
			_grosbarbouile.rotation = deg2rad(_angleGros + 3);
			_angleGros -= ConstantsGame.VITESSE_ROTATION_GROS;


		}


		public function get life():int{
			return _nbLife;
		}

		public function set life(newLife:int){
			removeChild(_gros);
			addChild(_grosbarbouile);

			_grosbarbouile.play();
			_nbLife += newLife;
		}
	}
}
