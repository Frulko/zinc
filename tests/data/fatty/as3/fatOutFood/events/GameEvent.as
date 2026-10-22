/**
 * User: guillaume
 * Date: 27/02/13
 * Time: 16:00
 */
package fatOutFood.events {

	import starling.events.Event;

	public class GameEvent extends Event{
		public static const ON_LINE_DEAD:String = "on_line_dead";
		public static const ON_NEW_LINE:String = "on_new_line";
		public static const ON_FIRST_STEP:String = "on_first_step";
		public static const ON_DISTANCE_MIN:String = "on_distance_min";
		public static const ON_PAUSE:String = "on_string";
		public static const ON_DIE:String = "on_die";
		public static const NO_SHOT:String = "no_shot";



		public function GameEvent(type : String,  bubbles : Boolean = false, data : Object = null) {
			super(type, bubbles, data);
		}
	}
}
