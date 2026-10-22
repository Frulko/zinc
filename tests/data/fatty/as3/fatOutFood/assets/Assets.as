/**
 * User: guillaume
 * Date: 26/02/13
 * Time: 15:43
 *
 */
package fatOutFood.assets {

	import flash.display.Bitmap;
	import flash.media.Sound;
	import flash.media.SoundChannel;
	import flash.net.URLRequest;
	import flash.utils.Dictionary;

	import starling.text.BitmapFont;
	import starling.text.TextField;
	import starling.textures.Texture;
	import starling.textures.TextureAtlas;

	public class Assets{

		// Embed the Atlas XML
		[Embed(source="/../assets/ui_sprite.xml", mimeType="application/octet-stream")]
		public static const AtlasXml:Class;

		// Embed the Atlas Texture:
		[Embed(source="/../assets/ui_sprite.png")]
		public static const AtlasTexture:Class;

		// Embed the Atlas XML
		[Embed(source="/../assets/sprite elements.xml", mimeType="application/octet-stream")]
		public static const ElementXML:Class;

		// Embed the Atlas Texture:
		[Embed(source="/../assets/sprite elements.png")]
		public static var ElementTexture:Class;

		// Embed the Atlas XML
		[Embed(source="/../assets/sprite_gros.xml", mimeType="application/octet-stream")]
		public static const GrosXML:Class;

		// Embed the Atlas Texture:
		[Embed(source="/../assets/sprite_gros.png")]
		public static var GrosTexture:Class;

		// Embed the Atlas XML
		[Embed(source="/../assets/sprite gros barbouile.xml", mimeType="application/octet-stream")]
		public static const GrosBarbouilleXML:Class;

		// Embed the Atlas Texture:
		[Embed(source="/../assets/sprite gros barbouile.png")]
		public static var GrosBarbouilleTexture:Class;

		// Embed the Atlas XML
		[Embed(source="/../assets/anim_all.xml", mimeType="application/octet-stream")]
		public static const TutoXML:Class;

		// Embed the Atlas Texture:
		[Embed(source="/../assets/anim_all.png")]
		public static var TutoTexture:Class;

		[Embed(source="/../assets/typo/Cubano_green_64.fnt", mimeType="application/octet-stream")]
		public static const FontXml:Class;

		[Embed(source = "/../assets/typo/Cubano_green_64.png")]
		public static const FontTexture:Class;





		private static var uiTextureAtlas:TextureAtlas;
		private static var grosTextureAtlas:TextureAtlas;
		private static var grosBarbouilleTextureAtlas:TextureAtlas;
		private static var elementTextureAtlas:TextureAtlas;
		private static var TutoTextureAtlas:TextureAtlas;


		public static function loadFont():void{
			var fontTexture:Texture = Texture.fromBitmap(new FontTexture());
			var fontXML:XML = XML(new FontXml());

			var font:BitmapFont = new BitmapFont(fontTexture, fontXML);
			TextField.registerBitmapFont(font);

		}
		private static var ambientMusique:Sound;
		private static var ambientMusiqueChannel:SoundChannel;
		public static var isPlay:Boolean;
		public static function loadMusic():void{
			ambientMusique = new Sound();
			ambientMusiqueChannel = new SoundChannel();
			ambientMusique.load(new URLRequest("./media/audio/musique_de_fond.mp3"));
		}

		public static function playMusic():void{
			ambientMusiqueChannel = ambientMusique.play(0, 1000);
			isPlay = true;
		}

		public static function toogleMusic():void{
			if(!isPlay){
				ambientMusiqueChannel = ambientMusique.play(0, 1000);
				isPlay = true;
			}else{
				ambientMusiqueChannel.stop();
				isPlay = false;
			}

		}

		public static function stopMusic():void{
			ambientMusiqueChannel.stop();
			isPlay = false;
		}

		public static function loadSprites():void{
			// create atlas
			var texture:Texture = Texture.fromBitmap(new ElementTexture() );
			var xml:XML = XML(new ElementXML());
			elementTextureAtlas = new TextureAtlas(texture, xml);

			texture= Texture.fromBitmap(new AtlasTexture() );
			xml = XML(new AtlasXml());
			uiTextureAtlas = new TextureAtlas(texture, xml);

			texture = Texture.fromBitmap(new GrosTexture() );
			xml= XML(new GrosXML());
			grosTextureAtlas= new TextureAtlas(texture, xml);

			texture = Texture.fromBitmap(new GrosBarbouilleTexture() );
			xml= XML(new GrosBarbouilleXML());
			grosBarbouilleTextureAtlas= new TextureAtlas(texture, xml);

			texture = Texture.fromBitmap(new TutoTexture() );
			xml= XML(new TutoXML());
			TutoTextureAtlas = new TextureAtlas(texture, xml);

		}

		public static function getAtlas():TextureAtlas{
			return uiTextureAtlas;
		}

		public static function getAtlasElement():TextureAtlas{
			return elementTextureAtlas;
		}

		public static function getAtlasGros():TextureAtlas{
			return grosTextureAtlas;
		}

		public static function getAtlasGrosBarbouille():TextureAtlas{
			return grosBarbouilleTextureAtlas;
		}

		public static function getAtlasTuto():TextureAtlas{
			return TutoTextureAtlas;
		}

	}
}
