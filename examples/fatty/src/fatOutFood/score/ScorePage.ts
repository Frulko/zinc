import { Starling } from '../../compat/starling';
import { getHighScores, saveScore } from '../../services/scores';
import { TextInput } from '../../compat/text';
/**
 * User: guillaume
 * Date: 26/02/13
 * Time: 15:41
 */

import { Assets } from '../assets/Assets';
import { ConstantsGame } from '../constants/ConstantsGame';
import { ConstantsPage } from '../constants/ConstantsPage';
import { PageEvent } from '../events/PageEvent';
import { APage } from '../pageManager/APage';
import { Sprite, Event, Image, Button, TextField } from '../../compat/starling';

export class ScorePage extends APage{
		private _newscore:number = 0;
		private _topScore:number = 0;
		private playMusicBtn:Button;
		private stopMusicBtn:Button;
		private _inputName:TextInput;
		private _validBtn:Button;
		private scoreTab:Sprite
		public constructor() {
			super();
			this._onValid = this._onValid.bind(this);

			this.on_completeGetScore = this.on_completeGetScore.bind(this);
			this.toogleMusic = this.toogleMusic.bind(this);



			this.on_send = this.on_send.bind(this);
			this.onHomeClick = this.onHomeClick.bind(this);
			this.onReturnClick = this.onReturnClick.bind(this);


			let title:Image =new Image(Assets.getAtlas().getTexture("titre"));
			title.x = 394;
			title.y = 102;
			this.addChild(title);

			let authors:Image =new Image(Assets.getAtlas().getTexture("auteurs"));
			authors.x = 338;
			authors.y = 726;
			this.addChild(authors);


			let font_top5:Image =new Image(Assets.getAtlas().getTexture("fon-top5"));
			font_top5.x = 381;
			font_top5.y = 249;
			this.addChild(font_top5);

			this.getHighScore();



			let returnBtn = new Button(Assets.getAtlas().getTexture("btn-return"),'');
			this.addChild(returnBtn);
			returnBtn.x = 558;
			returnBtn.y = 493;

			let homeBtn = new Button(Assets.getAtlas().getTexture("btn-home"),'');
			this.addChild(homeBtn);
			homeBtn.x = 436;
			homeBtn.y = 492;

			returnBtn.addEventListener(Event.TRIGGERED, this.onReturnClick);
			homeBtn.addEventListener(Event.TRIGGERED, this.onHomeClick);

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


			 this._validBtn = new Button(Assets.getAtlas().getTexture("btn-return"),'');
			this._validBtn.width = 50;
			this._validBtn.height = 50;
			this._validBtn.addEventListener(Event.TRIGGERED, this._onValid);

		}

		private _onValid(event : Event) : void {
			let name = this._inputName.text;

			this.setNewScore(name);
		}

		private getHighScore() : void {
			//  Handlers
			Starling.juggler.delayCall(() => this.on_completeGetScore(new Event(Event.COMPLETE)), 0, this);
		}

		private on_completeGetScore(event : Event) : void {

			 this.scoreTab = new Sprite();
			const items = getHighScores();
			let depX:number = 0;
			for(let i:number = 0; i<items.length; i++){
				let userName:string = items[i].user_name;
				let score:number = items[i].score;

				let _topName = new TextField(150, 30, "", "Cubano", 22);
				_topName.x = 0;
				_topName.y =  depX+30;
				_topName.color = 0xfd5d00;

				this.scoreTab.addChild(_topName);


				let _topScoreD = new TextField(100, 30, "", "Cubano", 22);
				_topScoreD.x = 145;
				_topScoreD.y =  depX+30;
				_topScoreD.color = 0x4e941f;

				this.scoreTab.addChild(_topScoreD);



				if(this._newscore > items[i].score &&  (i === 0 || this._newscore <= items[i-1].score)){

					this.showInput();
					this.scoreTab.addChild(this._inputName);
					this._inputName.x = 0
					this._inputName.y = depX+30
					this.scoreTab.addChild(this._validBtn);
					this._validBtn.x = 285;
					this._validBtn.y = depX+75;
					_topScoreD.text = String(this._topScore)+" KG";

				}else{
					_topName.text = String(userName);
					_topScoreD.text = String(score);
				}
				depX = _topScoreD.y;
			}


			this.addChild(this.scoreTab);
			this.scoreTab.x = 400;
			this.scoreTab.y = 290;

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

		private showInput() : void {


			this._inputName = new TextInput();
			this._inputName.width = 150;
			this._inputName.height = 30;
			this._inputName.minTouchWidth = 150;
			this._inputName.minTouchHeight = 30;
			this._inputName.textEditorProperties.fontFamily = "Cubano";
			this._inputName.textEditorProperties.fontSize = 22;
			this._inputName.textEditorProperties.color = 0xfd5d00;
			this._inputName.text = "Ton nom";
			this._inputName.setFocus();


		}

		public override get score():number { return super.score; }

		public override set score(val:number){
			super.score = val;
			this._newscore = val;
			if(val > 0) this.checkScore();
		}

		private checkScore() : void {
			if(this.score > this._topScore){
				this._topScore = this.score;
				//showInput();
				//setNewScore();
			}
		}

		private setNewScore(name:string) : void {
			try {
				saveScore(name, this._newscore);
				this._newscore = 0;
				this.on_send(new Event(Event.COMPLETE));
			} catch (error) {
				this._inputName.text = "Erreur sauvegarde";
				console.error(String(error));
			}
		}

		private on_send(event : Event) : void {
			this.removeChild(this.scoreTab);
			this.getHighScore();
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
