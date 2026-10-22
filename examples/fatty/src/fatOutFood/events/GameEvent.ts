/**
 * User: guillaume
 * Date: 27/02/13
 * Time: 16:00
 */

import { Event } from '../../compat/starling';

export class GameEvent extends Event{
		public static readonly ON_LINE_DEAD:string = "on_line_dead";
		public static readonly ON_NEW_LINE:string = "on_new_line";
		public static readonly ON_FIRST_STEP:string = "on_first_step";
		public static readonly ON_DISTANCE_MIN:string = "on_distance_min";
		public static readonly ON_PAUSE:string = "on_string";
		public static readonly ON_DIE:string = "on_die";
		public static readonly NO_SHOT:string = "no_shot";



		public constructor(type : string,  bubbles : boolean = false, data : unknown = null) {
			super(type, bubbles, data);
		}
	}
