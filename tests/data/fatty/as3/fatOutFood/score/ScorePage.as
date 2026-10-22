/**
 * User: guillaume
 * Date: 26/02/13
 * Time: 15:41
 */
package fatOutFood.score {

	import avmplus.variableXml;

	import fatOutFood.assets.Assets;
	import fatOutFood.constants.ConstantsGame;
	import fatOutFood.constants.ConstantsPage;
	import fatOutFood.events.PageEvent;
	import fatOutFood.pageManager.APage;

	import feathers.controls.TextInput;


	import flash.net.URLLoader;
	import flash.net.URLRequest;
	import flash.net.URLRequestMethod;
	import flash.net.URLVariables;

	import flash.events.Event;

	import starling.animation.Tween;

	import starling.core.Starling;

	import starling.display.Button;
	import starling.display.Image;
	import starling.display.Quad;
	import starling.display.Sprite;
	import starling.events.Event;
	import starling.text.TextField;

	public class ScorePage extends APage{
		private var _newscore:int = 0;
		private var _topScore:int = 0;
		private var playMusicBtn:Button;
		private var stopMusicBtn:Button;
		private var _inputName:TextInput;
		private var _validBtn:Button;
		private var scoreTab:Sprite
		var loader : URLLoader
		public function ScorePage() {


			var title:Image =new Image(Assets.getAtlas().getTexture("titre"));
			title.x = 394;
			title.y = 102;
			addChild(title);

			var authors:Image =new Image(Assets.getAtlas().getTexture("auteurs"));
			authors.x = 338;
			authors.y = 726;
			addChild(authors);


			var font_top5:Image =new Image(Assets.getAtlas().getTexture("fon-top5"));
			font_top5.x = 381;
			font_top5.y = 249;
			addChild(font_top5);

			getHighScore();



			var returnBtn = new Button(Assets.getAtlas().getTexture("btn-return"),'');
			addChild(returnBtn);
			returnBtn.x = 558;
			returnBtn.y = 493;

			var homeBtn = new Button(Assets.getAtlas().getTexture("btn-home"),'');
			addChild(homeBtn);
			homeBtn.x = 436;
			homeBtn.y = 492;

			returnBtn.addEventListener(starling.events.Event.TRIGGERED, onReturnClick);
			homeBtn.addEventListener(starling.events.Event.TRIGGERED, onHomeClick);

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


			 _validBtn = new Button(Assets.getAtlas().getTexture("btn-return"),'');
			_validBtn.width = -50;
			_validBtn.height = -50;
			_validBtn.addEventListener(starling.events.Event.TRIGGERED, _onValid);

		}

		private function _onValid(event : starling.events.Event) : void {
			var name = _inputName.text;

			setNewScore(name);
		}

		private function getHighScore() : void {
			loader = new URLLoader();
			var request : URLRequest = new URLRequest("http://www.cordechasse.fr/gobelins/CRM12/scripts/getTopScores.php");

			request.method = URLRequestMethod.POST;
			var variables : URLVariables = new URLVariables();
			variables.project_name = "ac_dg";
			variables.max_row = 5;
			request.data = variables;

			//  Handlers
			loader.addEventListener(flash.events.Event.COMPLETE, on_completeGetScore);
			loader.load(request);
		}

		private function on_completeGetScore(event : flash.events.Event) : void {
			var result:XML = XML(loader.data);
			 scoreTab = new Sprite();
			var items:XMLList = result.content.item;
			var depX:int = 0;
			for(var i:int = 0; i<items.length(); i++){
				var userName:String = items[i].user_name;
				var score:int = items[i].score;

				var _topName = new TextField(150, 30, "", "Cubano", 22);
				_topName.x = 0;
				_topName.y =  depX+30;
				_topName.color = 0xfd5d00;

				scoreTab.addChild(_topName);


				var _topScoreD = new TextField(100, 30, "", "Cubano", 22);
				_topScoreD.x = 145;
				_topScoreD.y =  depX+30;
				_topScoreD.color = 0x4e941f;

				scoreTab.addChild(_topScoreD);



				if(_newscore > items[i].score &&  _newscore < items[i-1].score){

					showInput();
					scoreTab.addChild(_inputName);
					_inputName.x = 0
					_inputName.y = depX+30
					scoreTab.addChild(_validBtn);
					_validBtn.x = 285;
					_validBtn.y = depX+75;
					_topScoreD.text = String(_topScore)+" KG";

				}else{
					_topName.text = String(userName);
					_topScoreD.text = String(score);
				}
				depX = _topScoreD.y;
			}


			addChild(scoreTab);
			scoreTab.x = 400;
			scoreTab.y = 290;

		}

		private function toogleMusic(event : starling.events.Event) : void {
			Assets.toogleMusic();
			if(Assets.isPlay){
				removeChild(stopMusicBtn);
				addChild(playMusicBtn);


			}else{
				removeChild(playMusicBtn);
				addChild(stopMusicBtn);
			}
		}

		private function showInput() : void {


			_inputName = new TextInput();
			_inputName.width = 150;
			_inputName.height = 30;
			_inputName.minTouchWidth = 150;
			_inputName.minTouchHeight = 30;
			_inputName.textEditorProperties.fontFamily = "Cubano";
			_inputName.textEditorProperties.fontSize = 22;
			_inputName.textEditorProperties.color = 0xfd5d00;
			_inputName.text = "Ton nom";
			_inputName.setFocus();


		}

		override public function set score(val:int):void{
			super.score = val;
			_newscore = val;
			if(val > 0) checkScore();
		}

		private function checkScore() : void {
			if(score > _topScore){
				_topScore = score;
				//showInput();
				//setNewScore();
			}
		}

		private function setNewScore(name:String) : void {
			var loader : URLLoader = new URLLoader();
			var request : URLRequest = new URLRequest("http://www.cordechasse.fr/gobelins/CRM12/scripts/setScore.php");

			request.method = URLRequestMethod.POST;
			var variables : URLVariables = new URLVariables();
			variables.project_name = "ac_dg";
			variables.user_name = name;
			variables.score = _newscore;
			request.data = variables;
			loader.addEventListener(flash.events.Event.COMPLETE, on_send);
			loader.load(request);
		}

		private function on_send(event : flash.events.Event) : void {
			removeChild(scoreTab);
			getHighScore();
		}

		private function onHomeClick(event : starling.events.Event) : void {
			var e : PageEvent = new PageEvent(PageEvent.CHANGE_SCREEN);
			e.page = ConstantsPage.HOME_SCREEN;
			dispatchEvent(e);
		}

		private function onReturnClick(event : starling.events.Event) : void {
			var e : PageEvent = new PageEvent(PageEvent.CHANGE_SCREEN);
			e.page = ConstantsGame.TUTORIAL_PAGE;
			dispatchEvent(e);
		}

	}
}
