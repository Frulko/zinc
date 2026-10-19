// ============================================================================
// services/spotify-on-sonos.ts — Spotify played on the chosen speakers
// ============================================================================
// Playing an item: through Spotify Connect when Spotify may command the
// speakers, else through the speakers' own Spotify service (a queue the Sonos
// app could have made). "Reprendre ici": the account plays on another device
// (a Mac, an iPhone, the speakers of another house); one touch moves it to the
// group chosen here, at the same song and moment. A song's menu adds it to the
// speakers' queue or plays its radio (a song's or an artist's). And the
// speakers' queue of Spotify songs goes on like Spotify does: on its last song,
// Spotify's radio of that song is added after it.

import { System, Group, serviceId, accountOf, playSpotify as playSpotifyOnSonos, queueSpotify } from 'zinc:sonos';
import { Item, Playback } from 'zinc:spotify';
import { uiState } from '../core/input';
import { saveAppConfig } from './config';
import {
  appState,
  isOurSpeakers,
  logErrorToFile,
  navigateToHomePlayer,
  pollActiveSonosGroup,
  pollSpotifyPlaybackState,
  runSafeNetworkAction,
  showToast,
  sleepMilliseconds,
} from '../state';

/** The song whose "Reprendre ici" card was closed (or just moved here): the card does not come back for it. */
let dismissedHandoffSongUri = '';

export function playSpotifyItem(item: Item): void {
  if (appState.sonosSystem === null || appState.activeGroup === null) {
    showToast('Aucune enceinte');
    return;
  }
  const group = appState.activeGroup as Group;
  const system = appState.sonosSystem as System;
  showToast(`${item.name}…`);

  runSafeNetworkAction('Spotify', async (): Promise<void> => {
    const client = appState.spotifyClient;
    if (appState.spotifyUserName === '') {
      appState.spotifyUserName = await client.me();
    }
    const connectDevice = await client.device(group.coordinator.name);
    const isSongInList =
      (item.kind === 'track' || item.kind === 'episode') && item.context !== '' && !item.context.startsWith('spotify:artist:');
    if (connectDevice !== null && !connectDevice.restricted) {
      await client.play(item, connectDevice.id);
    } else if (isSongInList) {
      // a song inside its album or playlist, from its start: the next songs follow
      const fromStart = new Playback();
      fromStart.item = item;
      fromStart.context = item.context;
      await resumeThroughSonos(system, group, fromStart);
    } else {
      await playThroughSonosService(system, group, item);
    }
    showToast(`${item.name} sur ${group.name()}`);
    navigateToHomePlayer();
    await sleepMilliseconds(800);
    await pollActiveSonosGroup();
    await pollSpotifyPlaybackState();
  });
}

async function findSpotifyServiceId(system: System): Promise<i32> {
  if (appState.spotifyServiceIdOnSonos < 0) {
    appState.spotifyServiceIdOnSonos = await serviceId(system, 'Spotify');
  }
  return appState.spotifyServiceIdOnSonos;
}

/** The account number of Spotify in the household, as last found to work (1, the first account, until then). */
function knownSpotifyAccountSerial(): i32 {
  return appState.config.spotifyAccountSerial > 0 ? appState.config.spotifyAccountSerial : 1;
}

/** Plays an item through the speakers' Spotify service, trying the household's account numbers until the group plays. */
async function playThroughSonosService(system: System, group: Group, item: Item): Promise<void> {
  const spotifyServiceId = await findSpotifyServiceId(system);
  if (spotifyServiceId < 0) {
    throw new Error("le service Spotify n'est pas disponible sur ces enceintes");
  }

  const targetUri =
    item.kind === 'liked' ? `spotify:user:${appState.spotifyClient.userId}:collection` : item.uri;

  const candidateSerialNumbers: i32[] = [];
  if (appState.config.spotifyAccountSerial > 0) {
    candidateSerialNumbers.push(appState.config.spotifyAccountSerial);
  }
  const favoriteAccountSerial = await accountOf(system, spotifyServiceId);
  if (favoriteAccountSerial > 0 && candidateSerialNumbers.indexOf(favoriteAccountSerial) < 0) {
    candidateSerialNumbers.push(favoriteAccountSerial);
  }
  for (let serial: i32 = 1; serial <= 4; serial++) {
    if (candidateSerialNumbers.indexOf(serial) < 0) {
      candidateSerialNumbers.push(serial);
    }
  }

  let lastErrorMessage = '';
  for (let index = 0; index < candidateSerialNumbers.length; index++) {
    const serialNumber = candidateSerialNumbers[index];
    try {
      await playSpotifyOnSonos(system, group, targetUri, item.name, spotifyServiceId, serialNumber);
      await sleepMilliseconds(2500);
      await system.update(group);
      if (group.playing()) {
        if (appState.config.spotifyAccountSerial !== serialNumber) {
          appState.config.spotifyAccountSerial = serialNumber;
          saveAppConfig(appState.config);
        }
        return;
      }
    } catch (error) {
      lastErrorMessage = error.message;
    }
  }
  throw new Error(
    `les Sonos n'ont pas pu lire « ${item.name} »${
      lastErrorMessage !== '' ? ' (' + lastErrorMessage + ')' : ''
    }. Dans l'app Sonos, ajoute Spotify aux services (Réglages, Services et voix) et une playlist Spotify aux favoris, puis réessaie.`
  );
}

/**
 * Adds a song (or an album, a playlist) to the speakers' queue: after the song that plays (`next`) or at its end. The queue is the
 * speakers' own: a Spotify Connect session a phone left on them goes into it first (the same song and second), else the song would be
 * added to a queue nobody listens to; with nothing playing, the song just plays.
 */
export function queueOnSpeakers(item: Item, next: boolean): void {
  if (appState.sonosSystem === null || appState.activeGroup === null) {
    showToast('Aucune enceinte');
    return;
  }
  const group = appState.activeGroup as Group;
  const system = appState.sonosSystem as System;
  runSafeNetworkAction(next ? 'Lire ensuite' : "File d'attente", async (): Promise<void> => {
    const spotifyServiceId = await findSpotifyServiceId(system);
    await system.update(group);
    if (group.track.number === 0) {
      const playback = appState.spotifyPlayback;
      if (group.track.source !== 'spotify' || !playback.active || !isOurSpeakers(playback.device.name)) {
        playSpotifyItem(item);
        return;
      }
      showToast('La lecture passe dans la file des enceintes…');
      await resumeThroughSonos(system, group, await appState.spotifyClient.playback());
      await system.update(group);
    }
    await queueSpotify(system, group, item.uri, item.name, spotifyServiceId, knownSpotifyAccountSerial(), next);
    showToast(next ? `${item.name} : à la suite` : `${item.name} : ajouté à la file`);
    await pollActiveSonosGroup();
  });
}

/** Spotify's radio of a song or an artist on the group (the songs Spotify picks after it), through the speakers' Spotify service. */
export function playSpotifyRadio(item: Item): void {
  if (appState.sonosSystem === null || appState.activeGroup === null) {
    showToast('Aucune enceinte');
    return;
  }
  const group = appState.activeGroup as Group;
  const system = appState.sonosSystem as System;
  const radio = new Item();
  radio.kind = 'playlist';
  radio.name = item.name;
  radio.uri = (item.kind === 'artist' ? 'spotify:artistRadio:' : 'spotify:trackRadio:') + (item.uri.split(':').pop() as string);
  showToast(`Radio : ${item.name}…`);
  runSafeNetworkAction('Radio', async (): Promise<void> => {
    await playThroughSonosService(system, group, radio);
    showToast(`Radio de ${item.name} sur ${group.name()}`);
    await sleepMilliseconds(800);
    await pollActiveSonosGroup();
  });
}

// ----------------------------------------------------------------------------
// "Reprendre ici"
// ----------------------------------------------------------------------------

/** The account plays on a device that is not speakers of this house, and its card was not closed. */
export function playsElsewhere(): boolean {
  const playback = appState.spotifyPlayback;
  if (
    !appState.spotifyClient.ready() ||
    !playback.active ||
    !playback.playing ||
    playback.item.uri === '' ||
    playback.item.uri === dismissedHandoffSongUri ||
    appState.sonosSystem === null
  ) {
    return false;
  }
  return !isOurSpeakers(playback.device.name);
}

export function dismissHandoffCard(): void {
  dismissedHandoffSongUri = appState.spotifyPlayback.item.uri;
  uiState.dirty = true;
}

/** Moves the account's listening to the group chosen here, at the same song and moment; the other device is paused. */
export function resumeHere(): void {
  if (appState.sonosSystem === null || appState.activeGroup === null) {
    showToast('Aucune enceinte');
    return;
  }
  const group = appState.activeGroup as Group;
  const system = appState.sonosSystem as System;
  showToast(`Reprise sur ${group.name()}…`);

  runSafeNetworkAction('Reprendre', async (): Promise<void> => {
    const client = appState.spotifyClient;
    const playback = await client.playback(); // now: the song may have moved on since the last look
    if (!playback.active || playback.item.uri === '') throw new Error('plus rien ne joue sur Spotify');
    const connectDevice = await client.device(group.coordinator.name);
    if (connectDevice !== null && !connectDevice.restricted) {
      await client.transfer(connectDevice.id, true); // Spotify Connect: the queue moves along
    } else {
      await resumeThroughSonos(system, group, playback);
      if (playback.device.id !== '' && !playback.device.restricted) {
        try {
          await client.pause(playback.device.id);
        } catch (error) {
          /* it may have stopped by itself */
        }
      }
    }
    dismissedHandoffSongUri = playback.item.uri;
    showToast(`${playback.item.name} sur ${group.name()}`);
    await sleepMilliseconds(800);
    await pollActiveSonosGroup();
    await pollSpotifyPlaybackState();
  });
}

/**
 * A playback continued through the speakers' Spotify service: its album or playlist, the song found in the queue the speakers made
 * of it, then the moment in the song. A context the speakers cannot read (some of Spotify's playlists) gives Spotify's radio of the
 * song instead: the song first, then songs like it, as Spotify goes on after a list.
 */
async function resumeThroughSonos(system: System, group: Group, playback: Playback): Promise<void> {
  const startedAtSeconds = Date.now() / 1000;
  const songId = playback.item.uri.split(':').pop() as string;
  let queuePosition: i32 = 0;
  if (playback.context !== '') {
    const contextItem = new Item();
    contextItem.kind = 'playlist';
    contextItem.uri = playback.context;
    contextItem.name = playback.item.name;
    try {
      await playThroughSonosService(system, group, contextItem);
      queuePosition = await system.queueIndex(group, songId);
    } catch (error) {
      queuePosition = 0;
    }
  }
  if (queuePosition > 1) {
    await system.seekTrack(group, queuePosition);
  } else if (queuePosition === 0) {
    const songRadio = new Item();
    songRadio.kind = 'playlist';
    songRadio.uri = 'spotify:trackRadio:' + songId;
    songRadio.name = playback.item.name;
    await playThroughSonosService(system, group, songRadio);
  }
  const elapsedSeconds = playback.playing ? Date.now() / 1000 - startedAtSeconds : 0;
  const songSeconds = playback.progressMs / 1000 + elapsedSeconds; // where the song is by now
  if (songSeconds > 3 && (playback.durationMs <= 0 || songSeconds < playback.durationMs / 1000 - 3)) {
    await system.seek(group, songSeconds);
  }
  if (playback.shuffle && queuePosition > 0) {
    await system.setPlayMode(group, 'SHUFFLE_NOREPEAT'); // Spotify played the list in shuffle: the speakers go on so
  }
}

// ----------------------------------------------------------------------------
// The queue goes on with Spotify's song radio
// ----------------------------------------------------------------------------

const SPOTIFY_TRACK_IN_QUEUE_URI = 'spotify%3atrack%3a';
/** The URI of the last song the queue was extended after (once per song). */
let queueExtendedAfterUri = '';

/**
 * Each frame: when the chosen group plays the last Spotify song of its queue, Spotify's radio of that song is added after it (its
 * first entry, the song again, taken out). Spotify's own autoplay belongs to a Connect session the Web API cannot give the speakers.
 */
export function tickQueueContinuation(): void {
  if (appState.sonosSystem === null || appState.activeGroup === null) return;
  const group = appState.activeGroup as Group;
  const track = group.track;
  if (track.count === 0 || track.number !== track.count || track.uri === queueExtendedAfterUri || !group.playing()) return;
  const idStart = track.uri.indexOf(SPOTIFY_TRACK_IN_QUEUE_URI);
  if (idStart < 0) return;
  queueExtendedAfterUri = track.uri;
  const songId = track.uri.slice(idStart + SPOTIFY_TRACK_IN_QUEUE_URI.length).split('?')[0].split('%')[0];
  if (songId !== '') extendQueueWithSongRadio(appState.sonosSystem as System, group, songId, track.title, track.count);
}

async function extendQueueWithSongRadio(system: System, group: Group, songId: string, title: string, lastNumber: i32): Promise<void> {
  try {
    const spotifyServiceId = await findSpotifyServiceId(system); // a queue the Sonos app made
    await queueSpotify(system, group, 'spotify:trackRadio:' + songId, title, spotifyServiceId, knownSpotifyAccountSerial());
    if ((await system.queueEntry(group, lastNumber + 1)).indexOf(songId) >= 0) {
      await system.removeFromQueue(group, lastNumber + 1);
    }
  } catch (error) {
    logErrorToFile(`go on after ${title}: ${error.message}`); // the queue simply ends
  }
}
