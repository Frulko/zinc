// This mapper follows another: it takes the time, the setup and the show of the master, and runs its commands when they say.
import * as link from 'zinc:link';
import * as mapping from 'zinc:mapping';
import * as os from 'zinc:os';
import { RevisionStage, RevisionPhase, RevisionManifest, cleanPreparedRevisions } from './fleetRevision';
import { activateProject, currentProjectPath, projectEpoch } from './project';
import { projectFile } from './projectPaths';
import { SETUP_FILE } from '../constants';
import { showIdentity } from './cards';
import { runCommand } from './control';
import { currentFrameRate } from './device';
import { fleetNow, fleetState, followClock, runAt, setMasterName, setViewport } from './fleet';
import { copyMedia, copyState, stopCopying } from './fleetMedia';
import { MasterPhase, currentMaster, newMasterSession, transitionMaster } from './fleetSession';
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
    mapping.save(projectFile(SETUP_FILE));
  }
  if (showJson() !== show) replaceShow(show, true);
}

function takeCommand(message: any, isCurrent: () => boolean): void {
  const command = { address: message.address as string, numbers: message.numbers as number[], strings: message.strings as string[] };
  const at = message.at as number;
  if (at === 0) {
    runCommand(command);
    return;
  }
  if (at < fleetNow()) late++;
  runAt(at, () => { if (isCurrent()) runCommand(command); });
}

async function activateRevision(revision: RevisionStage, ticket: string, current: () => boolean, stopLive: () => void): Promise<void> {
  try {
    const path = await revision.verifiedPath(ticket, current);
    if (!current()) return;
    stopLive();
    activateProject(path);
    revision.status.problem = '';
  } catch (e) { revision.status.problem = `Activation failed: ${e}`; return; }
  try { cleanPreparedRevisions(revision.status.path); }
  catch (e) { revision.status.problem = `Project active; cleanup failed: ${e}`; }
}

/** One channel a paired peer opened: it leads this machine once it says so; an editor never does. */
export function listenForMaster(channel: link.Channel, name: string): void {
  myName = name;
  let timer: i32 = -1;
  let web: i32 = 0, token = '';
  let live = false;
  let liveGeneration: i32 = 0;
  let liveEpoch = projectEpoch();
  let liveRequest: i32 = 0;
  const session = newMasterSession();
  const revision = new RevisionStage();
  const isCurrent = (): boolean => currentMaster(session);
  const setLive = (enabled: boolean): void => {
    liveGeneration++;
    liveEpoch = projectEpoch();
    live = enabled;
    if (!live) { stopCopying(); followVideoTimes([]); }
  };
  const currentLive = (): boolean => {
    if (!isCurrent()) return false;
    if (live && liveEpoch !== projectEpoch()) setLive(false);
    return live;
  };
  const liveGuard = (): (() => boolean) => {
    const generation = liveGeneration;
    return (): boolean => currentLive() && generation === liveGeneration;
  };
  channel.onMessage((message: any) => {
    if (message.t === 'master') {
      if (session.phase !== MasterPhase.Waiting) return;
      transitionMaster(session, MasterPhase.Active);
      liveRequest = typeof message.liveRequest === 'number' ? message.liveRequest as i32 : 0;
      setLive(message.live === true);
      if (live) place(message.viewport as number[]);
      setMasterName(message.name as string);
      if (live && message.clockPort as i32 > 0) followClock(channel.peer.host, message.clockPort as i32, liveGuard());
      if (live && (mapping.toJson() !== message.mapping as string || showJson() !== message.show as string)) restoreSetup(message.mapping as string, message.show as string);
      web = message.web as i32;
      token = message.token as string;
      if (live) copyMedia(channel.peer.host, web, token, message.media as MediaFile[], session.epoch);
      if (timer < 0) timer = setInterval(() => {
        if (!isCurrent()) return;
        currentLive();
        const state = fleetState();
        channel.send({ t: 'status', live, liveRequest, fps: Math.round(currentFrameRate()), offsetMs: state.offsetMs, rttMs: state.rttMs, synced: state.synced, late, system: `${os.type()} ${os.arch()}`, output: JSON.parse(mapping.info()).pixels, media: copyState(), videoMs: videoErrorMs(), revision: { ...revision.status, activePath: currentProjectPath() } });
      }, STATUS_MS);
    } else if (!isCurrent()) return;
    else if (message.t === 'revision-prepare') {
      setLive(false);
      revision.prepare(channel.peer.host, web, message.manifest as RevisionManifest, isCurrent);
    } else if (message.t === 'revision-activate') {
      if (revision.status.phase !== RevisionPhase.Ready || message.ticket !== revision.status.ticket) {
        channel.send({ t: 'revision-activated', ticket: message.ticket, revision: { ...revision.status, activePath: currentProjectPath(), problem: 'No matching prepared revision to activate' } });
        return;
      }
      setLive(false);
      const ticket = message.ticket as string;
      activateRevision(revision, ticket, isCurrent, () => { setLive(false); }).then(() => {
        if (isCurrent()) channel.send({ t: 'revision-activated', ticket, revision: { ...revision.status, activePath: currentProjectPath() } });
      });
    } else if (message.t === 'revision-cancel') revision.cancel();
    else if (message.t === 'live') {
      if (revision.status.phase === RevisionPhase.Verifying || revision.status.phase === RevisionPhase.Cancelling) return;
      liveRequest = typeof message.request === 'number' ? message.request as i32 : liveRequest;
      setLive(message.enabled === true);
      if (live && message.clockPort as i32 > 0) followClock(channel.peer.host, message.clockPort as i32, liveGuard());
    }
    else if (message.t === 'identify') showIdentity(myName);
    else if (!currentLive()) return;
    else if (message.t === 'state') takeState(message.mapping as string, message.show as string);
    else if (message.t === 'cmd') takeCommand(message, liveGuard());
    else if (message.t === 'media') copyMedia(channel.peer.host, web, token, message.files as MediaFile[], session.epoch);
    else if (message.t === 'videos') followVideoTimes(message.times as VideoTime[]);
    else if (message.t === 'viewport') place(message.viewport as number[]);
    else if (message.t === 'identify') showIdentity(myName);
  });
  channel.onClose((why: string) => {
    if (timer >= 0) clearInterval(timer);
    timer = -1;
    const wasCurrent = isCurrent();
    if (session.phase === MasterPhase.Closed) return;
    transitionMaster(session, MasterPhase.Closed);
    revision.cancel();
    if (!wasCurrent) return;
    setMasterName('');   // the picture goes on, on the last time and show it had
    if (web !== 0) {
      stopCopying();
      followVideoTimes([]);
    }
  });
}
