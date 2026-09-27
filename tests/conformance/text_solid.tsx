// TST-07: the `text` screen laid out by the Solid model (must equal text_react.out).
import * as ui from 'zinc:ui';
import { Screen } from '../../examples/text/solid';
const root = ui.createNode(ui.VIEW);
ui.insert(root, Screen(), -1);
ui.setRoot(root);
console.log(ui.dump());
