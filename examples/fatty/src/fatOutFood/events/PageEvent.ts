/**
 * User: guillaume
 * Date: 26/02/13
 * Time: 20:35
 */

import { Event } from '../../compat/starling';

export class PageEvent extends Event {

		public static readonly CHANGE_SCREEN:string = "changeScreen";
		public static readonly HIDDEN:string = "hide";
		public static readonly SHOWN:string = "show";

		public score : number = 0;
		public page : string = '';


		public constructor(type : string,  bubbles : boolean = false, data : unknown = null) {
			super(type, bubbles, data);
		}



	}
