/**
 * User: guillaume
 * Date: 26/02/13
 * Time: 16:30
 */
package fatOutFood.pageManager {

	import fatOutFood.assets.Assets;
	import fatOutFood.constants.ConstantsPage;
	import fatOutFood.events.PageEvent;
	import fatOutFood.game.GameManager;
	import fatOutFood.home.HomePage;
	import fatOutFood.score.ScorePage;

	import flash.utils.getDefinitionByName;

	import starling.display.Image;

	import starling.display.Sprite;

	public class PageManager extends Sprite {

		private var _currentPage:APage;
		private var _nextPage:String;
		private var _score:int;


		public function PageManager() {
			super();

			HomePage;
			ScorePage;
			GameManager;
			//this.x = -6;
			//this.y = -6;
			var background:Image = new Image(Assets.getAtlas().getTexture("fond_vide"));
			addChild(background);
			_updatePage(ConstantsPage.HOME_SCREEN);
		}

		private function _updatePage(nextPage : String) :void{
			_nextPage = nextPage;

			if (_currentPage){
				_currentPage.addEventListener(PageEvent.HIDDEN, _onCurrentPageHidden);
				_currentPage.hide();
			}
			else {
				_addNewPage();
			}

		}


		private function _onCurrentPageHidden(e : PageEvent) : void {

			removeChild(_currentPage);
			_currentPage.removeEventListener(PageEvent.HIDDEN, _onCurrentPageHidden);
			_currentPage.removeEventListener(PageEvent.CHANGE_SCREEN, _onNewPageAsked);
			_currentPage = null;

			_addNewPage();


		}

		private function _addNewPage() : void {

			var screen:Class = getDefinitionByName(_nextPage) as Class;
			_currentPage = new screen() as APage;
			addChild(_currentPage);
			_currentPage.score = _score;
			_currentPage.addEventListener(PageEvent.CHANGE_SCREEN, _onNewPageAsked);
			_currentPage.show();

		}

		private function _onNewPageAsked(event : PageEvent) : void {
			_score = event.score;
			_updatePage(event.page);
		}







	}
}
