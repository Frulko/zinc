package fatOutFood {


	import fatOutFood.StartUp;

	import flash.display.Stage;
	import flash.events.ContextMenuEvent;
	import flash.events.Event;
	import flash.media.Sound;
	import flash.net.URLRequest;
	import flash.net.navigateToURL;
	import flash.ui.ContextMenu;
	import flash.ui.ContextMenuItem;

	import starling.core.Starling;


	[SWF(frameRate="60", width="1024", height="768")]
	public class Main extends flash.display.Sprite{

		private var _myStarling:Starling;

		public function Main() {

			this.addEventListener(Event.ADDED_TO_STAGE, _onStage);

			/* RIGHT CLICK CONFIG */
			var myMenu:ContextMenu = new ContextMenu();
			myMenu.hideBuiltInItems();
			var menuItem1:ContextMenuItem = new ContextMenuItem("Ecole des Gobelins - Annecy");
			menuItem1.addEventListener(ContextMenuEvent.MENU_ITEM_SELECT, _toWebsite);
			myMenu.customItems.push(menuItem1);
			this.contextMenu = myMenu;




		}

		private function _toWebsite(event : ContextMenuEvent) : void {
			var url : String = "http://www.haute-savoie.cci.fr/se-former/nos-formations/formation-multimedia/crm.html";
			var request : URLRequest = new URLRequest(url);
			navigateToURL(request,'_blank');
		}

		private function _onStage(event : Event) : void {
			_myStarling = new Starling(StartUp, stage);
			_myStarling.antiAliasing = 1;
			_myStarling.start();
			_myStarling.showStats = false;

			this.x = -1;
			this.y = -1;

		}
	}
}
