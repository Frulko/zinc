/**
 * User: guillaume
 * Date: 26/02/13
 * Time: 15:41
 */
package fatOutFood.home{


	import fatOutFood.assets.Assets;
	import fatOutFood.constants.ConstantsPage;
	import fatOutFood.events.PageEvent;
	import fatOutFood.pageManager.APage;
	import starling.display.Button;
	import starling.display.Image;
	import starling.events.Event;

	public class HomePage extends APage{

		private var playBtn:Button;
		private var scoreBtn:Button;
		private var playMusicBtn:Button;
		private var stopMusicBtn:Button;

		public function HomePage() {
			super();


			var title:Image =new Image(Assets.getAtlas().getTexture("titre"));
			title.x = 394;
			title.y = 102;

			var fond_btn:Image =new Image(Assets.getAtlas().getTexture("fond-btn-accueil"));
			fond_btn.x = 393;
			fond_btn.y = 220;

			var score:Image =new Image(Assets.getAtlas().getTexture("top5"));
			score.x = 633;
			score.y = 386;

			var authors:Image =new Image(Assets.getAtlas().getTexture("auteurs"));
			authors.x = 338;
			authors.y = 726;

			var hotdog:Image =new Image(Assets.getAtlas().getTexture("hotdog"));
			hotdog.x = 320;
			hotdog.y = 514;

			var sushi:Image =new Image(Assets.getAtlas().getTexture("maki"));
			sushi.x = 410;
			sushi.y = 512;

			var biere:Image =new Image(Assets.getAtlas().getTexture("biere-3"));
			biere.x = 494;
			biere.y = 512;

			var pomme:Image =new Image(Assets.getAtlas().getTexture("pomme"));
			pomme.x = 583;
			pomme.y = 512;

			var ecrou:Image =new Image(Assets.getAtlas().getTexture("boulon"));
			ecrou.x = 662;
			ecrou.y = 520;


			addChild(hotdog);
			addChild(sushi);
			addChild(biere);
			addChild(pomme);
			addChild(ecrou);






			addChild(fond_btn);
			addChild(title);
			addChild(score);
			addChild(authors);

			playBtn = new Button(Assets.getAtlas().getTexture("btn_jouer"),'');
			addChild(playBtn);
			playBtn.x = 416;
			playBtn.y = 243;

			scoreBtn = new Button(Assets.getAtlas().getTexture("btn top5"),'');
			addChild(scoreBtn);
			scoreBtn.x = 616;
			scoreBtn.y = 305;

			playBtn.addEventListener(starling.events.Event.TRIGGERED, onPlayClick);
			scoreBtn.addEventListener(starling.events.Event.TRIGGERED, onScoreClick);


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
			e.page = ConstantsPage.GAME_SCREEN;
			dispatchEvent(e);
		}

	}
}
