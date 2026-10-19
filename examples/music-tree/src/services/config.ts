// ============================================================================
// services/config.ts — Reading and persisting config.json
// ============================================================================

import { exists, readText, writeText } from 'zinc:fs';

/**
 * Persistent settings stored in `config.json` next to the application.
 */
export class AppConfig {
  /** Idle delay before the screen turns off (in seconds; 0 = never). */
  sleepDelaySeconds: number = 120;

  /** UUID of the Sonos group or speaker controlled by default. */
  selectedGroupUuid: string = '';

  /** IP address of the last Sonos speaker found (speeds up startup). */
  sonosSeedIp: string = '';

  /** Account number of the Spotify service registered in the Sonos speakers. */
  spotifyAccountSerial: i32 = 0;

  /** Full-screen player mode (hides the sidebar on the Now Playing page). */
  fullScreenPlayer: boolean = false;

  /** Coordinates and name of the city chosen for the weather (0, 0 = IP geolocation). */
  weatherLatitude: number = 0;
  weatherLongitude: number = 0;
  weatherCityName: string = '';

  /** Display of the battery indicator and its percentage in the status bar. */
  showBatteryIndicator: boolean = true;
  showBatteryPercentage: boolean = true;

  /** The clock slide's glances: the sleeping screen lights up every few minutes on the clock (`glances`). */
  clockGlancesEnabled: boolean = true;

  /** The Mac's notifications shown over the views and waking the screen; off, they only go to the list (`notify`). */
  macNotificationsShown: boolean = true;
}

const CONFIG_FILE_PATH = 'config.json';

/**
 * Loads the settings from `config.json` (or returns the defaults).
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
    if (parsed.glances !== undefined) config.clockGlancesEnabled = parsed.glances === true;
    if (parsed.notify !== undefined) config.macNotificationsShown = parsed.notify === true;
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
 * Writes the settings to `config.json`, keeping the keys this version does not know (another version of the app,
 * or `examples/music`, may have written them).
 */
export function saveAppConfig(config: AppConfig): void {
  try {
    let stored = JSON.parse('{}');
    if (exists(CONFIG_FILE_PATH)) {
      try {
        stored = JSON.parse(readText(CONFIG_FILE_PATH));
      } catch (error) {
        /* unreadable: written again from the settings in memory */
      }
    }
    stored.sleep = config.sleepDelaySeconds;
    stored.group = config.selectedGroupUuid;
    stored.seed = config.sonosSeedIp;
    stored.spotifySn = config.spotifyAccountSerial;
    stored.full = config.fullScreenPlayer;
    stored.lat = config.weatherLatitude;
    stored.lon = config.weatherLongitude;
    stored.city = config.weatherCityName;
    stored.battery = config.showBatteryIndicator;
    stored.batteryPct = config.showBatteryPercentage;
    stored.glances = config.clockGlancesEnabled;
    stored.notify = config.macNotificationsShown;
    writeText(CONFIG_FILE_PATH, JSON.stringify(stored) + '\n');
  } catch (error) {
    console.error(`music: config.json: ${error.message}`);
  }
}
