/**
 * User: guillaume
 * Date: 28/02/13
 * Time: 16:52
 */

import { Assets } from './assets/Assets';
import { Sprite, TextField } from '../compat/starling';

export class Test extends Sprite{

		public constructor() {
			super();
			console.log('OK');

			console.log(Assets.getFont().name);

			Assets.loadFont();
			let _scoreDisplay:TextField = new TextField(200, 150, "HELLO", "Cubano", 64);
			_scoreDisplay.x = 100;
			_scoreDisplay.y = 0;

			this.addChild(_scoreDisplay);
		}
	}
