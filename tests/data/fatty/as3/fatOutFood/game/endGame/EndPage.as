/**
 * User: guillaume
 * Date: 27/02/13
 * Time: 12:38
 */
package fatOutFood.game.endGame {

	import fatOutFood.assets.Assets;
	import fatOutFood.constants.ConstantsGame;
	import fatOutFood.constants.ConstantsPage;
	import fatOutFood.events.PageEvent;
	import fatOutFood.pageManager.APage;

	import starling.core.Starling;
	import starling.display.Button;
	import starling.display.Image;
	import starling.events.EnterFrameEvent;
	import starling.events.Event;

	import starling.text.TextField;

	public class EndPage extends APage{

		private var _timeleft:int = 5;
		private var _timerDisplay:TextField;
		private var playMusicBtn:Button;
		private var stopMusicBtn:Button;
		public function EndPage() {

			var title:Image =new Image(Assets.getAtlas().getTexture("titre"));
			title.x = 394;
			title.y = 102;
			addChild(title);

			var authors:Image =new Image(Assets.getAtlas().getTexture("auteurs"));
			authors.x = 338;
			authors.y = 726;
			addChild(authors);


			var game_over:Image =new Image(Assets.getAtlas().getTexture("game-over"));
			game_over.x = 172;
			game_over.y = 247;
			addChild(game_over);


			var biere:Image =new Image(Assets.getAtlas().getTexture("big-biere"));
			biere.x = 649;
			biere.y = 295;
			addChild(biere);

			_timerDisplay = new TextField(200, 150, "", "Cubano", 64);
			_timerDisplay.x = 433;
			_timerDisplay.y = 615;
			_timerDisplay.color = 0xfd5d00;

			addChild(_timerDisplay);

			updateTime();
			this.addEventListener(EnterFrameEvent.ENTER_FRAME, _refresh);

			playMusicBtn = new Button(Assets.getAtlas().getTexture("btn_son1"),'');
			playMusicBtn.x = 10;
			playMusicBtn.y = 700;

			stopMusicBtn = new Button(Assets.getAtlas().getTexture("btn_son2"),'');
			stopMusicBtn.x = 10;
			stopMusicBtn.y = 700;
			if(Assets.isPlay) addChild(playMusicBtn);
			else addChild(stopMusicBtn);
			playMusicBtn.addEventListener(starling.events.Event.TRIGGERED, toogleMusic);
			stopMusicBtn.addEventListener(starling.events.Event.TRIGGERED, toogleMusic);

		}

		private function _refresh(event : EnterFrameEvent) : void {
			_timerDisplay.text = String(_timeleft) ;
		}

		override public function set score(val:int):void{
			super.score = val;

			var _scoreDisplay:TextField = new TextField(200, 150, "", "Cubano", 64);
			_scoreDisplay.x = 315;
			_scoreDisplay.y = 350;
			_scoreDisplay.color = 0x4e941f;
			_scoreDisplay.text = String(score);
			addChild(_scoreDisplay);


		}

		private function toogleMusic(event : Event) : void {
			Assets.toogleMusic();
			if(Assets.isPlay){
				removeChild(stopMusicBtn);
				addChild(playMusicBtn);
			}else{
				removeChild(playMusicBtn);
				addChild(stopMusicBtn);
			}
		}

		private function updateTime():void
		{
			if(_timeleft > 1)
			{
				Starling.juggler.delayCall(updateTime, 1);
				_timeleft--;
			}
			else
			{
				var e : PageEvent = new PageEvent(PageEvent.CHANGE_SCREEN);
				e.page = ConstantsPage.SCORE_SCREEN;
				e.score = score;
				dispatchEvent(e);
			}
		}
	}
}
