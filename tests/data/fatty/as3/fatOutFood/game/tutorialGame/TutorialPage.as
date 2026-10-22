/**
 * User: guillaume
 * Date: 26/02/13
 * Time: 15:41
 */
package fatOutFood.game.tutorialGame {

	import fatOutFood.assets.Assets;
	import fatOutFood.constants.ConstantsGame;
	import fatOutFood.constants.ConstantsPage;
	import fatOutFood.events.PageEvent;
	import fatOutFood.pageManager.APage;

	import flash.utils.setTimeout;

	import starling.core.Starling;
	import starling.display.Button;

	import starling.display.Image;
	import starling.display.MovieClip;

	import starling.display.Quad;
	import starling.events.EnterFrameEvent;
	import starling.events.Event;
	import starling.text.TextField;

	public class TutorialPage extends APage{
		private var playBtn:Button;
		private var scoreBtn:Button;
		private var _timeleft:int = 5;
		private var _timerDisplay:TextField;
		private var playMusicBtn:Button;
		private var stopMusicBtn:Button;
		public function TutorialPage(){
			super();


			//setTimeout(tutorialEnd, ConstantsGame.TUTORIAL_TIMER);
			var title:Image =new Image(Assets.getAtlas().getTexture("titre"));
			title.x = 394;
			title.y = 102;
			addChild(title);

			var fond_btn:Image =new Image(Assets.getAtlas().getTexture("fond-explications"));
			fond_btn.x = 169;
			fond_btn.y = 255;

			addChild(fond_btn);

			var authors:Image =new Image(Assets.getAtlas().getTexture("auteurs"));
			authors.x = 338;
			authors.y = 726;

			addChild(authors);

			var gros = new MovieClip(Assets.getAtlasTuto().getTextures("anim_all"), 12);
			gros.loop = true; // default: true
			gros.x = 158;
			gros.y = 292;

			addChild(gros);

			// important: add movie to juggler
			Starling.juggler.add(gros);

			_timerDisplay = new TextField(200, 150, "", "Cubano", 64);
			_timerDisplay.x = 433;
			_timerDisplay.y = 615;
			_timerDisplay.color = 0xfd5d00;

			addChild(_timerDisplay);

			playBtn = new Button(Assets.getAtlas().getTexture("btn_jouer"),'');
			addChild(playBtn);
			playBtn.width = playBtn.width - 100;
			playBtn.height = playBtn.height - 100;
			playBtn.x = 736;
			playBtn.y = 546;

			scoreBtn = new Button(Assets.getAtlas().getTexture("btn top5"),'');
			addChild(scoreBtn);
			scoreBtn.width = scoreBtn.width - 14;
			scoreBtn.height = scoreBtn.height - 14;
			scoreBtn.x = 676;
			scoreBtn.y = 566;

			playBtn.addEventListener(starling.events.Event.TRIGGERED, onPlayClick);
			scoreBtn.addEventListener(starling.events.Event.TRIGGERED, onScoreClick);

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

		/*private function tutorialEnd() : void {
			var e : PageEvent = new PageEvent(PageEvent.CHANGE_SCREEN);
			//e.page = ScreenConstants.SCORE_SCREEN;
			e.page = ConstantsGame.START_PAGE;
			dispatchEvent(e);
		}*/
		private function _refresh(event : EnterFrameEvent) : void {
			_timerDisplay.text = String(_timeleft) ;
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
				e.page = ConstantsGame.START_PAGE;
				e.score = score;
				dispatchEvent(e);
			}
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

		private function onScoreClick(event : Event) : void {
			var e : PageEvent = new PageEvent(PageEvent.CHANGE_SCREEN);
			e.page = ConstantsPage.SCORE_SCREEN;
			dispatchEvent(e);
		}



		private function onPlayClick(event:Event) : void {
			var e : PageEvent = new PageEvent(PageEvent.CHANGE_SCREEN);
			e.page = ConstantsGame.START_PAGE;
			dispatchEvent(e);
		}
	}
}
