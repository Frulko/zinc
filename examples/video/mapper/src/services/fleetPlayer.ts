// This mapper follows another: it takes the time, the setup and the show of the master, and runs its commands when they say.
import * as link from 'zinc:link';
import * as mapping from 'zinc:mapping';
import * as os from 'zinc:os';
import { SETUP_FILE } from '../constants';
import { showIdentity } from './cards';
import { runCommand } from './control';
import { currentFrameRate } from './device';
import { fleetNow, fleetState, followClock, runAt, setMasterName, setViewport } from './fleet';
import { copyMedia, copyState, stopCopying } from './fleetMedia';
import { followLayerMedia, followVideoTimes, videoErrorMs, VideoTime } from './layerMedia';
import { MediaFile } from './mediaStore';
import { restoreSetup } from './scenes';
import { replaceShow, showJson } from './show';

const STATUS_MS = 1000;

let myName = '';
let late: i32 = 0;   // commands that came after their moment: the look-ahead is too short for this network

function place(viewport: number[]): void { setViewport(viewport[0], viewport[1], viewport[2], viewport[3]); }

function takeState(setup: string, show: string): void {
  if (mapping.toJson() !== setup) {
    mapping.fromJson(setup);
    followLayerMedia();
    mapping.save(SETUP_FILE);
  }
  if (showJson() !== show) replaceShow(show, true);
}

function takeCommand(message: any): void {
  const command = { address: message.address as string, numbers: message.numbers as number[], strings: message.strings as string[] };
  const at = message.at as number;
  if (at === 0) {
    runCommand(command);
    return;
  }
  if (at < fleetNow()) late++;
  runAt(at, () => { runCommand(command); });
}

/** One channel a paired peer opened: it leads this machine once it says so; an editor never does. */
export function listenForMaster(channel: link.Channel, name: string): void {
  myName = name;
  let timer: i32 = -1;
  let web: i32 = 0, token = '';
  channel.onMessage((message: any) => {
    if (message.t === 'master') {
      place(message.viewport as number[]);
      setMasterName(message.name as string);
      if (message.clockPort as i32 > 0) followClock(channel.peer.host, message.clockPort as i32);
      if (mapping.toJson() !== message.mapping as string || showJson() !== message.show as string) restoreSetup(message.mapping as string, message.show as string);
      web = message.web as i32;
      token = message.token as string;
      copyMedia(channel.peer.host, web, token, message.media as MediaFile[]);
      if (timer < 0) timer = setInterval(() => {
        const state = fleetState();
        channel.send({ t: 'status', fps: Math.round(currentFrameRate()), offsetMs: state.offsetMs, rttMs: state.rttMs, synced: state.synced, late, system: `${os.type()} ${os.arch()}`, output: JSON.parse(mapping.info()).pixels, media: copyState(), videoMs: videoErrorMs() });
      }, STATUS_MS);
    } else if (message.t === 'state') takeState(message.mapping as string, message.show as string);
    else if (message.t === 'cmd') takeCommand(message);
    else if (message.t === 'media') copyMedia(channel.peer.host, web, token, message.files as MediaFile[]);
    else if (message.t === 'videos') followVideoTimes(message.times as VideoTime[]);
    else if (message.t === 'viewport') place(message.viewport as number[]);
    else if (message.t === 'identify') showIdentity(myName);
  });
  channel.onClose((why: string) => {
    if (timer >= 0) clearInterval(timer);
    timer = -1;
    setMasterName('');   // the picture goes on, on the last time and show it had
    if (web !== 0) {
      stopCopying();
      followVideoTimes([]);
    }
  });
}
