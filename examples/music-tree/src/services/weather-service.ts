// ============================================================================
// services/weather-service.ts — Service météo Open-Meteo et géocodage
// ============================================================================
// Récupère les prévisions météo (actuelles, horaires sur 24h et quotidiennes
// sur 7 jours) auprès d'Open-Meteo (gratuit, sans clé API), ainsi que la
// recherche de villes par nom. La météo est rafraîchie toutes les 15 minutes
// lorsque l'écran est allumé.

import { env } from 'zinc:sys';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uiState } from '../core/input';

/**
 * Données météorologiques complètes pour la ville choisie.
 */
export class WeatherForecast {
  isLoaded: boolean = false;
  cityName: string = '';
  currentTemp: number = 0;
  apparentTemp: number = 0;
  weatherCode: i32 = 0;
  isDaytime: boolean = true;
  windSpeedKmh: number = 0;
  humidityPercent: number = 0;

  hourlyTemps: number[] = [];
  hourlyWeatherCodes: i32[] = [];
  hourlyRainProbabilities: number[] = [];
  hourlyLabels: string[] = [];

  dailyLowTemps: number[] = [];
  dailyHighTemps: number[] = [];
  dailyWeatherCodes: i32[] = [];
}

/**
 * Lieu géographique retourné par l'autocomplétion de villes Open-Meteo.
 */
export class GeocodedPlace {
  name: string = '';
  region: string = '';
  country: string = '';
  countryCode: string = '';
  latitude: number = 0;
  longitude: number = 0;
}

let currentForecast = new WeatherForecast();
let currentLatitude: number = 0;
let currentLongitude: number = 0;
let currentCityName: string = '';
let hasKnownLocation: boolean = false;
let isFetchingForecast: boolean = false;
let forecastAgeSeconds: number = 1e9;
let forecastErrorMessage: string = '';

const CUSTOM_METEO_BASE_URL = env('ZINC_MUSIC_METEO');
const FORECAST_HOST =
  CUSTOM_METEO_BASE_URL !== '' ? CUSTOM_METEO_BASE_URL : 'https://api.open-meteo.com';
const GEOCODING_HOST =
  CUSTOM_METEO_BASE_URL !== '' ? CUSTOM_METEO_BASE_URL : 'https://geocoding-api.open-meteo.com';

/** Retourne les dernières prévisions météo chargées. */
export function getCurrentWeatherForecast(): WeatherForecast {
  return currentForecast;
}

/** Retourne le message d'erreur éventuel du service météo. */
export function getWeatherErrorMessage(): string {
  return forecastErrorMessage;
}

/** Définit la ville de la météo et déclenche un rafraîchissement immédiat. */
export function setWeatherLocation(latitude: number, longitude: number, cityName: string): void {
  currentLatitude = latitude;
  currentLongitude = longitude;
  currentCityName = cityName;
  hasKnownLocation = true;
  forecastAgeSeconds = 1e9;
}

/** Retourne le nom de la ville actuelle ('' si pas encore déterminée). */
export function getWeatherCityName(): string {
  return currentCityName;
}

// ----------------------------------------------------------------------------
// Recherche de villes par nom (géocodage avec anti-rebond de 300 ms)
// ----------------------------------------------------------------------------
let geocodedPlacesList: GeocodedPlace[] = [];
let geocodingSearchStatus: string = '';
let pendingSearchQuery: string = '';
let searchDebounceSeconds: number = 0;
let geocodingRequestCounter: i32 = 0;

export function getFoundPlaces(): GeocodedPlace[] {
  return geocodedPlacesList;
}

export function getPlaceSearchStatus(): string {
  return geocodingSearchStatus;
}

/**
 * Programme une recherche de ville 300 ms après la dernière frappe clavier.
 * Open-Meteo répond à partir de 2 caractères.
 */
export function triggerPlaceSearch(typedName: string): void {
  pendingSearchQuery = typedName.trim();
  if (pendingSearchQuery.length < 2) {
    searchDebounceSeconds = 0;
    geocodedPlacesList = [];
    geocodingSearchStatus = '';
    geocodingRequestCounter++;
    return;
  }
  searchDebounceSeconds = 0.3;
  geocodingSearchStatus = 'loading';
}

/**
 * Appelé à chaque frame pour gérer le rafraîchissement périodique (15 min)
 * et le délai d'anti-rebond de la recherche de ville.
 */
export function tickWeatherService(deltaSeconds: number, isScreenAwake: boolean): void {
  forecastAgeSeconds += deltaSeconds;
  if (isScreenAwake && !isFetchingForecast && forecastAgeSeconds >= 900) {
    forecastAgeSeconds = 0;
    refreshWeatherForecast();
  }
  if (searchDebounceSeconds > 0) {
    searchDebounceSeconds -= deltaSeconds;
    if (searchDebounceSeconds <= 0) {
      fetchGeocodedPlaces(pendingSearchQuery);
    }
  }
}

async function fetchGeocodedPlaces(queryName: string): Promise<void> {
  const requestId = ++geocodingRequestCounter;
  try {
    const response = await fetch(
      `${GEOCODING_HOST}/v1/search?name=${encodeURIComponent(queryName)}&count=8&language=fr&format=json`,
      {
        timeoutMs: 10000,
        headers: [['User-Agent', 'ZincMusic/1.0']],
      }
    );
    if (response.status !== 200) throw new Error(`geocoding ${response.status}`);
    const parsedJson = JSON.parse(await response.text());
    if (requestId !== geocodingRequestCounter) return;

    const results: GeocodedPlace[] = [];
    if (parsedJson.results !== undefined) {
      const count = parsedJson.results.length as i32;
      for (let index: i32 = 0; index < count; index++) {
        const rawPlace = parsedJson.results[index];
        const place = new GeocodedPlace();
        place.name = '' + rawPlace.name;
        place.latitude = rawPlace.latitude as number;
        place.longitude = rawPlace.longitude as number;
        place.region = rawPlace.admin1 !== undefined ? '' + rawPlace.admin1 : '';
        place.country = rawPlace.country !== undefined ? '' + rawPlace.country : '';
        place.countryCode = rawPlace.country_code !== undefined ? '' + rawPlace.country_code : '';
        results.push(place);
      }
    }
    geocodedPlacesList = results;
    geocodingSearchStatus = results.length > 0 ? 'ok' : 'Aucune ville de ce nom';
  } catch (error) {
    if (requestId === geocodingRequestCounter) {
      geocodedPlacesList = [];
      geocodingSearchStatus = 'Recherche indisponible';
    }
  }
  uiState.dirty = true;
}

/** Détermine la position approximative par l'adresse IP lors du tout premier lancement. */
async function resolveLocationFromIp(): Promise<void> {
  const savedPlaceJson = await AsyncStorage.getItem('weather.place');
  if (savedPlaceJson !== null) {
    const saved = JSON.parse(savedPlaceJson as string);
    currentLatitude = saved.lat as number;
    currentLongitude = saved.lon as number;
    currentCityName = '' + saved.city;
    hasKnownLocation = true;
    return;
  }
  const response = await fetch('http://ip-api.com/json/?fields=lat,lon,city', { timeoutMs: 10000 });
  const parsed = JSON.parse(await response.text());
  currentLatitude = parsed.lat as number;
  currentLongitude = parsed.lon as number;
  currentCityName = '' + parsed.city;
  hasKnownLocation = true;
  await AsyncStorage.setItem(
    'weather.place',
    JSON.stringify({ lat: currentLatitude, lon: currentLongitude, city: currentCityName })
  );
}

/** Télécharge les prévisions complètes auprès d'Open-Meteo. */
async function refreshWeatherForecast(): Promise<void> {
  isFetchingForecast = true;
  try {
    if (!hasKnownLocation) {
      await resolveLocationFromIp();
    }
    const requestedCityName = currentCityName;
    const requestUrl =
      `${FORECAST_HOST}/v1/forecast?latitude=${currentLatitude}&longitude=${currentLongitude}&timezone=auto&forecast_days=7` +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day' +
      '&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min';

    const response = await fetch(requestUrl, {
      timeoutMs: 12000,
      headers: [['User-Agent', 'ZincMusic/1.0']],
    });
    if (response.status !== 200) throw new Error(`Open-Meteo ${response.status}`);
    const parsedJson = JSON.parse(await response.text());

    const forecast = new WeatherForecast();
    forecast.cityName = requestedCityName;
    forecast.currentTemp = parsedJson.current.temperature_2m as number;
    forecast.apparentTemp = parsedJson.current.apparent_temperature as number;
    forecast.weatherCode = parsedJson.current.weather_code as i32;
    forecast.isDaytime = (parsedJson.current.is_day as i32) === 1;
    forecast.windSpeedKmh = parsedJson.current.wind_speed_10m as number;
    forecast.humidityPercent = parsedJson.current.relative_humidity_2m as number;

    const currentIsoTime: string = '' + parsedJson.current.time;
    const currentHourPrefix = currentIsoTime.slice(0, 13);
    const hourlyTimes: string[] = [];
    const totalHourlyCount = parsedJson.hourly.time.length as i32;
    for (let index: i32 = 0; index < totalHourlyCount; index++) {
      hourlyTimes.push('' + parsedJson.hourly.time[index]);
    }

    let startHourIndex: i32 = 0;
    while (
      startHourIndex < totalHourlyCount &&
      hourlyTimes[startHourIndex].slice(0, 13) < currentHourPrefix
    ) {
      startHourIndex++;
    }

    const endHourIndex = Math.min(totalHourlyCount, startHourIndex + 25);
    for (let index = startHourIndex; index < endHourIndex; index++) {
      forecast.hourlyTemps.push(parsedJson.hourly.temperature_2m[index] as number);
      forecast.hourlyRainProbabilities.push(
        parsedJson.hourly.precipitation_probability[index] as number
      );
      forecast.hourlyWeatherCodes.push(parsedJson.hourly.weather_code[index] as i32);
      forecast.hourlyLabels.push(
        index === startHourIndex ? 'Maint.' : hourlyTimes[index].slice(11, 13) + ' h'
      );
    }

    const totalDaysCount = parsedJson.daily.time.length as i32;
    for (let dayIndex = 0; dayIndex < totalDaysCount; dayIndex++) {
      forecast.dailyLowTemps.push(parsedJson.daily.temperature_2m_min[dayIndex] as number);
      forecast.dailyHighTemps.push(parsedJson.daily.temperature_2m_max[dayIndex] as number);
      forecast.dailyWeatherCodes.push(parsedJson.daily.weather_code[dayIndex] as i32);
    }

    forecast.isLoaded = forecast.hourlyTemps.length > 1 && forecast.dailyLowTemps.length > 0;
    if (forecast.isLoaded) {
      currentForecast = forecast;
      forecastErrorMessage = '';
    }
  } catch (error) {
    forecastErrorMessage = 'Météo indisponible';
    forecastAgeSeconds = 600; // Nouvelle tentative dans 5 minutes
  }
  isFetchingForecast = false;
  uiState.dirty = true;
}

// ----------------------------------------------------------------------------
// Traduction des codes météo OMM (WMO) en libellés, icônes et couleurs de ciel
// ----------------------------------------------------------------------------

export function getWeatherConditionLabel(weatherCode: i32): string {
  if (weatherCode === 0) return 'Dégagé';
  if (weatherCode <= 2) return 'Peu nuageux';
  if (weatherCode === 3) return 'Couvert';
  if (weatherCode === 45 || weatherCode === 48) return 'Brouillard';
  if (weatherCode >= 51 && weatherCode <= 57) return 'Bruine';
  if ((weatherCode >= 61 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82)) {
    return weatherCode >= 80 ? 'Averses' : 'Pluie';
  }
  if ((weatherCode >= 71 && weatherCode <= 77) || weatherCode === 85 || weatherCode === 86) {
    return 'Neige';
  }
  if (weatherCode >= 95) return 'Orage';
  return '';
}

export function getWeatherIconName(weatherCode: i32, isDaytime: boolean): string {
  if (weatherCode === 0) return isDaytime ? 'sun' : 'moon';
  if (weatherCode <= 2) return isDaytime ? 'cloud-sun' : 'cloud-moon';
  if (weatherCode === 3) return 'cloud';
  if (weatherCode === 45 || weatherCode === 48) return 'cloud-fog';
  if (weatherCode >= 51 && weatherCode <= 57) return 'cloud-drizzle';
  if ((weatherCode >= 71 && weatherCode <= 77) || weatherCode === 85 || weatherCode === 86) {
    return 'cloud-snow';
  }
  if (weatherCode >= 95) return 'cloud-lightning';
  return 'cloud-rain';
}

export function getWeatherSkyGradientColors(weatherCode: i32, isDaytime: boolean): u32[] {
  if (!isDaytime) return [0x0b1430, 0x27365f];
  if (weatherCode <= 2) return [0x1d5fae, 0x63a6e3];
  if (weatherCode === 3 || weatherCode === 45 || weatherCode === 48) return [0x4f5d6d, 0x8796a6];
  return [0x34404e, 0x5d6b7b];
}

export function formatTemperatureDegrees(temperature: number): string {
  return `${Math.round(temperature)}°`;
}
