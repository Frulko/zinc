/**
 * User: guillaume
 * Date: 27/02/13
 * Time: 09:33
 */
package fatOutFood.game {

	import fatOutFood.constants.ConstantsGame;
	import fatOutFood.constants.ConstantsPage;
	import fatOutFood.events.PageEvent;
	import fatOutFood.game.endGame.EndPage;
	import fatOutFood.game.playGame.PlayPage;
	import fatOutFood.game.tutorialGame.TutorialPage;
	import fatOutFood.pageManager.APage;

	import flash.utils.getDefinitionByName;

	public class GameManager extends APage{

		private var _currentPage:APage;
		private var _nextPage:String;
		private var _score:int;

		public function GameManager() {
			super();

			TutorialPage;
			PlayPage;
			EndPage;

			_updatePage(ConstantsGame.TUTORIAL_PAGE);
		}

		private function _updatePage(nextPage : String) :void {
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
