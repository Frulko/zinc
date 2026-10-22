/**
 * User: guillaume
 * Date: 26/02/13
 * Time: 20:10
 */
package fatOutFood {

	import fatOutFood.assets.Assets;
	import fatOutFood.constants.ConstantsPage;
	import fatOutFood.events.PageEvent;
	import fatOutFood.pageManager.PageManager;

	import flash.media.Sound;
	import flash.net.URLRequest;


	import starling.display.Quad;

	import starling.display.Sprite;
	import starling.utils.AssetManager;

	public class StartUp extends Sprite{
		private var _manager:PageManager;


		public function StartUp() {

			//var background:Quad = new Quad(1024, 768, 0xf1bb4f);
			//addChild(background);


			Assets.loadFont();
			Assets.loadSprites();
			Assets.loadMusic();
			Assets.playMusic();
			_manager = new PageManager();
			addChild(_manager);
			//_manager.setPage(new PageEvent(PageEvent.CHANGE_SCREEN,ScreenConstants.HOME_SCREEN));
			//dispatchEvent(new PageEvent(PageEvent.CHANGE_SCREEN,ScreenConstants.HOME_SCREEN,true));
		}
	}
}
