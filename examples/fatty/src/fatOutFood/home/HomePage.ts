/**
 * User: guillaume
 * Date: 26/02/13
 * Time: 15:41
 */

import { Assets } from '../assets/Assets';
import { ConstantsPage } from '../constants/ConstantsPage';
import { PageEvent } from '../events/PageEvent';
import { APage } from '../pageManager/APage';
import { Event, Image, Button } from '../../compat/starling';

export class HomePage extends APage{

		private playBtn:Button;
		private scoreBtn:Button;
		private playMusicBtn:Button;
		private stopMusicBtn:Button;

		public constructor() {
			super();
			this.toogleMusic = this.toogleMusic.bind(this);
			this.onScoreClick = this.onScoreClick.bind(this);
			this.onPlayClick = this.onPlayClick.bind(this);


			let title:Image =new Image(Assets.getAtlas().getTexture("titre"));
			title.x = 394;
			title.y = 102;

			let fond_btn:Image =new Image(Assets.getAtlas().getTexture("fond-btn-accueil"));
			fond_btn.x = 393;
			fond_btn.y = 220;

			let score:Image =new Image(Assets.getAtlas().getTexture("top5"));
			score.x = 633;
			score.y = 386;

			let authors:Image =new Image(Assets.getAtlas().getTexture("auteurs"));
			authors.x = 338;
			authors.y = 726;

			let hotdog:Image =new Image(Assets.getAtlas().getTexture("hotdog"));
			hotdog.x = 320;
			hotdog.y = 514;

			let sushi:Image =new Image(Assets.getAtlas().getTexture("maki"));
			sushi.x = 410;
			sushi.y = 512;

			let biere:Image =new Image(Assets.getAtlas().getTexture("biere-3"));
			biere.x = 494;
			biere.y = 512;

			let pomme:Image =new Image(Assets.getAtlas().getTexture("pomme"));
			pomme.x = 583;
			pomme.y = 512;

			let ecrou:Image =new Image(Assets.getAtlas().getTexture("boulon"));
			ecrou.x = 662;
			ecrou.y = 520;


			this.addChild(hotdog);
			this.addChild(sushi);
			this.addChild(biere);
			this.addChild(pomme);
			this.addChild(ecrou);






			this.addChild(fond_btn);
			this.addChild(title);
			this.addChild(score);
			this.addChild(authors);

			this.playBtn = new Button(Assets.getAtlas().getTexture("btn_jouer"),'');
			this.addChild(this.playBtn);
			this.playBtn.x = 416;
			this.playBtn.y = 243;

			this.scoreBtn = new Button(Assets.getAtlas().getTexture("btn top5"),'');
			this.addChild(this.scoreBtn);
			this.scoreBtn.x = 616;
			this.scoreBtn.y = 305;

			this.playBtn.addEventListener(Event.TRIGGERED, this.onPlayClick);
			this.scoreBtn.addEventListener(Event.TRIGGERED, this.onScoreClick);


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
			e.page = ConstantsPage.GAME_SCREEN;
			this.dispatchEvent(e);
		}

	}
