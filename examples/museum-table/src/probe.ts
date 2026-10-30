// Explicit diagnostic endpoint; the existing CDP transport restricts listening, Host and Origin to local tools.
import Cdp from 'zinc:devtools/cdp';   // the inspector's channel: the probe answers on it
import { pid } from 'zinc:sys';
import { Player } from './player';
import { retainedDecoders } from './film';

export function startProbe(player: Player): void {
  Cdp.listen(9229, (client: i32, msg: string): void => {
    const id = Cdp.num(msg, 'id'), method = Cdp.str(msg, 'method');
    let result = '', error = '';
    if (method === 'Museum.getState') result = `{"pid":${pid()},"sequence":${JSON.stringify(player.sequence)},"transitioning":${player.transitioning},"fault":${JSON.stringify(player.fault)},"retainedModels":${player.retainedModels},"retainedPanoramas":${player.retainedPanoramas},"retainedDecoders":${retainedDecoders()}}`;
    else if (method === 'Museum.navigate') {
      if (player.visit(Cdp.str(msg, 'sequence'))) result = '{"accepted":true}';
      else error = 'Unknown sequence, player not ready or transition in progress';
    } else if (method === 'Zinc.getResourceStats') result = Cdp.resourceStats();
    else if (method === 'Page.captureScreenshot') result = `{"data":${JSON.stringify(Cdp.screenshot(0, 0))}}`;
    else error = 'Unknown diagnostic method';
    Cdp.send(client, error.length > 0 ? `{"id":${id},"error":{"code":-32602,"message":${JSON.stringify(error)}}}` : `{"id":${id},"result":${result}}`);
  });
}
