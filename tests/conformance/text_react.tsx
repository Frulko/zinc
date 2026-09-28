// TST-07: the `text` screen laid out by the React model (must equal text_solid.out).
import * as ui from 'zinc:ui';
import { _rc } from 'zinc:ui/react';
import { Screen } from '../../examples/text/src/react';
const root = ui.createNode(ui.VIEW);
const host = ui.createNode(ui.FRAGMENT);
ui.insert(root, host, -1);
_rc(host, Screen);
ui.setRoot(root);
console.log(ui.dump().replace('\n  fragment 0,0 0x0', '').split('\n    ').join('\n  '));
