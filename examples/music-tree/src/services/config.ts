// ============================================================================
// services/config.ts — Lecture et persistance de config.json
// ============================================================================

import { exists, readText, writeText } from 'zinc:fs';

/**
 * Réglages persistants stockés dans `config.json` à côté de l'application.
 */
export class AppConfig {
  /** Délai d'inactivité avant extinction de l'écran (en secondes ; 0 = jamais). */
  sleepDelaySeconds: number = 120;

  /** Identifiant UUID du groupe ou de l'enceinte Sonos contrôlé par défaut. */
  selectedGroupUuid: string = '';

  /** Adresse IP de la dernière enceinte Sonos découverte (accélère le démarrage). */
  sonosSeedIp: string = '';

  /** Numéro de compte du service Spotify enregistré dans les enceintes Sonos. */
  spotifyAccountSerial: i32 = 0;

  /** Mode plein écran du lecteur (masque la barre latérale sur la page À l'écoute). */
  fullScreenPlayer: boolean = false;

  /** Coordonnées et nom de la ville choisie pour la météo (0, 0 = géolocalisation IP). */
  weatherLatitude: number = 0;
  weatherLongitude: number = 0;
  weatherCityName: string = '';

  /** Affichage de l'indicateur de batterie et de son pourcentage dans la barre d'état. */
  showBatteryIndicator: boolean = true;
  showBatteryPercentage: boolean = true;
}

const CONFIG_FILE_PATH = 'config.json';

/**
 * Charge la configuration depuis `config.json` (ou retourne les valeurs par défaut).
 */
export function loadAppConfig(): AppConfig {
  const config = new AppConfig();
  if (!exists(CONFIG_FILE_PATH)) return config;
  try {
    const parsed = JSON.parse(readText(CONFIG_FILE_PATH));
    if (parsed.sleep !== undefined) config.sleepDelaySeconds = parsed.sleep as number;
    if (parsed.group !== undefined) config.selectedGroupUuid = '' + parsed.group;
    if (parsed.seed !== undefined) config.sonosSeedIp = '' + parsed.seed;
    if (parsed.spotifySn !== undefined) config.spotifyAccountSerial = parsed.spotifySn as i32;
    if (parsed.full !== undefined) config.fullScreenPlayer = parsed.full === true;
    if (parsed.battery !== undefined) config.showBatteryIndicator = parsed.battery === true;
    if (parsed.batteryPct !== undefined) config.showBatteryPercentage = parsed.batteryPct === true;
    if (parsed.lat !== undefined && parsed.lon !== undefined) {
      config.weatherLatitude = parsed.lat as number;
      config.weatherLongitude = parsed.lon as number;
      config.weatherCityName = parsed.city !== undefined ? '' + parsed.city : '';
    }
  } catch (error) {
    console.error('music: config.json unreadable, defaults used');
  }
  return config;
}

/**
 * Enregistre la configuration actuelle dans `config.json` en conservant les clés
 * exactes attendues par le format historique.
 */
export function saveAppConfig(config: AppConfig): void {
  try {
    const serialized = JSON.stringify({
      sleep: config.sleepDelaySeconds,
      group: config.selectedGroupUuid,
      seed: config.sonosSeedIp,
      spotifySn: config.spotifyAccountSerial,
      full: config.fullScreenPlayer,
      lat: config.weatherLatitude,
      lon: config.weatherLongitude,
      city: config.weatherCityName,
      battery: config.showBatteryIndicator,
      batteryPct: config.showBatteryPercentage,
    });
    writeText(CONFIG_FILE_PATH, serialized + '\n');
  } catch (error) {
    console.error(`music: config.json: ${error.message}`);
  }
}
