/**
 * User: guillaume
 * Date: 26/02/13
 * Time: 15:43
 */
package fatOutFood.game.playGame {

	import fatOutFood.assets.Assets;
	import fatOutFood.constants.ConstantsGame;
	import fatOutFood.constants.ConstantsPage;
	import fatOutFood.events.GameEvent;
	import fatOutFood.events.PageEvent;
	import fatOutFood.game.playGame.target.*;
	import fatOutFood.pageManager.APage;
	import fatOutFood.pageManager.PageManager;

	import starling.core.Starling;
	import starling.display.Button;
	import starling.display.Image;
	import starling.display.MovieClip;
	import starling.events.EnterFrameEvent;
	import starling.events.Event;
	import starling.text.TextField;
	import starling.textures.Texture;
	import starling.textures.TextureAtlas;
	import starling.utils.deg2rad;

	public class PlayPage extends APage{

		private var _line:Line;
		private var _point:int = 0;
		private var _sens:int = 1;
		private var _level:Number = ConstantsGame.VITESSE_DISTANCE;
		private var _gros:Character;
		private var _scoreDisplay:TextField;
		private var _timerDisplay:TextField;
		private var _timeleft:Number = ConstantsGame.PARTY_DURATION;
		private var playMusicBtn:Button;
		private var stopMusicBtn:Button;
		private var _life = new Vector.<Image>(3, true);

		public function PlayPage() {
			startGame();
			updateTime();

			this.addEventListener(GameEvent.NO_SHOT, _onShot);
			this.addEventListener(GameEvent.ON_DIE, _onDie);
			this.addEventListener(EnterFrameEvent.ENTER_FRAME, _refresh);
			this.x = 401;
			this.y = 391;

			var fond_menu:Image =new Image(Assets.getAtlas().getTexture("fond-menu-game"));
			fond_menu.x = 398;
			fond_menu.y = -231;
			addChild(fond_menu);

			changeLifeDisplay();

			_timerDisplay = new TextField(200, 150, "", "Cubano", 64);
			_timerDisplay.x = 423;
			_timerDisplay.y = -197;
			_timerDisplay.color = 0xfd5d00;
			_timerDisplay.text = String(_timeleft)+"'";
			addChild(_timerDisplay);

			_scoreDisplay = new TextField(200, 150, "0", "Cubano", 64);
			_scoreDisplay.x = 423;
			_scoreDisplay.y = -97;
			_scoreDisplay.color = 0x4e941f;
			addChild(_scoreDisplay);

			var returnBtn = new Button(Assets.getAtlas().getTexture("btn-return"),'');
			addChild(returnBtn);
			returnBtn.x = 438;
			returnBtn.y = 33

			var homeBtn = new Button(Assets.getAtlas().getTexture("btn-home"),'');
			addChild(homeBtn);
			homeBtn.x = 537;
			homeBtn.y = 33;

			returnBtn.addEventListener(Event.TRIGGERED, onReturnClick);
			homeBtn.addEventListener(Event.TRIGGERED, onHomeClick);

			playMusicBtn = new Button(Assets.getAtlas().getTexture("btn_son1"),'');
			playMusicBtn.x = -391;
			playMusicBtn.y = 309;

			stopMusicBtn = new Button(Assets.getAtlas().getTexture("btn_son2"),'');
			stopMusicBtn.x = -391;
			stopMusicBtn.y = 309;

			if(Assets.isPlay) addChild(playMusicBtn);
			else addChild(stopMusicBtn);

			playMusicBtn.addEventListener(starling.events.Event.TRIGGERED, toogleMusic);
			stopMusicBtn.addEventListener(starling.events.Event.TRIGGERED, toogleMusic);
		}

		private function _lineDead(event : GameEvent) : void {
			event.stopPropagation();
			removeChild(event.target as Line);
			removeEventListener(GameEvent.ON_LINE_DEAD, _lineDead)
			_level += 0.5;
		}

		private function _newLine(vitesse:Number = 0) : void {
			_line = new Line(_level, _sens);
			_line.show();
			if(_sens == 1){
				_sens = -1;
			}else{
				_sens = 1;
			}
			addChildAt(_line, 0);
			this.addEventListener(GameEvent.ON_LINE_DEAD, _lineDead);
			this.addEventListener(GameEvent.ON_FIRST_STEP, _firstStep);
		}

		private function _firstStep(event : GameEvent) : void {
			event.stopPropagation();
			removeEventListener(GameEvent.ON_FIRST_STEP, _firstStep);
			_newLine();
		}


		private function _onShot(event : GameEvent) : void {
			event.stopPropagation();
			var target:ATarget = event.target as ATarget;
			target.removeEventListener(GameEvent.NO_SHOT,_onDie);

			if(_gros.life > 1){
				_gros.life = -1;
				changeLifeDisplay();
			}else{
				var e : PageEvent = new PageEvent(PageEvent.CHANGE_SCREEN);
				e.page = ConstantsGame.END_PAGE;
				e.score = _point;
				dispatchEvent(e);
			}
		}

		private function changeLifeDisplay() : void {
			var depX = 390;
			for(var i=0; i < 3; i++){
				removeChild(_life[i]);

				if(i < _gros.life){
					_life[i] =new Image(Assets.getAtlas().getTexture("vie"));
					_life[i].y = 178;
				}else{
					_life[i] =new Image(Assets.getAtlas().getTexture("pas-vie"));
					_life[i].y = 175;
				}

				_life[i].x = depX+50;

				addChild(_life[i]);

				depX = _life[i].x;
			}
		}

		private function _refresh(event : EnterFrameEvent) : void {
			_timerDisplay.text = String(_timeleft)+"'";
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

		private function _onDie(event : GameEvent) : void {

			event.stopPropagation();
			var target:ATarget = event.target as ATarget;

			removeChild(target);
			target.removeEventListener(GameEvent.ON_DIE,_onDie);

			_point += target.points;
			_scoreDisplay.text = String(_point);

		}

		private function updateTime():void
		{
			if(_timeleft > 1)
			{
				Starling.juggler.delayCall(updateTime, 1);
				_timeleft--;
				//trace(_timeleft)

			}
			else
			{
				var e : PageEvent = new PageEvent(PageEvent.CHANGE_SCREEN);
				e.page = ConstantsGame.END_PAGE;
				e.score = _point;
				dispatchEvent(e);
			}
		}

		private function stopAnim(event : GameEvent) : void {


			var friend:Friend = event.target as Friend;
				removeChild(friend);



		}

		private function startGame() : void {

			_newLine(_level);


			_gros = new Character();
			addChild(_gros);






		}

		private function onHomeClick(event : Event) : void {
			var e : PageEvent = new PageEvent(PageEvent.CHANGE_SCREEN);
			e.page = ConstantsPage.HOME_SCREEN;
			dispatchEvent(e);
		}

		private function onReturnClick(event : Event) : void {
			var e : PageEvent = new PageEvent(PageEvent.CHANGE_SCREEN);
			e.page = ConstantsGame.TUTORIAL_PAGE;
			dispatchEvent(e);
		}


	}
}
