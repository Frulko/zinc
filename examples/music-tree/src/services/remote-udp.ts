// ============================================================================
// services/remote-udp.ts — UDP network commands on port 7777
// ============================================================================
// Lets a physical button (ESP32 on Wi-Fi) or a phone send
// simple text commands: `toggle`, `play`, `pause`, `next`, `prev`,
// `vol+`, `vol-`, `radio <n>`, `wake`.

import { udp } from 'zinc:socket';
import { utf8Decode } from 'zinc:sys';
import { REMOTE_UDP_PORT } from '../constants';
import { uiState } from '../core/input';
import {
  appState,
  togglePlayPause,
  executeGroupCommand,
  nudgeActiveGroupVolume,
  playRadioStation,
} from '../state';

export async function startRemoteUdpListener(): Promise<void> {
  try {
    const socket = await udp(REMOTE_UDP_PORT);
    socket.onMessage((packet) => {
      const command = utf8Decode(packet.bytes).trim().toLowerCase();
      if (command === 'toggle') {
        togglePlayPause();
      } else if (command === 'play') {
        executeGroupCommand('Lecture', (system, group) => system.play(group));
      } else if (command === 'pause') {
        executeGroupCommand('Pause', (system, group) => system.pause(group));
      } else if (command === 'next') {
        executeGroupCommand('Suivant', (system, group) => system.next(group));
      } else if (command === 'prev') {
        executeGroupCommand('Précédent', (system, group) => system.previous(group));
      } else if (command === 'vol+') {
        nudgeActiveGroupVolume(3);
      } else if (command === 'vol-') {
        nudgeActiveGroupVolume(-3);
      } else if (command.startsWith('radio ')) {
        const stationNumber = (parseInt(command.slice(6)) as i32) - 1;
        if (stationNumber >= 0 && stationNumber < appState.myStations.length) {
          playRadioStation(appState.myStations[stationNumber]);
        }
      } else if (command === 'wake') {
        appState.screenPower.onUserTouch();
      }
      uiState.dirty = true;
    });
  } catch (error) {
    console.error(`music: UDP ${REMOTE_UDP_PORT}: ${error.message}`);
  }
}
