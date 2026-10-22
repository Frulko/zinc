/**
 * User: guillaume
 * Date: 28/02/13
 * Time: 16:52
 */
package fatOutFood {

	import fatOutFood.assets.Assets;

	import starling.display.Sprite;
	import starling.text.TextField;

	public class Test extends Sprite{

		public function Test() {
			trace('OK');

			trace(Assets.getFont().name);

			Assets.loadFont();
			var _scoreDisplay:TextField = new TextField(200, 150, "HELLO", "Cubano", 64);
			_scoreDisplay.x = 100;
			_scoreDisplay.y = 0;

			addChild(_scoreDisplay);
		}
	}
}
