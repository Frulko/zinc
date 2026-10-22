/**
 * User: guillaume
 * Date: 26/02/13
 * Time: 20:35
 */
package fatOutFood.events {

	import starling.events.Event;

	public class PageEvent extends Event {

		public static const CHANGE_SCREEN:String = "changeScreen";
		public static const HIDDEN:String = "hide";
		public static const SHOWN:String = "show";

		public var score : int;
		public var page : String;


		public function PageEvent(type : String,  bubbles : Boolean = false, data : Object = null) {
			super(type, bubbles, data);
		}



	}
}
