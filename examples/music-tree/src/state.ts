// ============================================================================
// state.ts — État central de l'application et actions métier (Sonos, Spotify, Radios)
// ============================================================================
// Ce module rassemble l'état partagé par tous les nœuds de l'arbre d'affichage
// (pages, barre latérale, barre d'état, popovers) ainsi que les commandes
// réseau associées. Les pages lisent `appState` et appellent ces fonctions
// aux noms explicites sans dupliquer la logique métier.

import { exists, appendText, stat } from 'zinc:fs';
import { discover, System, Group, Speaker, serviceId, accountOf, playSpotify as sonosSpotify } from 'zinc:sonos';
import { Spotify, Item, Playback } from 'zinc:spotify';
import { openPort } from 'zinc:webos';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Timeline } from 'gsap';
import {
  PAGE_NOW_PLAYING,
  PAGE_RADIOS,
  PAGE_SPOTIFY,
  PAGE_ROOMS,
  PAGE_SETTINGS,
  SLIDE_PLAYER,
  SLIDE_COUNT,
  CLOCK_FACE_COUNT,
  SSDP_PORT,
  REMOTE_UDP_PORT,
  SPOTIFY_PAGE_SIZE,
  SIDEBAR_WIDTH_DEFAULT,
} from './constants';
import { ScrollBox, uiState } from './core/input';
import { ScreenPowerManager } from './core/screen-power';
import { AppConfig, loadAppConfig, saveAppConfig } from './services/config';
import {
  RadioStation,
  loadMyRadioStations,
  saveMyRadioStations,
  findStationIndexByUrl,
  searchRadioDirectory,
} from './services/radios-service';
import { triggerPlaceSearch } from './services/weather-service';
import { MacNotification, showTrackNotification } from './services/notify-service';
import { getLavaLampPaletteIndex, setLavaLampPaletteIndex } from './pages/home/clock-faces';

// Sur webOS, les ports UDP doivent être ouverts explicitement via zinc-helper
openPort(SSDP_PORT);
openPort(REMOTE_UDP_PORT);

const ERROR_LOG_FILE_PATH = '/tmp/music.log';

/**
 * File d'envoi "la dernière valeur gagne" : lorsqu'un curseur de volume est
 * déplacé rapidement, seule la position la plus récente est envoyée sur le réseau
 * dès que la requête précédente se termine.
 */
class LatestRequestQueue {
  isBusy: boolean = false;
  pendingTask: (() => Promise<void>) | null = null;

  enqueue(task: () => Promise<void>): void {
    this.pendingTask = task;
    this.processQueue();
  }

  async processQueue(): Promise<void> {
    if (this.isBusy) return;
    this.isBusy = true;
    while (this.pendingTask !== null) {
      const nextTask = this.pendingTask as () => Promise<void>;
      this.pendingTask = null;
      try {
        await nextTask();
      } catch (error) {
        showToast(`Volume : ${error.message}`);
      }
    }
    this.isBusy = false;
  }
}

export const volumeRequestQueue = new LatestRequestQueue();

/**
 * Conteneur unique de tout l'état réactif de l'application.
 */
export class ApplicationState {
  /** Configuration persistante (`config.json`). */
  config: AppConfig = loadAppConfig();

  /** Gestionnaire d'alimentation et de veille de l'écran. */
  screenPower: ScreenPowerManager;

  /** Page active dans la barre latérale (`PAGE_NOW_PLAYING`, `PAGE_RADIOS`, etc.). */
  currentPage: i32 = PAGE_NOW_PLAYING;

  /** Largeur actuelle de la barre latérale (0 en mode lecteur plein écran, 240 sinon). */
  sidebarWidth: number = SIDEBAR_WIDTH_DEFAULT;

  // ---- Carrousel de la page d'accueil (5 slides) ----
  targetSlideIndex: i32 = SLIDE_PLAYER;
  animatedSlideX: number = 0;
  isSettlingSlideX: boolean = false;
  settlingSlideTarget: i32 = 0;

  // ---- Cadrans de l'horloge StandBy (5 cadrans verticaux) ----
  targetClockFaceIndex: i32 = 0;
  animatedClockFaceY: number = 0;
  isSettlingFaceY: boolean = false;
  settlingFaceTarget: i32 = 0;

  // ---- État Sonos ----
  sonosSystem: System | null = null;
  activeGroup: Group | null = null;
  sonosStatusMessage: string = 'Recherche des enceintes…';
  isFindingSpeakers: boolean = false;
  isPollingGroup: boolean = false;
  consecutivePollFailures: i32 = 0;
  isPollingTopology: boolean = false;
  isPollingVolumes: boolean = false;

  /** Position temporelle interpolée du morceau en cours. */
  trackPositionBaseSeconds: number = 0;
  trackPositionTimestampSeconds: number = 0;
  elapsedAppClockSeconds: number = 0;

  // ---- État Spotify ----
  spotifyClient: Spotify = new Spotify('spotify.json');
  spotifyUserName: string = '';
  spotifyPlayback: Playback = new Playback();
  isCurrentTrackLiked: boolean = false;
  currentLikedTrackUri: string = '';
  isPollingSpotify: boolean = false;
  spotifyServiceIdOnSonos: i32 = -1;

  activeSpotifyTab: i32 = 0;
  spotifyTabLists: Item[][] = [[], [], [], [], []];
  spotifyTabStates: string[] = ['', '', '', '', ''];
  spotifyTabHasMore: boolean[] = [false, false, false, false, false];
  spotifyTabIsPaging: boolean[] = [false, false, false, false, false];

  // ---- État Radios ----
  myStations: RadioStation[] = loadMyRadioStations();
  popularStations: RadioStation[] = [];
  searchedStations: RadioStation[] = [];
  popularStationsState: string = '';
  searchedStationsState: string = '';
  activeRadioTab: i32 = 0;
  isEditingMyRadios: boolean = false;

  // ---- Recherche et clavier virtuel ----
  searchQuery: string = '';
  isKeyboardVisible: boolean = false;
  isSearchingWeatherCity: boolean = false;
  weatherCityQuery: string = '';

  // ---- Popovers, feuilles modales et bandeau toast ----
  toastMessage: string = '';
  toastRemainingSeconds: number = 0;

  isVolumePopoverOpen: boolean = false;
  volumePopoverRemainingSeconds: number = 0;
  volumeHoldCooldownSeconds: number = 0;
  volumeBarScreenX: number = 0;
  volumeBarScreenY: number = 0;

  isContextSheetOpen: boolean = false;
  wasAnyPopoverOpen: boolean = false;

  // ---- Batterie de l'appareil ----
  batteryLevelPercent: i32 = -1;
  isBatteryCharging: boolean = false;

  // ---- Conteneurs de défilement (un par page principale) ----
  pageScrollBoxes: ScrollBox[] = [
    new ScrollBox(),
    new ScrollBox(),
    new ScrollBox(),
    new ScrollBox(),
    new ScrollBox(),
  ];

  constructor() {
    this.screenPower = new ScreenPowerManager(this.config.sleepDelaySeconds);
    this.screenPower.glancesEnabled = this.config.clockGlancesEnabled;
  }
}

export const appState = new ApplicationState();

// Objets cibles animés par GSAP
export const carouselGsapTarget = { x: 0 };
export const clockFaceGsapTarget = { y: 0 };
export const popoverRiseGsapTarget = { y: 0 };
export const lavaHintGsapTarget = { a: 0, r: 14 };
export let lavaHintTimeline: Timeline | null = null;

export function setLavaHintTimeline(timeline: Timeline | null): void {
  lavaHintTimeline = timeline;
}

// ----------------------------------------------------------------------------
// Persistance du slide, du cadran d'horloge et de la palette de la lampe à lave
// ----------------------------------------------------------------------------

export function saveCarouselAndClockPreferences(): void {
  AsyncStorage.multiSet([
    ['music.slide', '' + appState.targetSlideIndex],
    ['music.face', '' + appState.targetClockFaceIndex],
    ['music.lamp', '' + getLavaLampPaletteIndex()],
  ]);
}

export async function restoreCarouselAndClockPreferences(): Promise<void> {
  const storedPairs = await AsyncStorage.multiGet(['music.slide', 'music.face', 'music.lamp']);
  if (storedPairs[2][1] !== null) {
    setLavaLampPaletteIndex(parseInt(storedPairs[2][1] as string) as i32);
  }
  if (storedPairs[0][1] !== null) {
    const restoredSlide = Math.max(
      0,
      Math.min(SLIDE_COUNT - 1, parseInt(storedPairs[0][1] as string))
    ) as i32;
    appState.targetSlideIndex = restoredSlide;
    appState.animatedSlideX = restoredSlide;
  }
  if (storedPairs[1][1] !== null) {
    const restoredFace = Math.max(
      0,
      Math.min(CLOCK_FACE_COUNT - 1, parseInt(storedPairs[1][1] as string))
    ) as i32;
    appState.targetClockFaceIndex = restoredFace;
    appState.animatedClockFaceY = restoredFace;
  }
  uiState.dirty = true;
}

// ----------------------------------------------------------------------------
// Fonctions utilitaires générales
// ----------------------------------------------------------------------------

export function formatPlural(count: i32, singularWord: string): string {
  return `${count} ${singularWord}${count > 1 ? 's' : ''}`;
}

export function showToast(message: string): void {
  appState.toastMessage = message;
  appState.toastRemainingSeconds = 3.5;
  uiState.dirty = true;
}

export function sleepMilliseconds(milliseconds: i32): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    setTimeout(() => resolve(true), milliseconds);
  });
}

export function getInterpolatedTrackPositionSeconds(): number {
  if (appState.activeGroup === null) return 0;
  const activeGroup = appState.activeGroup as Group;
  const track = activeGroup.track;
  const elapsedWhilePlaying = activeGroup.playing()
    ? appState.elapsedAppClockSeconds - appState.trackPositionTimestampSeconds
    : 0;
  const estimatedPosition = appState.trackPositionBaseSeconds + elapsedWhilePlaying;
  return track.duration > 0 ? Math.min(track.duration, estimatedPosition) : estimatedPosition;
}

export function logErrorToFile(message: string): void {
  try {
    if (exists(ERROR_LOG_FILE_PATH) && stat(ERROR_LOG_FILE_PATH).size > 200000) return;
    const nowDate = new Date();
    appendText(ERROR_LOG_FILE_PATH, `${nowDate.toISOString()} ${message}\n`);
  } catch (error) {
    /* espace disque saturé */
  }
}

export async function runSafeNetworkAction(
  actionName: string,
  operation: () => Promise<void>
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    showToast(`${actionName} : ${error.message}`);
    logErrorToFile(`${actionName}: ${error.message}`);
  }
  uiState.dirty = true;
}

// ----------------------------------------------------------------------------
// Navigation entre les pages et sélection de groupe
// ----------------------------------------------------------------------------

export function navigateToHomePlayer(): void {
  appState.currentPage = PAGE_NOW_PLAYING;
  appState.targetSlideIndex = SLIDE_PLAYER;
  appState.animatedSlideX = 0;
  saveCarouselAndClockPreferences();
  uiState.dirty = true;
}

export function navigateToPage(targetPageId: i32): void {
  appState.currentPage = targetPageId;
  appState.isKeyboardVisible = false;
  appState.isVolumePopoverOpen = false;
  appState.isContextSheetOpen = false;
  appState.isSearchingWeatherCity = false;

  if (targetPageId === PAGE_RADIOS && appState.activeRadioTab === 1) {
    loadPopularRadios();
  }
  if (targetPageId === PAGE_SPOTIFY) {
    loadSpotifyTab(appState.activeSpotifyTab, false);
  }
  if (targetPageId === PAGE_ROOMS) {
    pollAllRoomVolumes();
  }
  uiState.dirty = true;
}

export function getTrackSourceLabel(group: Group): string {
  const source = group.track.source;
  if (source === 'spotify') return 'SPOTIFY';
  if (source === 'radio') return 'RADIO';
  if (source === 'tv') return 'TÉLÉVISION';
  if (source === 'line-in') return 'ENTRÉE LIGNE';
  if (source === 'queue') return "FILE D'ATTENTE";
  if (source === 'airplay') return 'AIRPLAY';
  if (source === 'none') return '';
  return 'FLUX';
}

export function getGroupArtworkUrl(group: Group): string {
  if (group.track.art !== '') return group.track.art;
  for (let index = 0; index < appState.myStations.length; index++) {
    const station = appState.myStations[index];
    if (station.name === group.track.station) return station.artworkUrl;
  }
  return '';
}

export function isStationCurrentlyPlaying(station: RadioStation): boolean {
  if (appState.activeGroup === null) return false;
  const group = appState.activeGroup as Group;
  const urlWithoutScheme = station.streamUrl.slice(station.streamUrl.indexOf('://') + 3);
  return (
    group.track.source === 'radio' &&
    group.track.uri.indexOf(urlWithoutScheme) >= 0 &&
    group.playing()
  );
}

// ----------------------------------------------------------------------------
// Découverte et scrutation (polling) Sonos & Spotify
// ----------------------------------------------------------------------------

export function pickDefaultSonosGroup(): void {
  if (appState.sonosSystem === null) return;
  const system = appState.sonosSystem as System;
  let chosenGroup: Group | null = null;

  for (let index = 0; index < system.groups.length; index++) {
    const candidate = system.groups[index];
    if (candidate.coordinator.uuid === appState.config.selectedGroupUuid) {
      chosenGroup = candidate;
    }
  }
  if (chosenGroup === null && appState.config.selectedGroupUuid !== '') {
    const speaker = system.speaker(appState.config.selectedGroupUuid);
    if (speaker !== null) chosenGroup = system.groupOf(speaker);
  }
  if (chosenGroup === null) {
    for (let index = 0; index < system.groups.length; index++) {
      if (system.groups[index].playing()) chosenGroup = system.groups[index];
    }
  }
  if (chosenGroup === null && system.groups.length > 0) {
    chosenGroup = system.groups[0];
  }
  appState.activeGroup = chosenGroup;
}

export function selectActiveSonosGroup(group: Group): void {
  appState.activeGroup = group;
  appState.config.selectedGroupUuid = group.coordinator.uuid;
  saveAppConfig(appState.config);
  appState.trackPositionBaseSeconds = group.track.position;
  appState.trackPositionTimestampSeconds = appState.elapsedAppClockSeconds;
  pollActiveSonosGroup();
}

export async function discoverSonosSystem(): Promise<void> {
  if (appState.isFindingSpeakers) return;
  appState.isFindingSpeakers = true;
  appState.sonosStatusMessage = 'Recherche des enceintes…';
  uiState.dirty = true;

  try {
    const discoveredSystem = await discover(appState.config.sonosSeedIp, 2500, SSDP_PORT);
    appState.sonosSystem = discoveredSystem;
    if (appState.config.sonosSeedIp !== discoveredSystem.seed) {
      appState.config.sonosSeedIp = discoveredSystem.seed;
      saveAppConfig(appState.config);
    }
    pickDefaultSonosGroup();
    for (let index = 0; index < discoveredSystem.groups.length; index++) {
      try {
        await discoveredSystem.update(discoveredSystem.groups[index]);
      } catch (error) {
        /* enceinte endormie : sera lue au prochain cycle */
      }
    }
    if (appState.activeGroup !== null) {
      appState.trackPositionBaseSeconds = (appState.activeGroup as Group).track.position;
      appState.trackPositionTimestampSeconds = appState.elapsedAppClockSeconds;
    }
    appState.sonosStatusMessage = '';
  } catch (error) {
    appState.sonosStatusMessage = 'Aucune enceinte Sonos trouvée sur ce réseau';
    logErrorToFile(`find: ${error.message}`);
  }
  appState.isFindingSpeakers = false;
  uiState.dirty = true;
}

export async function pollActiveSonosGroup(): Promise<void> {
  if (appState.isPollingGroup || appState.sonosSystem === null || appState.activeGroup === null) {
    return;
  }
  appState.isPollingGroup = true;
  const group = appState.activeGroup as Group;
  const previousTrackSignature = group.track.uri + group.track.title;

  try {
    await (appState.sonosSystem as System).update(group);
    appState.consecutivePollFailures = 0;
    const currentSignature = group.track.uri + group.track.title;
    if (
      Math.abs(group.track.position - getInterpolatedTrackPositionSeconds()) > 2 ||
      previousTrackSignature !== currentSignature ||
      !group.playing()
    ) {
      appState.trackPositionBaseSeconds = group.track.position;
      appState.trackPositionTimestampSeconds = appState.elapsedAppClockSeconds;
    }
    if (
      previousTrackSignature !== currentSignature &&
      appState.screenPower.asleep &&
      group.playing() &&
      group.track.title !== '' &&
      appState.activeGroup === group
    ) {
      showNextTrackNotification(group);
    }
  } catch (error) {
    logErrorToFile(`poll ${group.coordinator.name}: ${error.message}`);
    appState.consecutivePollFailures++;
    if (appState.consecutivePollFailures >= 3) {
      appState.consecutivePollFailures = 0;
      appState.sonosSystem = null;
      discoverSonosSystem();
    }
  }
  appState.isPollingGroup = false;
  uiState.dirty = true;
}

/**
 * The next song while the screen sleeps: a notification in the manner of the Mac's (the cover, the title, the artist and the album);
 * the screen wakes for it and goes back to sleep. Awake, the player shows the song itself.
 */
function showNextTrackNotification(group: Group): void {
  const track = group.track;
  const notification = new MacNotification();
  notification.id = 'track/' + track.uri + '/' + track.title;
  notification.timestampSeconds = Date.now() / 1000;
  notification.title = track.title;
  notification.appName = group.name();
  notification.coverArtUrl = getGroupArtworkUrl(group);
  const byLine = track.artist !== '' ? track.artist : track.station;
  if (track.album !== '' && byLine !== '') {
    notification.subtitle = byLine;
    notification.body = track.album;
  } else {
    notification.body = byLine !== '' ? byLine : track.album;
  }
  showTrackNotification(notification);
}

export async function pollSonosTopology(): Promise<void> {
  if (appState.isPollingTopology || appState.sonosSystem === null) return;
  appState.isPollingTopology = true;
  try {
    const system = appState.sonosSystem as System;
    await system.refresh();
    const previousCoordinatorUuid =
      appState.activeGroup !== null ? (appState.activeGroup as Group).coordinator.uuid : '';
    appState.activeGroup = null;
    for (let index = 0; index < system.groups.length; index++) {
      if (system.groups[index].coordinator.uuid === previousCoordinatorUuid) {
        appState.activeGroup = system.groups[index];
      }
    }
    if (appState.activeGroup === null) {
      pickDefaultSonosGroup();
    }
  } catch (error) {
    /* géré par pollActiveSonosGroup */
  }
  appState.isPollingTopology = false;
  uiState.dirty = true;
}

export async function pollAllRoomVolumes(): Promise<void> {
  if (appState.isPollingVolumes || appState.sonosSystem === null) return;
  appState.isPollingVolumes = true;
  const system = appState.sonosSystem as System;
  for (let index = 0; index < system.groups.length; index++) {
    try {
      await system.readVolumes(system.groups[index]);
      if (system.groups[index] !== appState.activeGroup) {
        await system.update(system.groups[index]);
      }
    } catch (error) {
      /* prochain cycle */
    }
  }
  appState.isPollingVolumes = false;
  uiState.dirty = true;
}

export async function pollActiveGroupMemberVolumes(): Promise<void> {
  if (appState.isPollingVolumes || appState.sonosSystem === null || appState.activeGroup === null) {
    return;
  }
  appState.isPollingVolumes = true;
  try {
    await (appState.sonosSystem as System).readVolumes(appState.activeGroup as Group);
  } catch (error) {
    /* prochain cycle */
  }
  appState.isPollingVolumes = false;
  uiState.dirty = true;
}

export async function pollSpotifyPlaybackState(): Promise<void> {
  if (appState.isPollingSpotify || !appState.spotifyClient.ready()) return;
  appState.isPollingSpotify = true;
  try {
    appState.spotifyPlayback = await appState.spotifyClient.playback();
    const trackUri = appState.spotifyPlayback.item.uri;
    if (trackUri !== '' && trackUri !== appState.currentLikedTrackUri) {
      appState.currentLikedTrackUri = trackUri;
      appState.isCurrentTrackLiked = await appState.spotifyClient.isLiked(trackUri);
    }
  } catch (error) {
    /* affiché lors d'une action explicite */
  }
  appState.isPollingSpotify = false;
  uiState.dirty = true;
}

// ----------------------------------------------------------------------------
// Commandes de lecture et de volume
// ----------------------------------------------------------------------------

export function executeGroupCommand(
  commandLabel: string,
  commandCallback: (system: System, group: Group) => Promise<void>
): void {
  if (appState.sonosSystem === null || appState.activeGroup === null) {
    showToast('Aucune enceinte');
    return;
  }
  const system = appState.sonosSystem as System;
  const group = appState.activeGroup as Group;
  runSafeNetworkAction(commandLabel, async (): Promise<void> => {
    await commandCallback(system, group);
    await sleepMilliseconds(400);
    await pollActiveSonosGroup();
  });
}

/** Plays the previous (`direction` -1) or next (+1) track of any group, then reads that group back. */
export function skipGroupTrack(group: Group, direction: i32): void {
  if (appState.sonosSystem === null) return;
  const system = appState.sonosSystem as System;
  runSafeNetworkAction(direction < 0 ? 'Précédent' : 'Suivant', async (): Promise<void> => {
    if (direction < 0) {
      await system.previous(group);
    } else {
      await system.next(group);
    }
    await sleepMilliseconds(400);
    await system.update(group);
  });
}

export function togglePlayPause(): void {
  if (appState.activeGroup === null) return;
  const group = appState.activeGroup as Group;
  if (group.playing()) {
    group.state = 'PAUSED_PLAYBACK';
    appState.trackPositionBaseSeconds = getInterpolatedTrackPositionSeconds();
    appState.trackPositionTimestampSeconds = appState.elapsedAppClockSeconds;
    executeGroupCommand('Pause', (system, targetGroup) => system.pause(targetGroup));
  } else {
    executeGroupCommand('Lecture', (system, targetGroup) => system.play(targetGroup));
  }
  uiState.dirty = true;
}

let volumeGestureSnapshotGroup: Group | null = null;
let volumeGestureInitialGroupVolume: i32 = -1;
let volumeGestureInitialMemberVolumes: i32[] = [];

export function setActiveGroupVolume(normalizedVolume: number): void {
  if (appState.activeGroup !== null) {
    setSpecificGroupVolume(appState.activeGroup as Group, normalizedVolume);
  }
}

export function setSpecificGroupVolume(targetGroup: Group, normalizedVolume: number): void {
  if (appState.sonosSystem === null) return;
  const newVolumePercent = Math.round(normalizedVolume * 100) as i32;
  const system = appState.sonosSystem as System;
  if (newVolumePercent === targetGroup.volume) return;

  if (appState.volumeHoldCooldownSeconds <= 0 || volumeGestureSnapshotGroup !== targetGroup) {
    volumeGestureSnapshotGroup = targetGroup;
    volumeGestureInitialGroupVolume = targetGroup.volume;
    volumeGestureInitialMemberVolumes = [];
    for (let index = 0; index < targetGroup.members.length; index++) {
      volumeGestureInitialMemberVolumes.push(targetGroup.members[index].volume);
    }
  }

  for (
    let index = 0;
    index < targetGroup.members.length && index < volumeGestureInitialMemberVolumes.length;
    index++
  ) {
    const member = targetGroup.members[index];
    const initialMemberVol = volumeGestureInitialMemberVolumes[index];
    if (initialMemberVol >= 0) {
      member.volume = (
        volumeGestureInitialGroupVolume > 0
          ? Math.max(
              0,
              Math.min(
                100,
                Math.round((initialMemberVol * newVolumePercent) / volumeGestureInitialGroupVolume)
              )
            )
          : newVolumePercent
      ) as i32;
    }
  }

  targetGroup.volume = newVolumePercent;
  appState.volumeHoldCooldownSeconds = 1.5;
  uiState.dirty = true;
  volumeRequestQueue.enqueue(async (): Promise<void> => {
    await system.setGroupVolume(targetGroup, newVolumePercent);
  });
}

export function setSpeakerRoomVolume(speaker: Speaker, normalizedVolume: number): void {
  if (appState.sonosSystem === null) return;
  const newVolumePercent = Math.round(normalizedVolume * 100) as i32;
  const system = appState.sonosSystem as System;
  if (newVolumePercent === speaker.volume) return;

  speaker.volume = newVolumePercent;
  appState.volumeHoldCooldownSeconds = 1.5;
  volumeGestureSnapshotGroup = null;
  uiState.dirty = true;

  for (let groupIndex = 0; groupIndex < system.groups.length; groupIndex++) {
    const group = system.groups[groupIndex];
    for (let memberIndex = 0; memberIndex < group.members.length; memberIndex++) {
      if (group.members[memberIndex] === speaker) {
        let sumVolumes = 0;
        let validCount = 0;
        for (let otherIndex = 0; otherIndex < group.members.length; otherIndex++) {
          const otherMember = group.members[otherIndex];
          if (otherMember.volume >= 0) {
            sumVolumes += otherMember.volume;
            validCount++;
          }
        }
        if (validCount > 0) {
          group.volume = Math.round(sumVolumes / validCount) as i32;
        }
      }
    }
  }

  volumeRequestQueue.enqueue(async (): Promise<void> => {
    await system.setVolume(speaker, newVolumePercent);
  });
}

export function nudgeActiveGroupVolume(deltaPercent: i32): void {
  if (appState.activeGroup !== null && (appState.activeGroup as Group).volume >= 0) {
    const currentVolume = (appState.activeGroup as Group).volume;
    setActiveGroupVolume(Math.max(0, Math.min(100, currentVolume + deltaPercent)) / 100);
  }
}

// ----------------------------------------------------------------------------
// Actions Radios et Spotify
// ----------------------------------------------------------------------------

export function playRadioStation(station: RadioStation): void {
  executeGroupCommand(station.name, async (system: System, group: Group): Promise<void> => {
    await system.playStream(group, station.streamUrl, station.name, station.artworkUrl);
    showToast(`${station.name} sur ${group.name()}`);
  });
  navigateToHomePlayer();
}

export function toggleFavoriteRadioStation(station: RadioStation): void {
  const existingIndex = findStationIndexByUrl(appState.myStations, station.streamUrl);
  if (existingIndex >= 0) {
    appState.myStations.splice(existingIndex, 1);
    showToast(`${station.name} retirée de mes radios`);
  } else {
    appState.myStations.push(station);
    showToast(`${station.name} ajoutée à mes radios`);
  }
  saveMyRadioStations(appState.myStations);
}

/** Takes a station out of "my radios" (a second tap on a station already gone does nothing). */
export function removeMyRadioStation(station: RadioStation): void {
  const index = findStationIndexByUrl(appState.myStations, station.streamUrl);
  if (index < 0) return;
  appState.myStations.splice(index, 1);
  saveMyRadioStations(appState.myStations);
  uiState.dirty = true;
}

export function loadPopularRadios(): void {
  if (appState.popularStationsState === 'loading' || appState.popularStationsState === 'ok') return;
  appState.popularStationsState = 'loading';
  runSafeNetworkAction('Radios', async (): Promise<void> => {
    try {
      appState.popularStations = await searchRadioDirectory('');
      appState.popularStationsState = 'ok';
    } catch (error) {
      appState.popularStationsState = 'Annuaire injoignable : ' + error.message;
    }
  });
}

// Request ids: an answer is only applied when no newer request was sent since (a slow search never overwrites a newer one)
let latestRadioSearchId: i32 = 0;
const latestSpotifyTabRequestIds: i32[] = [0, 0, 0, 0, 0];

export function searchRadiosByQuery(): void {
  appState.searchedStationsState = 'loading';
  appState.searchedStations = [];
  const currentQuery = appState.searchQuery;
  const requestId = ++latestRadioSearchId;
  runSafeNetworkAction('Recherche', async (): Promise<void> => {
    try {
      const stations = await searchRadioDirectory(currentQuery);
      if (requestId !== latestRadioSearchId) return;
      appState.searchedStations = stations;
      appState.searchedStationsState = stations.length === 0 ? 'Aucune radio trouvée' : 'ok';
    } catch (error) {
      if (requestId !== latestRadioSearchId) return;
      appState.searchedStationsState = 'Annuaire injoignable : ' + error.message;
    }
  });
}

export function playSpotifyItem(item: Item): void {
  if (appState.sonosSystem === null || appState.activeGroup === null) {
    showToast('Aucune enceinte');
    return;
  }
  const group = appState.activeGroup as Group;
  const system = appState.sonosSystem as System;
  showToast(`${item.name}…`);

  runSafeNetworkAction('Spotify', async (): Promise<void> => {
    if (appState.spotifyUserName === '') {
      appState.spotifyUserName = await appState.spotifyClient.me();
    }
    const connectDevice = await appState.spotifyClient.device(group.coordinator.name);
    if (connectDevice !== null && !connectDevice.restricted) {
      await appState.spotifyClient.play(item, connectDevice.id);
    } else {
      await playSpotifyThroughSonosService(system, group, item);
    }
    showToast(`${item.name} sur ${group.name()}`);
    navigateToHomePlayer();
    await sleepMilliseconds(800);
    await pollActiveSonosGroup();
    await pollSpotifyPlaybackState();
  });
}

async function playSpotifyThroughSonosService(
  system: System,
  group: Group,
  item: Item
): Promise<void> {
  if (appState.spotifyServiceIdOnSonos < 0) {
    appState.spotifyServiceIdOnSonos = await serviceId(system, 'Spotify');
  }
  if (appState.spotifyServiceIdOnSonos < 0) {
    throw new Error("le service Spotify n'est pas disponible sur ces enceintes");
  }

  const targetUri =
    item.kind === 'liked'
      ? `spotify:user:${appState.spotifyClient.userId}:collection`
      : item.uri;

  const candidateSerialNumbers: i32[] = [];
  if (appState.config.spotifyAccountSerial > 0) {
    candidateSerialNumbers.push(appState.config.spotifyAccountSerial);
  }
  const favoriteAccountSerial = await accountOf(system, appState.spotifyServiceIdOnSonos);
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
      await sonosSpotify(
        system,
        group,
        targetUri,
        item.name,
        appState.spotifyServiceIdOnSonos,
        serialNumber
      );
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
    }. Ajoute une playlist Spotify aux favoris dans l'app Sonos, puis réessaie.`
  );
}

/**
 * What to tell about a failed Spotify call: a 403 is an account the Spotify app does not let in (development mode: 5 accounts, each
 * added under User Management on developer.spotify.com).
 */
export function explainSpotifyError(message: string): string {
  const isRefusedAccount =
    message.indexOf(': 403') >= 0 ||
    message.endsWith(' 403') ||
    message.indexOf('Forbidden') >= 0 ||
    message.indexOf('not be registered') >= 0;
  return isRefusedAccount
    ? "Spotify refuse ce compte : le propriétaire de l'app Spotify doit l'ajouter dans developer.spotify.com, User Management (avec l'e-mail du compte), puis se déconnecter et se reconnecter dans les réglages."
    : message;
}

export function loadSpotifyTab(tabIndex: i32, forceReload: boolean): void {
  if (!appState.spotifyClient.ready() || (!forceReload && appState.spotifyTabStates[tabIndex] !== '')) {
    return;
  }
  appState.spotifyTabStates[tabIndex] = 'loading';
  const currentQuery = appState.searchQuery;
  const requestId = ++latestSpotifyTabRequestIds[tabIndex];

  runSafeNetworkAction('Spotify', async (): Promise<void> => {
    try {
      if (appState.spotifyUserName === '') {
        appState.spotifyUserName = await appState.spotifyClient.me();
      }
      const itemsPage = await fetchSpotifyPageItems(tabIndex, 0, currentQuery);
      if (requestId !== latestSpotifyTabRequestIds[tabIndex]) return;
      appState.spotifyTabLists[tabIndex] = itemsPage;
      appState.spotifyTabHasMore[tabIndex] =
        tabIndex <= 2 && itemsPage.length === SPOTIFY_PAGE_SIZE;
      appState.spotifyTabStates[tabIndex] =
        itemsPage.length === 0 ? 'Rien ici pour le moment' : 'ok';
    } catch (error) {
      if (requestId !== latestSpotifyTabRequestIds[tabIndex]) return;
      appState.spotifyTabStates[tabIndex] = explainSpotifyError(error.message);
    }
  });
}

async function fetchSpotifyPageItems(
  tabIndex: i32,
  offset: i32,
  searchQuery: string
): Promise<Item[]> {
  if (tabIndex === 0) return await appState.spotifyClient.playlists(offset, SPOTIFY_PAGE_SIZE);
  if (tabIndex === 1) return await appState.spotifyClient.albums(offset, SPOTIFY_PAGE_SIZE);
  if (tabIndex === 2) return await appState.spotifyClient.likedTracks(offset, SPOTIFY_PAGE_SIZE);
  if (tabIndex === 3) return await appState.spotifyClient.recent();
  return await appState.spotifyClient.search(searchQuery);
}

export function loadMoreSpotifyItems(tabIndex: i32): void {
  if (
    !appState.spotifyTabHasMore[tabIndex] ||
    appState.spotifyTabIsPaging[tabIndex] ||
    appState.spotifyTabStates[tabIndex] !== 'ok'
  ) {
    return;
  }
  appState.spotifyTabIsPaging[tabIndex] = true;
  const pagedList = appState.spotifyTabLists[tabIndex];
  const currentOffset = pagedList.length as i32;

  runSafeNetworkAction('Spotify', async (): Promise<void> => {
    try {
      const nextItems = await fetchSpotifyPageItems(tabIndex, currentOffset, '');
      // The list was replaced meanwhile (a reload): this page belongs to the old one
      if (appState.spotifyTabLists[tabIndex] === pagedList) {
        for (let index = 0; index < nextItems.length; index++) {
          pagedList.push(nextItems[index]);
        }
        appState.spotifyTabHasMore[tabIndex] = nextItems.length === SPOTIFY_PAGE_SIZE;
      }
    } catch (error) {
      appState.spotifyTabHasMore[tabIndex] = false;
      showToast(error.message);
    }
    appState.spotifyTabIsPaging[tabIndex] = false;
    uiState.dirty = true;
  });
}

// ----------------------------------------------------------------------------
// Saisie clavier (virtuel AZERTY ou clavier physique de bureau)
// ----------------------------------------------------------------------------

export function handleTypedKeyboardKey(keyToken: string): void {
  const isEditingCity =
    appState.currentPage === PAGE_SETTINGS && appState.isSearchingWeatherCity;
  let currentText = isEditingCity ? appState.weatherCityQuery : appState.searchQuery;

  if (keyToken === 'back') {
    currentText = currentText.slice(0, Math.max(0, currentText.length - 1));
  } else if (keyToken === 'enter') {
    appState.isKeyboardVisible = false;
    if (!isEditingCity && currentText.trim() !== '') {
      if (appState.currentPage === PAGE_RADIOS) {
        searchRadiosByQuery();
      } else {
        loadSpotifyTab(4, true);
      }
    }
  } else {
    currentText += keyToken;
  }

  if (isEditingCity) {
    if (currentText !== appState.weatherCityQuery) {
      triggerPlaceSearch(currentText);
    }
    appState.weatherCityQuery = currentText;
  } else {
    appState.searchQuery = currentText;
  }
  uiState.dirty = true;
}
