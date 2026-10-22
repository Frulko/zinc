

import { Sprite, TextField } from './compat/starling';


export class Gobelins extends Sprite {
    constructor() {
        super();
        let textField:TextField = new TextField(200,30);
        textField.text = "Hello, World";
        this.addChild(textField);
    }
}
