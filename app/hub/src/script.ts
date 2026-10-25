// ZINC_HUB_SCRIPT (tests): steps separated by ';' that call the same actions as the buttons, after the check at start, then quit.
//   server <url> | pair <code> | refresh | install <id> | update <id> | rollback <id> | channel <id> <stable|beta> | page apps|settings
import * as sys from 'zinc:sys';
import { quit } from 'zinc:gfx';
import { saveServer, pairWith, refresh, installApp, rollbackApp, setChannel, setPage, PAGE_APPS, PAGE_SETTINGS } from './state';

export function scripted(): boolean { return sys.env('ZINC_HUB_SCRIPT') !== ''; }

export async function runScript(): Promise<void> {
  for (const step of sys.env('ZINC_HUB_SCRIPT').split(';')) {
    const w = step.trim().split(' ');
    const verb = w[0], arg = w.length > 1 ? w[1] : '';
    if (verb === 'server') saveServer(arg);
    else if (verb === 'pair') await pairWith(arg);
    else if (verb === 'refresh') await refresh();
    else if (verb === 'install' || verb === 'update') await installApp(arg);
    else if (verb === 'rollback') await rollbackApp(arg);
    else if (verb === 'channel') setChannel(arg, w.length > 2 ? w[2] : 'stable');
    else if (verb === 'page') setPage(arg === 'settings' ? PAGE_SETTINGS : PAGE_APPS);
    else if (verb !== '') console.log('hub: unknown script step ' + verb);
  }
  setTimeout(() => { quit(); }, 200);   // a few frames for the last state (ZINC_SHOT, ZINC_SCENE_DUMP)
}
