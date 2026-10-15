// The weather slide of the home (main.ts): Open-Meteo's forecast (free, no key), in the spirit of iOS Weather: the temperature and the sky now,
// the next 24 hours as a curve with the chance of rain under it, the week as ranges. The place comes from config.json (lat, lon, city),
// else once from the address of the connection (ip-api.com), kept with AsyncStorage. Read again every 15 minutes while the screen is on.
import { rrect, gradient, stroke, polygon, drawText, textWidth, font, fontAscent } from 'zinc:gfx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ui, F, TEXT, label, centered, glyph } from './ui';

const TEMP = font('sans', 120);
const DAYS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];

class Weather {
  ok: boolean = false;
  city: string = '';
  temp: number = 0; feels: number = 0; code: i32 = 0; day: boolean = true; wind: number = 0; humidity: number = 0;
  hours: number[] = []; hourCodes: i32[] = []; rain: number[] = []; hourNames: string[] = [];
  lows: number[] = []; highs: number[] = []; dayCodes: i32[] = [];
}
let w = new Weather();
let lat = 0, lon = 0, city = '', placed = false, busy = false, age = 1e9, problem = '';

/** The place of config.json, when it names one. */
export function setPlace(la: number, lo: number, name: string): void { lat = la; lon = lo; city = name; placed = true; }

/** Time passes; the forecast is read again when it is 15 minutes old (and at once the first time). */
export function weatherTick(dt: number, awake: boolean): void {
  age += dt;
  if (awake && !busy && age >= 900) { age = 0; refresh(); }
}

async function locate(): Promise<void> {
  const kept = await AsyncStorage.getItem('weather.place');
  if (kept !== null) {
    const p = JSON.parse(kept as string);
    lat = p.lat as number; lon = p.lon as number; city = '' + p.city; placed = true; return;
  }
  const r = await fetch('http://ip-api.com/json/?fields=lat,lon,city', { timeoutMs: 10000 });
  const p = JSON.parse(await r.text());
  lat = p.lat as number; lon = p.lon as number; city = '' + p.city; placed = true;
  await AsyncStorage.setItem('weather.place', JSON.stringify({ lat: lat, lon: lon, city: city }));
}

async function refresh(): Promise<void> {
  busy = true;
  try {
    if (!placed) await locate();
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=7` +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day' +
      '&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min';
    const r = await fetch(url, { timeoutMs: 12000, headers: [['User-Agent', 'ZincMusic/1.0']] });
    if (r.status !== 200) throw new Error(`Open-Meteo ${r.status}`);
    const j = JSON.parse(await r.text());
    const n = new Weather();
    n.city = city;
    n.temp = j.current.temperature_2m as number; n.feels = j.current.apparent_temperature as number;
    n.code = j.current.weather_code as i32; n.day = (j.current.is_day as i32) === 1;
    n.wind = j.current.wind_speed_10m as number; n.humidity = j.current.relative_humidity_2m as number;
    const nowS: string = '' + j.current.time, now = nowS.slice(0, 13);   // "2026-10-15T15"
    const times: string[] = [], count = j.hourly.time.length as i32;
    for (let i: i32 = 0; i < count; i++) times.push('' + j.hourly.time[i]);
    let first: i32 = 0;
    while (first < count && times[first].slice(0, 13) < now) first++;
    for (let i = first; i < Math.min(count, first + 25); i++) {
      n.hours.push(j.hourly.temperature_2m[i] as number);
      n.rain.push(j.hourly.precipitation_probability[i] as number);
      n.hourCodes.push(j.hourly.weather_code[i] as i32);
      n.hourNames.push(i === first ? 'Maint.' : times[i].slice(11, 13) + ' h');
    }
    const days = j.daily.time.length as i32;
    for (let i = 0; i < days; i++) {
      n.lows.push(j.daily.temperature_2m_min[i] as number); n.highs.push(j.daily.temperature_2m_max[i] as number);
      n.dayCodes.push(j.daily.weather_code[i] as i32);
    }
    n.ok = n.hours.length > 1 && n.lows.length > 0;
    if (n.ok) { w = n; problem = ''; }
  } catch (e) { problem = 'Météo indisponible'; age = 600; }   // again in 5 minutes
  busy = false; ui.dirty = true;
}

// ---------------------------------------------------------------- WMO weather codes
function sky(code: i32): string {
  if (code === 0) return 'Dégagé';
  if (code <= 2) return 'Peu nuageux';
  if (code === 3) return 'Couvert';
  if (code === 45 || code === 48) return 'Brouillard';
  if (code >= 51 && code <= 57) return 'Bruine';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return code >= 80 ? 'Averses' : 'Pluie';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'Neige';
  if (code >= 95) return 'Orage';
  return '';
}
function iconOf(code: i32, day: boolean): string {
  if (code === 0) return day ? 'sun' : 'moon';
  if (code <= 2) return day ? 'cloud-sun' : 'cloud-moon';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'cloud-fog';
  if (code >= 51 && code <= 57) return 'cloud-drizzle';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'cloud-snow';
  if (code >= 95) return 'cloud-lightning';
  return 'cloud-rain';
}
/** The sky behind it: blue by day, navy by night, grey under clouds and rain. */
function ground(code: i32, day: boolean): u32[] {
  if (!day) return [0x0b1430, 0x27365f];
  if (code <= 2) return [0x1d5fae, 0x63a6e3];
  if (code === 3 || code === 45 || code === 48) return [0x4f5d6d, 0x8796a6];
  return [0x34404e, 0x5d6b7b];
}
function deg(t: number): string { return `${Math.round(t)}°`; }

// ---------------------------------------------------------------- drawing
// One grid: 32 px around, 20 between the cards, 24 inside them; the two cards of the top row are as wide and as high as each other.
const M = 32, G = 20, PAD = 24, ROW = 44;
function card(x: number, y: number, w: number, h: number): void { rrect(x, y, w, h, 20, 0xffffff, 34); }
/** Text whose middle is at y. */
function mid(f: i32, x: number, y: number, t: string, alpha: i32 = 255): void { drawText(f, x, y - fontAscent(f) / 2 - 1, t, TEXT, alpha, 0); }

export function weatherSlide(W: number, H: number): void {
  const g = ground(w.ok ? w.code : 0, w.ok ? w.day : true);
  gradient(0, -40, W, H + 40, 0, g[0], g[1], true, 255);
  if (!w.ok) {
    centered(F.head, W / 2, H / 2 - 20, problem !== '' ? problem : 'Météo…', TEXT);
    return;
  }
  const cw = (W - M * 2 - G) / 2, y0 = 8, th = PAD + w.lows.length * ROW + PAD - 8;
  // now
  const lx = M;
  card(lx, y0, cw, th);
  label(F.title, lx + PAD, y0 + PAD, w.city !== '' ? w.city : 'Ici', TEXT, cw - PAD * 2 - 100);
  drawText(TEMP, lx + PAD - 6, y0 + 64, deg(w.temp), TEXT, 255, 0);
  glyph(iconOf(w.code, w.day), lx + cw - PAD - 92, y0 + PAD + 4, 92, TEXT, 255, 1.5);
  label(F.body, lx + PAD, y0 + 200, sky(w.code), TEXT, cw - PAD * 2);
  label(F.label, lx + PAD, y0 + 232, `Max. ${deg(w.highs[0])}   Min. ${deg(w.lows[0])}`, TEXT, cw - PAD * 2, 220);
  label(F.small, lx + PAD, y0 + th - PAD - fontAscent(F.small) - 2, `Ressenti ${deg(w.feels)}  ·  Vent ${Math.round(w.wind)} km/h  ·  Humidité ${Math.round(w.humidity)} %`, TEXT, cw - PAD * 2, 200);
  // the week: one row a day, the day's range on the week's scale
  const rx = M + cw + G;
  card(rx, y0, cw, th);
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i < w.lows.length; i++) { lo = Math.min(lo, w.lows[i]); hi = Math.max(hi, w.highs[i]); }
  const span = Math.max(1, hi - lo), numW = textWidth(F.label, '-00°', 0);
  const bx = rx + PAD + 64 + 40 + numW + 12, bw = rx + cw - PAD - numW - 12 - bx;
  for (let i = 0; i < w.lows.length; i++) {
    const cy = y0 + PAD - 4 + i * ROW + ROW / 2;
    if (i > 0) rrect(rx + PAD, cy - ROW / 2, cw - PAD * 2, 1, 0, 0xffffff, 40);
    mid(F.bodyB, rx + PAD, cy, i === 0 ? 'Auj.' : DAYS[(new Date().getDay() + i) % 7]);
    glyph(iconOf(w.dayCodes[i], true), rx + PAD + 64, cy - 13, 26, TEXT, 255, 1.8);
    const l = deg(w.lows[i]);
    mid(F.label, bx - 12 - textWidth(F.label, l, 0), cy, l, 190);
    rrect(bx, cy - 3, bw, 6, 3, 0x000000, 50);
    const a = bx + ((w.lows[i] - lo) / span) * bw, b = bx + ((w.highs[i] - lo) / span) * bw;
    gradient(a, cy - 3, Math.max(6, b - a), 6, 3, 0x7fd3ff, 0xffc94d, false, 255);
    mid(F.label, bx + bw + 12, cy, deg(w.highs[i]));
  }
  // the next 24 hours: the temperature as a curve, the chance of rain under it, the hours at the bottom
  const cy0 = y0 + th + G, ch = H - cy0 - M + 8;
  card(M, cy0, W - M * 2, ch);
  const n = w.hours.length, gx = M + PAD + 16, gw = W - M * 2 - PAD * 2 - 32;
  const hoursY = cy0 + ch - PAD - fontAscent(F.tiny), rainBottom = hoursY - 12, rainH = 26;
  const top = cy0 + PAD + 28, gh = rainBottom - rainH - 16 - top;
  let tl = 1e9, tH = -1e9;
  for (const t of w.hours) { tl = Math.min(tl, t); tH = Math.max(tH, t); }
  const ts = Math.max(1, tH - tl);
  const pts: number[] = [], fill: number[] = [];
  for (let i = 0; i < n; i++) {
    const px = gx + (i / (n - 1)) * gw, py = top + (1 - (w.hours[i] - tl) / ts) * gh;
    pts.push(px); pts.push(py); fill.push(px); fill.push(py);
  }
  fill.push(gx + gw); fill.push(top + gh); fill.push(gx); fill.push(top + gh);
  polygon(fill, 0xffffff, 40);
  stroke(pts, 4, 0xffffff, 255, false);
  for (let i = 0; i < n; i++) {   // rain: a bar an hour
    const px = gx + (i / (n - 1)) * gw, p = w.rain[i] / 100;
    if (p > 0) rrect(px - 4, rainBottom - rainH * p, 8, Math.max(3, rainH * p), 3, 0x7fd3ff, 230);
  }
  for (let i = 0; i < n; i += 3) {   // every 3 hours: the hour and its temperature
    const px = gx + (i / (n - 1)) * gw, py = top + (1 - (w.hours[i] - tl) / ts) * gh;
    rrect(px - 5, py - 5, 10, 10, 5, 0xffffff, 255);
    centered(F.smallB, px, py - 30, deg(w.hours[i]), TEXT);
    centered(F.tiny, px, hoursY, w.hourNames[i], TEXT, 220);
  }
}
