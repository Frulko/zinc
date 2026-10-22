/**
 * User: guillaume
 * Date: 27/02/13
 * Time: 12:38
 */

import { Assets } from '../../assets/Assets';

import { ConstantsPage } from '../../constants/ConstantsPage';
import { PageEvent } from '../../events/PageEvent';
import { APage } from '../../pageManager/APage';
import { Event, EnterFrameEvent, Image, Button, TextField, Starling } from '../../../compat/starling';

export class EndPage extends APage{

		private _timeleft:number = 5;
		private _timerDisplay:TextField;
		private playMusicBtn:Button;
		private stopMusicBtn:Button;
		public constructor() {
			super();
			this._refresh = this._refresh.bind(this);
			this.toogleMusic = this.toogleMusic.bind(this);
			this.updateTime = this.updateTime.bind(this);

			let title:Image =new Image(Assets.getAtlas().getTexture("titre"));
			title.x = 394;
			title.y = 102;
			this.addChild(title);

			let authors:Image =new Image(Assets.getAtlas().getTexture("auteurs"));
			authors.x = 338;
			authors.y = 726;
			this.addChild(authors);


			let game_over:Image =new Image(Assets.getAtlas().getTexture("game-over"));
			game_over.x = 172;
			game_over.y = 247;
			this.addChild(game_over);


			let biere:Image =new Image(Assets.getAtlas().getTexture("big-biere"));
			biere.x = 649;
			biere.y = 295;
			this.addChild(biere);

			this._timerDisplay = new TextField(200, 150, "", "Cubano", 64);
			this._timerDisplay.x = 433;
			this._timerDisplay.y = 615;
			this._timerDisplay.color = 0xfd5d00;

			this.addChild(this._timerDisplay);

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

		private _refresh(event : EnterFrameEvent) : void {
			this._timerDisplay.text = String(this._timeleft) ;
		}

		public override get score():number { return super.score; }

		public override set score(val:number){
			super.score = val;

			let _scoreDisplay:TextField = new TextField(200, 150, "", "Cubano", 64);
			_scoreDisplay.x = 315;
			_scoreDisplay.y = 350;
			_scoreDisplay.color = 0x4e941f;
			_scoreDisplay.text = String(this.score);
			this.addChild(_scoreDisplay);


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
				e.page = ConstantsPage.SCORE_SCREEN;
				e.score = this.score;
				this.dispatchEvent(e);
			}
		}
	}
