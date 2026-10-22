/**
 * User: guillaume
 * Date: 26/02/13
 * Time: 16:30
 */
package fatOutFood.pageManager {

	import fatOutFood.events.PageEvent;

	import starling.animation.Tween;
	import starling.core.Starling;
	import starling.display.Sprite;

	public class APage extends Sprite{

		private var _score:int;

		public function APage() {
			alpha = 0;
		}

		public function show() :void{
			var tw : Tween = new Tween(this,  0.3);
			tw.onComplete = _onPageShown;
			tw.fadeTo(1);

			Starling.juggler.add(tw);

		}

		private function _onPageShown() : void {
			dispatchEvent(new PageEvent(PageEvent.SHOWN));
		}

		public function hide() :void{

			var tw : Tween = new Tween(this,  0.3);
			tw.onComplete = _onPageHidden;
			tw.fadeTo(0);

			Starling.juggler.add(tw);
		}

		protected function _onPageHidden() : void {
			dispatchEvent(new PageEvent(PageEvent.HIDDEN));
		}

		public function set score(val:int) :void{
			_score = val;
		}

		public function get score():int{
			return _score;
		}

	}
}
