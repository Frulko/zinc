import { Line } from './Line';
import { Character } from './Character';
/**
 * User: guillaume
 * Date: 26/02/13
 * Time: 15:43
 */

import { Assets } from '../../assets/Assets';
import { ConstantsGame } from '../../constants/ConstantsGame';
import { ConstantsPage } from '../../constants/ConstantsPage';
import { GameEvent } from '../../events/GameEvent';
import { PageEvent } from '../../events/PageEvent';
import { ATarget } from './target/ATarget';
import { Friend } from './target/Friend';

import { APage } from '../../pageManager/APage';

import { Event, EnterFrameEvent, Image, Button, TextField, Starling } from '../../../compat/starling';

export class PlayPage extends APage{

		private _line:Line;
		private _point:number = 0;
		private _sens:number = 1;
		private _level:number = ConstantsGame.VITESSE_DISTANCE;
		private _gros:Character;
		private _scoreDisplay:TextField;
		private _timerDisplay:TextField;
		private _timeleft:number = ConstantsGame.PARTY_DURATION;
		private playMusicBtn:Button;
		private stopMusicBtn:Button;
		private _life = [] as Image[];

		public constructor() {
			super();
			this._lineDead = this._lineDead.bind(this);

			this._firstStep = this._firstStep.bind(this);
			this._onShot = this._onShot.bind(this);

			this._refresh = this._refresh.bind(this);
			this.toogleMusic = this.toogleMusic.bind(this);
			this._onDie = this._onDie.bind(this);
			this.updateTime = this.updateTime.bind(this);


			this.onHomeClick = this.onHomeClick.bind(this);
			this.onReturnClick = this.onReturnClick.bind(this);
			this.startGame();
			this.updateTime();

			this.addEventListener(GameEvent.NO_SHOT, this._onShot);
			this.addEventListener(GameEvent.ON_DIE, this._onDie);
			this.addEventListener(EnterFrameEvent.ENTER_FRAME, this._refresh);
			this.x = 401;
			this.y = 391;

			let fond_menu:Image =new Image(Assets.getAtlas().getTexture("fond-menu-game"));
			fond_menu.x = 398;
			fond_menu.y = -231;
			this.addChild(fond_menu);

			this.changeLifeDisplay();

			this._timerDisplay = new TextField(200, 150, "", "Cubano", 64);
			this._timerDisplay.x = 423;
			this._timerDisplay.y = -197;
			this._timerDisplay.color = 0xfd5d00;
			this._timerDisplay.text = String(this._timeleft)+"'";
			this.addChild(this._timerDisplay);

			this._scoreDisplay = new TextField(200, 150, "0", "Cubano", 64);
			this._scoreDisplay.x = 423;
			this._scoreDisplay.y = -97;
			this._scoreDisplay.color = 0x4e941f;
			this.addChild(this._scoreDisplay);

			let returnBtn = new Button(Assets.getAtlas().getTexture("btn-return"),'');
			this.addChild(returnBtn);
			returnBtn.x = 438;
			returnBtn.y = 33

			let homeBtn = new Button(Assets.getAtlas().getTexture("btn-home"),'');
			this.addChild(homeBtn);
			homeBtn.x = 537;
			homeBtn.y = 33;

			returnBtn.addEventListener(Event.TRIGGERED, this.onReturnClick);
			homeBtn.addEventListener(Event.TRIGGERED, this.onHomeClick);

			this.playMusicBtn = new Button(Assets.getAtlas().getTexture("btn_son1"),'');
			this.playMusicBtn.x = -391;
			this.playMusicBtn.y = 309;

			this.stopMusicBtn = new Button(Assets.getAtlas().getTexture("btn_son2"),'');
			this.stopMusicBtn.x = -391;
			this.stopMusicBtn.y = 309;

			if(Assets.isPlay) this.addChild(this.playMusicBtn);
			else this.addChild(this.stopMusicBtn);

			this.playMusicBtn.addEventListener(Event.TRIGGERED, this.toogleMusic);
			this.stopMusicBtn.addEventListener(Event.TRIGGERED, this.toogleMusic);
		}

		private _lineDead(event : GameEvent) : void {
			event.stopPropagation();
			this.removeChild(event.target as Line);
			this.removeEventListener(GameEvent.ON_LINE_DEAD, this._lineDead)
			this._level += 0.5;
		}

		private _newLine(vitesse:number = 0) : void {
			this._line = new Line(this._level, this._sens);
			this._line.show();
			if(this._sens == 1){
				this._sens = -1;
			}else{
				this._sens = 1;
			}
			this.addChildAt(this._line, 0);
			this.addEventListener(GameEvent.ON_LINE_DEAD, this._lineDead);
			this.addEventListener(GameEvent.ON_FIRST_STEP, this._firstStep);
		}

		private _firstStep(event : GameEvent) : void {
			event.stopPropagation();
			this.removeEventListener(GameEvent.ON_FIRST_STEP, this._firstStep);
			this._newLine();
		}


		private _onShot(event : GameEvent) : void {
			event.stopPropagation();
			let target:ATarget = event.target as ATarget;
			target.removeEventListener(GameEvent.NO_SHOT,this._onDie);

			if(this._gros.life > 1){
				this._gros.life = -1;
				this.changeLifeDisplay();
			}else{
				let e : PageEvent = new PageEvent(PageEvent.CHANGE_SCREEN);
				e.page = ConstantsGame.END_PAGE;
				e.score = this._point;
				this.dispatchEvent(e);
			}
		}

		private changeLifeDisplay() : void {
			let depX = 390;
			for(let i=0; i < 3; i++){
				this.removeChild(this._life[i]);

				if(i < this._gros.life){
					this._life[i] =new Image(Assets.getAtlas().getTexture("vie"));
					this._life[i].y = 178;
				}else{
					this._life[i] =new Image(Assets.getAtlas().getTexture("pas-vie"));
					this._life[i].y = 175;
				}

				this._life[i].x = depX+50;

				this.addChild(this._life[i]);

				depX = this._life[i].x;
			}
		}

		private _refresh(event : EnterFrameEvent) : void {
			this._timerDisplay.text = String(this._timeleft)+"'";
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

		private _onDie(event : GameEvent) : void {

			event.stopPropagation();
			let target:ATarget = event.target as ATarget;

			this.removeChild(target);
			target.removeEventListener(GameEvent.ON_DIE,this._onDie);

			this._point += target.points;
			this._scoreDisplay.text = String(this._point);

		}

		private updateTime():void
		{
			if(this._timeleft > 1)
			{
				Starling.juggler.delayCall(this.updateTime, 1, this);
				this._timeleft--;
				//trace(_timeleft)

			}
			else
			{
				let e : PageEvent = new PageEvent(PageEvent.CHANGE_SCREEN);
				e.page = ConstantsGame.END_PAGE;
				e.score = this._point;
				this.dispatchEvent(e);
			}
		}

		private stopAnim(event : GameEvent) : void {


			let friend:Friend = event.target as Friend;
				this.removeChild(friend);



		}

		private startGame() : void {

			this._newLine(this._level);


			this._gros = new Character();
			this.addChild(this._gros);






		}

		private onHomeClick(event : Event) : void {
			let e : PageEvent = new PageEvent(PageEvent.CHANGE_SCREEN);
			e.page = ConstantsPage.HOME_SCREEN;
			this.dispatchEvent(e);
		}

		private onReturnClick(event : Event) : void {
			let e : PageEvent = new PageEvent(PageEvent.CHANGE_SCREEN);
			e.page = ConstantsGame.TUTORIAL_PAGE;
			this.dispatchEvent(e);
		}


	}
