/**
 * User: guillaume
 * Date: 26/02/13
 * Time: 15:41
 */

import { Assets } from '../../assets/Assets';
import { ConstantsGame } from '../../constants/ConstantsGame';
import { ConstantsPage } from '../../constants/ConstantsPage';
import { PageEvent } from '../../events/PageEvent';
import { APage } from '../../pageManager/APage';
import { Event, EnterFrameEvent, Image, Button, MovieClip, TextField, Starling } from '../../../compat/starling';

export class TutorialPage extends APage{
		private playBtn:Button;
		private scoreBtn:Button;
		private _timeleft:number = 5;
		private _timerDisplay:TextField;
		private playMusicBtn:Button;
		private stopMusicBtn:Button;
		public constructor(){
			super();
			this._refresh = this._refresh.bind(this);
			this.updateTime = this.updateTime.bind(this);
			this.toogleMusic = this.toogleMusic.bind(this);
			this.onScoreClick = this.onScoreClick.bind(this);
			this.onPlayClick = this.onPlayClick.bind(this);


			//setTimeout(tutorialEnd, ConstantsGame.TUTORIAL_TIMER);
			let title:Image =new Image(Assets.getAtlas().getTexture("titre"));
			title.x = 394;
			title.y = 102;
			this.addChild(title);

			let fond_btn:Image =new Image(Assets.getAtlas().getTexture("fond-explications"));
			fond_btn.x = 169;
			fond_btn.y = 255;

			this.addChild(fond_btn);

			let authors:Image =new Image(Assets.getAtlas().getTexture("auteurs"));
			authors.x = 338;
			authors.y = 726;

			this.addChild(authors);

			let gros = new MovieClip(Assets.getAtlasTuto().getTextures("anim_all"), 12);
			gros.loop = true; // default: true
			gros.x = 158;
			gros.y = 292;

			this.addChild(gros);

			// important: add movie to juggler
			Starling.juggler.add(gros, this);

			this._timerDisplay = new TextField(200, 150, "", "Cubano", 64);
			this._timerDisplay.x = 433;
			this._timerDisplay.y = 615;
			this._timerDisplay.color = 0xfd5d00;

			this.addChild(this._timerDisplay);

			this.playBtn = new Button(Assets.getAtlas().getTexture("btn_jouer"),'');
			this.addChild(this.playBtn);
			this.playBtn.width = this.playBtn.width - 100;
			this.playBtn.height = this.playBtn.height - 100;
			this.playBtn.x = 736;
			this.playBtn.y = 546;

			this.scoreBtn = new Button(Assets.getAtlas().getTexture("btn top5"),'');
			this.addChild(this.scoreBtn);
			this.scoreBtn.width = this.scoreBtn.width - 14;
			this.scoreBtn.height = this.scoreBtn.height - 14;
			this.scoreBtn.x = 676;
			this.scoreBtn.y = 566;

			this.playBtn.addEventListener(Event.TRIGGERED, this.onPlayClick);
			this.scoreBtn.addEventListener(Event.TRIGGERED, this.onScoreClick);

			this.updateTime();
			this.addEventListener(EnterFrameEvent.ENTER_FRAME, this._refresh);

			this.playMusicBtn = new Button(Assets.getAtlas().getTexture("btn_son1"),'');
			this.playMusicBtn.x = 10;
			this.playMusicBtn.y = 700;

			this.stopMusicBtn = new Button(Assets.getAtlas().getTexture("btn_son2"),'');
			this.stopMusicBtn.x = 10;
			this.stopMusicBtn.y = 700;

			if(Assets.isPlay) this.addChild(this.playMusicBtn);
			else this.addChild(this.stopMusicBtn);

			this.playMusicBtn.addEventListener(Event.TRIGGERED, this.toogleMusic);
			this.stopMusicBtn.addEventListener(Event.TRIGGERED, this.toogleMusic);
		}

		/*private function tutorialEnd() : void {
			var e : PageEvent = new PageEvent(PageEvent.CHANGE_SCREEN);
			//e.page = ScreenConstants.SCORE_SCREEN;
			e.page = ConstantsGame.START_PAGE;
			dispatchEvent(e);
		}*/
		private _refresh(event : EnterFrameEvent) : void {
			this._timerDisplay.text = String(this._timeleft) ;
		}

		private updateTime():void
		{
			if(this._timeleft > 1)
			{
				Starling.juggler.delayCall(this.updateTime, 1, this);
				this._timeleft--;
			}
			else
			{
				let e : PageEvent = new PageEvent(PageEvent.CHANGE_SCREEN);
				e.page = ConstantsGame.START_PAGE;
				e.score = this.score;
				this.dispatchEvent(e);
			}
		}

		private toogleMusic(event : Event) : void {
			Assets.toogleMusic();
			if(Assets.isPlay){
				this.removeChild(this.stopMusicBtn);
				this.addChild(this.playMusicBtn);


			}else{
				this.removeChild(this.playMusicBtn);
				this.addChild(this.stopMusicBtn);
			}
		}

		private onScoreClick(event : Event) : void {
			let e : PageEvent = new PageEvent(PageEvent.CHANGE_SCREEN);
			e.page = ConstantsPage.SCORE_SCREEN;
			this.dispatchEvent(e);
		}



		private onPlayClick(event:Event) : void {
			let e : PageEvent = new PageEvent(PageEvent.CHANGE_SCREEN);
			e.page = ConstantsGame.START_PAGE;
			this.dispatchEvent(e);
		}
	}
