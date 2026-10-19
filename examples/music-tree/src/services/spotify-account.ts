// ============================================================================
// services/spotify-account.ts — The Spotify account: log in, check, log out
// ============================================================================
// A computer with a browser (a Mac) logs in from the app: zinc:spotify's Login
// opens the consent page and writes the login file when Spotify answers. A
// tablet keeps the instructions for the computer (pages/spotify). The settings
// check the account (the login file read again, the profile, the Connect
// devices) and log it out with two taps.

import { Login, sharedLoginFile } from 'zinc:spotify';
import { openUrl } from 'zinc:system/opener';
import { exists } from 'zinc:fs';
import { platform } from 'zinc:sys';
import { uiState } from '../core/input';
import { SPOTIFY_CLIENT_ID } from '../spotify-client';
import {
  appState,
  explainSpotifyError,
  formatPlural,
  showToast,
} from '../state';
import { spotifyCatalog } from './spotify-catalog';

const LOGOUT_CONFIRM_SECONDS = 4;

/** A Mac has a browser: the Spotify page logs in from there. */
export const canLogInFromThisDevice = platform() === 'macos';

export let spotifyLogin: Login | null = null;
export let spotifyCheckText = '';
export let isCheckingSpotify = false;
/** Seconds left to confirm "Déconnecter" (the second tap), 0 when not asked. */
export let spotifyLogoutConfirmSeconds = 0;

/** The client id to log in with: the login file's (an earlier login), else the one built into the app. */
export function getSpotifyLoginClientId(): string {
  return appState.spotifyClient.clientId !== '' ? appState.spotifyClient.clientId : SPOTIFY_CLIENT_ID;
}

export function isSpotifyLoginWaiting(): boolean {
  return spotifyLogin !== null && (spotifyLogin as Login).status === 'waiting';
}

/** Why the last login failed ('' when it did not, or was cancelled). */
export function getSpotifyLoginError(): string {
  if (spotifyLogin === null || (spotifyLogin as Login).status !== 'failed') return '';
  const error = (spotifyLogin as Login).error;
  return error === 'cancelled' ? '' : error;
}

export function startSpotifyLogin(): void {
  // a computer without a login file gets the shared one (~/.zinc/spotify.json), which every Zinc app of it reads
  const client = appState.spotifyClient;
  const loginFile = exists(client.file) || sharedLoginFile() === '' ? client.file : sharedLoginFile();
  const login = new Login(getSpotifyLoginClientId(), loginFile);
  spotifyLogin = login;
  if (login.status === 'waiting') openUrl(login.url);
  uiState.dirty = true;
}

export function cancelSpotifyLogin(): void {
  if (spotifyLogin !== null) (spotifyLogin as Login).cancel();
  spotifyLogin = null;
  uiState.dirty = true;
}

function forgetSpotifyLists(): void {
  appState.spotifyUserName = '';
  spotifyCatalog.reset();
}

let lastSeenLoginStatus = '';

/** Each frame: a login that ended in the browser (on success the account is read again and the page loads), and the logout's confirmation. */
export function tickSpotifyAccount(deltaSeconds: number): void {
  const loginStatus = spotifyLogin !== null ? (spotifyLogin as Login).status : '';
  if (loginStatus !== lastSeenLoginStatus) {
    lastSeenLoginStatus = loginStatus; // the plugin's answer changed what the page shows
    uiState.dirty = true;
  }
  if (loginStatus === 'done') {
    spotifyLogin = null;
    appState.spotifyClient.reload();
    forgetSpotifyLists();
    spotifyCatalog.preload();
  }
  if (spotifyLogoutConfirmSeconds > 0) {
    spotifyLogoutConfirmSeconds -= deltaSeconds;
    if (spotifyLogoutConfirmSeconds <= 0) {
      spotifyLogoutConfirmSeconds = 0;
      uiState.dirty = true;
    }
  }
}

export async function checkSpotifyAccount(): Promise<void> {
  isCheckingSpotify = true;
  spotifyCheckText = '';
  uiState.dirty = true;
  const client = appState.spotifyClient;
  client.reload(); // the file as it is now: another app of the Mac may have logged in or out
  if (!client.ready()) {
    spotifyCheckText =
      client.problem === 'login expired'
        ? 'La connexion a expiré : reconnecte-toi depuis la page Spotify.'
        : client.problem === 'unreadable login file'
        ? 'Le fichier de connexion est illisible.'
        : 'Pas de compte connecté.';
  } else {
    try {
      appState.spotifyUserName = await client.me();
      const devices = await client.devices();
      spotifyCheckText = `Tout est bon : ${appState.spotifyUserName}, ${formatPlural(devices.length as i32, 'appareil')} Spotify Connect.`;
    } catch (error) {
      spotifyCheckText = `Problème : ${explainSpotifyError(error.message)}`;
    }
  }
  isCheckingSpotify = false;
  uiState.dirty = true;
}

/** "Déconnecter" asks to be tapped again within four seconds, then forgets the account here (the login file keeps the client id). */
export function askOrConfirmSpotifyLogout(): void {
  if (spotifyLogoutConfirmSeconds <= 0) {
    spotifyLogoutConfirmSeconds = LOGOUT_CONFIRM_SECONDS;
    uiState.dirty = true;
    return;
  }
  appState.spotifyClient.logout();
  forgetSpotifyLists();
  spotifyCheckText = '';
  spotifyLogoutConfirmSeconds = 0;
  showToast('Spotify déconnecté');
}
