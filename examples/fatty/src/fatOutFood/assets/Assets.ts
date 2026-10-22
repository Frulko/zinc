import { Sound, load } from 'zinc:audio';
/**
 * User: guillaume
 * Date: 26/02/13
 * Time: 15:43
 *
 */

import { TextField, Texture, TextureAtlas } from '../../compat/starling';

export class Assets{

		// Embed the Atlas XML
		public static readonly AtlasXml:string = "ui_sprite.xml";

		// Embed the Atlas Texture:
		public static readonly AtlasTexture:string = "ui_sprite.png";

		// Embed the Atlas XML
		public static readonly ElementXML:string = "sprite elements.xml";

		// Embed the Atlas Texture:
		public static ElementTexture:string = "sprite elements.png";

		// Embed the Atlas XML
		public static readonly GrosXML:string = "sprite_gros.xml";

		// Embed the Atlas Texture:
		public static GrosTexture:string = "sprite_gros.png";

		// Embed the Atlas XML
		public static readonly GrosBarbouilleXML:string = "sprite gros barbouile.xml";

		// Embed the Atlas Texture:
		public static GrosBarbouilleTexture:string = "sprite gros barbouile.png";

		// Embed the Atlas XML
		public static readonly TutoXML:string = "anim_all.xml";

		// Embed the Atlas Texture:
		public static TutoTexture:string = "anim_all.png";

		public static readonly FontXml:string = "typo/Cubano_green_64.fnt";

		public static readonly FontTexture:string = "typo/Cubano_green_64.png";





		private static uiTextureAtlas:TextureAtlas;
		private static grosTextureAtlas:TextureAtlas;
		private static grosBarbouilleTextureAtlas:TextureAtlas;
		private static elementTextureAtlas:TextureAtlas;
		private static TutoTextureAtlas:TextureAtlas;


		public static loadFont():void{
			// Zinc draws the original bitmap glyphs; their metrics come from the untouched .fnt.
			TextField;
		}
		private static ambientMusique:Sound;
		private static ambientMusiqueChannel:Sound;
		public static isPlay:boolean = false;
		public static loadMusic():void{
			Assets.ambientMusique = load("media/audio/musique_de_fond.mp3");
			Assets.ambientMusique.loop = true;
			Assets.ambientMusiqueChannel = Assets.ambientMusique;
		}

		public static playMusic():void{
			Assets.ambientMusique.play();
			Assets.isPlay = true;
		}

		public static toogleMusic():void{
			if(!Assets.isPlay){
				Assets.ambientMusique.play();
				Assets.isPlay = true;
			}else{
				Assets.ambientMusiqueChannel.stop();
				Assets.isPlay = false;
			}

		}

		public static stopMusic():void{
			Assets.ambientMusiqueChannel.stop();
			Assets.isPlay = false;
		}

		public static loadSprites():void{
			// create atlas
			Assets.elementTextureAtlas = new TextureAtlas(Assets.ElementTexture, Assets.ElementXML);
			Assets.uiTextureAtlas = new TextureAtlas(Assets.AtlasTexture, Assets.AtlasXml);
			Assets.grosTextureAtlas = new TextureAtlas(Assets.GrosTexture, Assets.GrosXML);
			Assets.grosBarbouilleTextureAtlas = new TextureAtlas(Assets.GrosBarbouilleTexture, Assets.GrosBarbouilleXML);
			Assets.TutoTextureAtlas = new TextureAtlas(Assets.TutoTexture, Assets.TutoXML);

		}

		public static getFont(): { name: string } { return { name: "Cubano" }; }

		public static getAtlas():TextureAtlas{
			return Assets.uiTextureAtlas;
		}

		public static getAtlasElement():TextureAtlas{
			return Assets.elementTextureAtlas;
		}

		public static getAtlasGros():TextureAtlas{
			return Assets.grosTextureAtlas;
		}

		public static getAtlasGrosBarbouille():TextureAtlas{
			return Assets.grosBarbouilleTextureAtlas;
		}

		public static getAtlasTuto():TextureAtlas{
			return Assets.TutoTextureAtlas;
		}

	}
