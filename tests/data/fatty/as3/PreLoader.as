package {

import flash.display.Sprite;
import flash.text.TextField;

public class PreLoader extends Sprite {
    public function PreLoader() {
        var textField:TextField = new TextField();
        textField.text = "Hello, World";
        addChild(textField);
    }
}
}
