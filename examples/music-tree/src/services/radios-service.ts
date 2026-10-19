// ============================================================================
// services/radios-service.ts — Favorite radios and the radio-browser.info directory
// ============================================================================
// Handles the personal list of stations (`radios.json`) and the search
// in the free radio-browser.info directory (no API key). Only the MP3,
// AAC and AAC+ streams that Sonos speakers can play directly are kept.

import { exists, readText, writeText } from 'zinc:fs';

/**
 * A web radio station.
 */
export class RadioStation {
  name: string = '';
  streamUrl: string = '';
  /** URL of the station's logo ('' when none). */
  artworkUrl: string = '';
  /** Music styles or short description (e.g. 'jazz, soul'). */
  tags: string = '';
}

const RADIOS_FILE_PATH = 'radios.json';
const RADIO_BROWSER_API_URL = 'https://de1.api.radio-browser.info/json/stations/search';

export function createRadioStation(
  name: string,
  streamUrl: string,
  tags: string,
  artworkUrl: string = ''
): RadioStation {
  const station = new RadioStation();
  station.name = name;
  station.streamUrl = streamUrl;
  station.tags = tags;
  station.artworkUrl = artworkUrl;
  return station;
}

/** Initial list of French radios, provided before the user changes anything. */
function getDefaultRadioStations(): RadioStation[] {
  return [
    createRadioStation(
      'FIP',
      'http://icecast.radiofrance.fr/fip-midfi.mp3',
      'éclectique',
      'https://upload.wikimedia.org/wikipedia/fr/thumb/d/d5/FIP_logo_2005.svg/330px-FIP_logo_2005.svg.png'
    ),
    createRadioStation(
      'France Inter',
      'http://icecast.radiofrance.fr/franceinter-midfi.mp3',
      'généraliste',
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/France_Inter_logo_2021.svg/330px-France_Inter_logo_2021.svg.png'
    ),
    createRadioStation(
      'franceinfo',
      'http://icecast.radiofrance.fr/franceinfo-midfi.mp3',
      'info',
      'https://charte.radiofrance.fr/images/franceinfo/franceinfo2.png'
    ),
    createRadioStation(
      'France Culture',
      'http://icecast.radiofrance.fr/franceculture-midfi.mp3',
      'culture',
      'https://upload.wikimedia.org/wikipedia/fr/thumb/c/c9/France_Culture_-_2008.svg/330px-France_Culture_-_2008.svg.png'
    ),
    createRadioStation(
      'France Musique',
      'http://icecast.radiofrance.fr/francemusique-midfi.mp3',
      'classique, jazz',
      'https://upload.wikimedia.org/wikipedia/fr/thumb/2/22/France_Musique_-_2008.svg/330px-France_Musique_-_2008.svg.png'
    ),
    createRadioStation(
      'TSF Jazz',
      'http://tsfjazz.ice.infomaniak.ch/tsfjazz-high.mp3',
      'jazz',
      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/TSFJazz-2017.jpg/330px-TSFJazz-2017.jpg'
    ),
    createRadioStation(
      'Radio Nova',
      'http://novazz.ice.infomaniak.ch/novazz-128.mp3',
      'groove, hip-hop',
      'https://www.nova.fr/wp-content/uploads/sites/2/2021/02/cropped-favicon.png?fit=180%2c180&quality=75'
    ),
    createRadioStation(
      'Radio Meuh',
      'http://radiomeuh.ice.infomaniak.ch/radiomeuh-128.mp3',
      'électro, funk',
      'https://www.radiomeuh.com/android-icon-192x192.png'
    ),
    createRadioStation(
      "Mouv'",
      'http://icecast.radiofrance.fr/mouv-midfi.mp3',
      'hip-hop',
      'https://upload.wikimedia.org/wikipedia/fr/thumb/d/d3/Le_Mouv%27_logo_2008.svg/330px-Le_Mouv%27_logo_2008.svg.png'
    ),
  ];
}

/** Loads the favorite radios from `radios.json` (or the default selection). */
export function loadMyRadioStations(): RadioStation[] {
  if (!exists(RADIOS_FILE_PATH)) return getDefaultRadioStations();
  try {
    const parsedList = JSON.parse(readText(RADIOS_FILE_PATH));
    const stations: RadioStation[] = [];
    for (let index = 0; index < parsedList.length; index++) {
      const entry = parsedList[index];
      stations.push(
        createRadioStation('' + entry.name, '' + entry.url, '' + entry.tags, '' + entry.art)
      );
    }
    return stations;
  } catch (error) {
    return getDefaultRadioStations();
  }
}

/** Saves the list of favorite radios to `radios.json`. */
export function saveMyRadioStations(stationList: RadioStation[]): void {
  const serializedRows: string[] = [];
  for (let index = 0; index < stationList.length; index++) {
    const station = stationList[index];
    serializedRows.push(
      JSON.stringify({
        name: station.name,
        url: station.streamUrl,
        tags: station.tags,
        art: station.artworkUrl,
      })
    );
  }
  try {
    writeText(RADIOS_FILE_PATH, '[\n' + serializedRows.join(',\n') + '\n]\n');
  } catch (error) {
    console.error(`music: cannot write ${RADIOS_FILE_PATH}: ${error.message}`);
  }
}

/** Returns the index of the station in `stationList` with the same stream URL, or `-1`. */
export function findStationIndexByUrl(stationList: RadioStation[], streamUrl: string): i32 {
  for (let index = 0; index < stationList.length; index++) {
    if (stationList[index].streamUrl === streamUrl) return index;
  }
  return -1;
}

/**
 * Queries the radio-browser.info directory:
 * - If `searchQuery` is empty, returns the most popular stations of the country `countryCode`.
 * - Otherwise, searches the stations whose name matches `searchQuery`.
 */
export async function searchRadioDirectory(
  searchQuery: string,
  countryCode: string = 'FR'
): Promise<RadioStation[]> {
  const queryParam =
    searchQuery !== ''
      ? `name=${encodeURIComponent(searchQuery)}`
      : `countrycode=${countryCode}`;
  const response = await fetch(
    `${RADIO_BROWSER_API_URL}?${queryParam}&order=votes&reverse=true&limit=60&hidebroken=true`,
    {
      timeoutMs: 12000,
      headers: [['User-Agent', 'ZincMusic/1.0']],
    }
  );
  if (response.status !== 200) {
    throw new Error(`radio-browser: ${response.status}`);
  }

  const rawItems = JSON.parse(await response.text());
  const compatibleStations: RadioStation[] = [];

  for (let index = 0; index < rawItems.length; index++) {
    const rawEntry = rawItems[index];
    const codecRaw: string = '' + rawEntry.codec;
    const resolvedUrl: string = '' + rawEntry.url_resolved;
    const fallbackUrl: string = '' + rawEntry.url;
    const codecUpper = codecRaw.toUpperCase();
    const streamUrl = resolvedUrl !== '' ? resolvedUrl : fallbackUrl;

    const isCodecSupported = codecUpper === 'MP3' || codecUpper === 'AAC' || codecUpper === 'AAC+';
    if (
      !isCodecSupported ||
      streamUrl.endsWith('.m3u8') ||
      findStationIndexByUrl(compatibleStations, streamUrl) >= 0
    ) {
      continue;
    }

    const rawTags: string = '' + rawEntry.tags;
    const rawName: string = '' + rawEntry.name;
    const shortTags = rawTags.split(',').slice(0, 3).join(', ');
    compatibleStations.push(
      createRadioStation(rawName.trim(), streamUrl, shortTags, '' + rawEntry.favicon)
    );
  }

  return compatibleStations;
}
