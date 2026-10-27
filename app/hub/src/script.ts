// ZINC_HUB_SCRIPT (tests): steps separated by ';' that call the same actions as the buttons, after the check at start, then quit.
//   server <url> | pair <code> | refresh | install <id> | update <id> | rollback <id> | channel <id> <stable|beta> | page apps|running|info|settings | engine | stop <app name>
//   page store | store all|installed | pin <id> (toggles) | reset <id> (twice, as uninstall)
//   uninstall <id> (twice: the first arms it) | clean | allow | cancel (the consent screen) | widget (draws the widget alone)
import * as sys from 'zinc:sys';
import { quit } from 'zinc:gfx';
import { saveServer, pairWith, refresh, installApp, updateAll, allowConsent, cancelConsent, setWidgetPreview, uninstallApp, cleanAppLoad, toggleHeader, rollbackApp, openApp, setChannel, setPage, updateEngine, runningApps, stopRunning, refreshRunning, refreshInfo, togglePin, resetApp, setStoreTab, STORE_ALL, STORE_INSTALLED, PAGE_STORE, PAGE_INFO, PAGE_APPS, PAGE_SETTINGS, PAGE_RUNNING } from './state';

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
    else if (verb === 'engine') await updateEngine();
    else if (verb === 'updateall') await updateAll();
    else if (verb === 'uninstall') await uninstallApp(arg);
    else if (verb === 'clean') await cleanAppLoad();
    else if (verb === 'header') toggleHeader();
    else if (verb === 'allow') await allowConsent();
    else if (verb === 'widget') { refreshRunning(); setWidgetPreview(true); }
    else if (verb === 'cancel') cancelConsent();
    else if (verb === 'open') openApp(arg);
    else if (verb === 'channel') setChannel(arg, w.length > 2 ? w[2] : 'stable');
    else if (verb === 'page' && arg === 'info') { setPage(PAGE_INFO); await refreshInfo(); }
    else if (verb === 'page') { refreshRunning(); setPage(arg === 'settings' ? PAGE_SETTINGS : arg === 'running' ? PAGE_RUNNING : arg === 'store' ? PAGE_STORE : PAGE_APPS); }
    else if (verb === 'store') { setPage(PAGE_STORE); setStoreTab(arg === 'installed' ? STORE_INSTALLED : STORE_ALL); }
    else if (verb === 'pin') togglePin(arg);
    else if (verb === 'reset') await resetApp(arg);
    else if (verb === 'stop') { for (const a of runningApps()) if (a.name === arg) await stopRunning(a.pid); }
    else if (verb !== '') console.log('hub: unknown script step ' + verb);
  }
  setTimeout(() => { quit(); }, 200);   // a few frames for the last state (ZINC_SHOT, ZINC_SCENE_DUMP)
}
