#pragma once
// Shared typed formatting; tools/gen-intl strips its types for JavaScript.
namespace zn::frontend {
inline constexpr const char* kIntlCommon = R"ZN(
interface NumberFormatOptions {
  minimumFractionDigits?: f64; maximumFractionDigits?: f64; useGrouping?: boolean;
  style?: string; currency?: string; currencyDisplay?: string; currencySign?: string;
  notation?: string; compactDisplay?: string; signDisplay?: string; unit?: string; unitDisplay?: string;
  minimumIntegerDigits?: f64; minimumSignificantDigits?: f64; maximumSignificantDigits?: f64;
  numberingSystem?: string; localeMatcher?: string; roundingMode?: string; roundingPriority?: string;
  roundingIncrement?: f64; trailingZeroDisplay?: string;
}
interface __IntlDateFields {
  year?: string; month?: string; day?: string; weekday?: string; hour?: string; minute?: string; second?: string;
  hour12?: boolean; calendar?: string; numberingSystem?: string; localeMatcher?: string;
  dateStyle?: string; timeStyle?: string; era?: string; timeZoneName?: string; hourCycle?: string;
  fractionalSecondDigits?: f64; dayPeriod?: string; formatMatcher?: string;
}
interface __DateLocaleOptions extends __IntlDateFields { timeZone?: string }
function __intlResult(s: string): string { if (s.charAt(0) === '!') throw new RangeError(s.slice(1)); return s; }
function __intlLocale(s: string): string { if (s.length === 0 || s.indexOf('\n') >= 0) throw new RangeError('Invalid language tag'); return __intlResult(__host_intlLocale(s, false)); }
function __intlSupported(s: string): string[] { const r = __intlResult(__host_intlLocale(s, true)); return r.length === 0 ? [] : r.split('\n'); }
function __intlChoice(v: string | null, values: string, name: string): string {
  if (v === null) return '';
  if (v.indexOf('|') >= 0 || values.indexOf('|' + v + '|') < 0) throw new RangeError('Unsupported Intl option ' + name + ': ' + v);
  return v;
}
function __intlNumberSpec(o: NumberFormatOptions): string {
  if (o.currency !== null || o.currencyDisplay !== null || o.currencySign !== null || o.compactDisplay !== null || o.unit !== null || o.unitDisplay !== null || o.minimumSignificantDigits !== null || o.maximumSignificantDigits !== null || o.roundingIncrement !== null) throw new RangeError('Unsupported Intl.NumberFormat option');
  __intlChoice(o.style, '|decimal|', 'style'); __intlChoice(o.notation, '|standard|', 'notation');
  __intlChoice(o.signDisplay, '|auto|', 'signDisplay'); __intlChoice(o.numberingSystem, '|latn|', 'numberingSystem');
  __intlChoice(o.localeMatcher, '|lookup|best fit|', 'localeMatcher'); __intlChoice(o.roundingMode, '|halfExpand|', 'roundingMode');
  __intlChoice(o.roundingPriority, '|auto|', 'roundingPriority'); __intlChoice(o.trailingZeroDisplay, '|auto|', 'trailingZeroDisplay');
  if (o.minimumIntegerDigits !== null && o.minimumIntegerDigits !== 1) throw new RangeError('Unsupported Intl minimumIntegerDigits');
  let lo: f64 = o.minimumFractionDigits === null ? 0 : Math.floor(o.minimumFractionDigits as f64);
  let hi: f64 = o.maximumFractionDigits === null ? Math.max(3, lo) : Math.floor(o.maximumFractionDigits as f64);
  if (lo !== lo || hi !== hi || lo < 0 || hi < 0 || lo > 20 || hi > 20 || lo > hi) throw new RangeError('Intl fraction digits must be 0..20 with minimum <= maximum');
  return lo + '|' + hi + '|' + (o.useGrouping === null ? 'auto' : o.useGrouping ? 'always' : 'false');
}
function __intlDateSpec(o: __IntlDateFields, defaults: string): string {
  if (o.dateStyle !== null || o.timeStyle !== null || o.era !== null || o.timeZoneName !== null || o.hourCycle !== null || o.fractionalSecondDigits !== null || o.dayPeriod !== null) throw new RangeError('Unsupported Intl.DateTimeFormat option');
  __intlChoice(o.calendar, '|gregory|', 'calendar'); __intlChoice(o.numberingSystem, '|latn|', 'numberingSystem');
  __intlChoice(o.localeMatcher, '|lookup|best fit|', 'localeMatcher'); __intlChoice(o.formatMatcher, '|basic|best fit|', 'formatMatcher');
  let y = __intlChoice(o.year, '|numeric|2-digit|', 'year'), m = __intlChoice(o.month, '|numeric|2-digit|long|short|narrow|', 'month');
  let d = __intlChoice(o.day, '|numeric|2-digit|', 'day'), w = __intlChoice(o.weekday, '|long|short|narrow|', 'weekday');
  let h = __intlChoice(o.hour, '|numeric|2-digit|', 'hour'), mi = __intlChoice(o.minute, '|numeric|2-digit|', 'minute'), s = __intlChoice(o.second, '|numeric|2-digit|', 'second');
  const needDate = y.length + m.length + d.length + w.length === 0, needTime = h.length + mi.length + s.length === 0;
  if ((defaults === 'date' && needDate) || (defaults === 'all' && needDate && needTime) || (defaults === '' && needDate && needTime)) { y = 'numeric'; m = 'numeric'; d = 'numeric'; }
  if ((defaults === 'time' && needTime) || (defaults === 'all' && needDate && needTime)) { h = 'numeric'; mi = 'numeric'; s = 'numeric'; }
  return y + '|' + m + '|' + d + '|' + w + '|' + h + '|' + mi + '|' + s + '|' + (o.hour12 === null ? '' : o.hour12 ? '12' : '24');
}
function __intlZone(zone: string | null): string {
  if (zone !== null && zone.length === 0) throw new RangeError('Invalid Intl timeZone');
  return __intlResult(__host_intlZone(zone === null ? '' : zone));
}
function __intlDateLocale(value: f64, locales: string | null, options: __DateLocaleOptions, defaults: string): string {
  if (value !== value) return 'Invalid Date';
  const loc = locales === null ? __intlResult(__host_intlLocale('', false)) : __intlLocale(locales);
  const spec = __intlDateSpec(options, defaults), zone = __intlZone(options.timeZone);
  return __intlResult(__host_intlDate(loc, spec, zone, value));
}
)ZN";
inline constexpr const char* kIntlConstructors = R"ZN(
function __intlLocales(locales: any): string {
  if (locales.kind() === 0) return '';
  if (locales instanceof DynStr) { if (locales.v.length === 0 || locales.v.indexOf('\n') >= 0) throw new RangeError('Invalid language tag'); return locales.v; }
  if (locales instanceof DynArr) {
    const tags: string[] = [];
    for (let i: i32 = 0; i < locales.items.length; i++) { const tag = locales.items[i]; if (!(tag instanceof DynStr)) throw new TypeError('Intl locale entries must be strings'); if (tag.v.length === 0 || tag.v.indexOf('\n') >= 0) throw new RangeError('Invalid language tag'); tags.push(tag.v); }
    return tags.join('\n');
  }
  throw new TypeError('Intl locales must be a string or string array');
}
interface DateFormatOptions extends __IntlDateFields { timeZone?: any }
function __intlOptString(o: any, key: string): string | null { if (o.kind() === 0) return null; const v = __dynGet(o, key); if (v.kind() === 0) return null; const kind = __dynTypeof(v); if (kind === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string'); return __dynString(v); }
function __intlOptNumber(o: any, key: string): f64 | null { if (o.kind() === 0) return null; const v = __dynGet(o, key); return v.kind() === 0 ? null : __dynNumber(v); }
function __intlOptBool(o: any, key: string): boolean | null { if (o.kind() === 0) return null; const v = __dynGet(o, key); return v.kind() === 0 ? null : __dynTruthy(v); }
function __intlOptionKeys(o: any): string[] { return o.kind() === 0 ? [] : __dynKeys(o); }
function __intlOptionsCheck(o: any): void { if (o.kind() === 1) throw new TypeError('Intl options cannot be null'); }
function __intlDateOptions(o: any): __IntlDateFields {
  __intlOptionsCheck(o);
  const names = '|year|month|day|weekday|hour|minute|second|hour12|timeZone|calendar|numberingSystem|localeMatcher|dateStyle|timeStyle|era|timeZoneName|hourCycle|fractionalSecondDigits|dayPeriod|formatMatcher|';
  const keys = __intlOptionKeys(o);
  for (let i: i32 = 0; i < keys.length; i++) if (keys[i].indexOf('|') >= 0 || names.indexOf('|' + keys[i] + '|') < 0) throw new RangeError('Unsupported Intl option: ' + keys[i]);
  return {
    year: __intlOptString(o, 'year'),
    month: __intlOptString(o, 'month'),
    day: __intlOptString(o, 'day'),
    weekday: __intlOptString(o, 'weekday'),
    hour: __intlOptString(o, 'hour'),
    minute: __intlOptString(o, 'minute'),
    second: __intlOptString(o, 'second'),
    calendar: __intlOptString(o, 'calendar'),
    numberingSystem: __intlOptString(o, 'numberingSystem'),
    localeMatcher: __intlOptString(o, 'localeMatcher'),
    dateStyle: __intlOptString(o, 'dateStyle'),
    timeStyle: __intlOptString(o, 'timeStyle'),
    era: __intlOptString(o, 'era'),
    timeZoneName: __intlOptString(o, 'timeZoneName'),
    hourCycle: __intlOptString(o, 'hourCycle'),
    dayPeriod: __intlOptString(o, 'dayPeriod'),
    formatMatcher: __intlOptString(o, 'formatMatcher'),
    hour12: __intlOptBool(o, 'hour12'), fractionalSecondDigits: __intlOptNumber(o, 'fractionalSecondDigits'),
  };
}
function __intlDateThisValue(date: Date): f64 { return date.t; }
function __intlDateLocaleDyn(date: Date, locales: any, options: any, defaults: string): string {
  const value = __intlDateThisValue(date);
  if (value !== value) return 'Invalid Date';
  const loc = __intlResult(__host_intlLocale(__intlLocales(locales), false));
  const spec = __intlDateSpec(__intlDateOptions(options), defaults), zone = __intlZone(__intlOptString(options, 'timeZone'));
  return __intlResult(__host_intlDate(loc, spec, zone, value));
}
function __intlDateValue(value: any): f64 {
  if (value instanceof DynRef && value.className === 'Date') return __dynNumber(value.get('t'));
  return __dynNumber(value);
}
class __IntlNumberFormat {
  private locale: string; private spec: string;
  format: (value: f64) => string;
  constructor(locales: any = __undef, options: NumberFormatOptions = {}) {
    const loc = __intlResult(__host_intlLocale(__intlLocales(locales), false)), spec = __intlNumberSpec(options), p = spec.split('|');
    const lo = Number(p[0]), hi = Number(p[1]), group = p[2] !== 'false';
    this.locale = loc; this.spec = spec;
    this.format = (value: f64): string => __intlResult(__host_intlNumber(loc, value, lo, hi, group));
  }
  resolvedOptions(): any { const p = this.spec.split('|'); return JSON.parse('{"locale":"' + this.locale + '","numberingSystem":"latn","style":"decimal","minimumIntegerDigits":1,"minimumFractionDigits":' + p[0] + ',"maximumFractionDigits":' + p[1] + ',"useGrouping":' + (p[2] === 'false' ? 'false' : '"' + p[2] + '"') + ',"notation":"standard","signDisplay":"auto","roundingIncrement":1,"roundingMode":"halfExpand","roundingPriority":"auto","trailingZeroDisplay":"auto"}'); }
  static supportedLocalesOf(locales: any = __undef, options: { localeMatcher?: string } = {}): string[] { __intlChoice(options.localeMatcher, '|lookup|best fit|', 'localeMatcher'); return __intlSupported(__intlLocales(locales)); }
}
function __intlNumberLocale(value: f64, locales: any = __undef, options: NumberFormatOptions = {}): string { return new __IntlNumberFormat(locales, options).format(value); }
class __IntlDateTimeFormat {
  private locale: string; private spec: string; private zone: string;
  format: (value?: any) => string;
  constructor(locales: any = __undef, options: any = __undef) {
    const loc = __intlResult(__host_intlLocale(__intlLocales(locales), false)), spec = __intlDateSpec(__intlDateOptions(options), ''), zone = __intlZone(__intlOptString(options, 'timeZone'));
    this.locale = loc; this.spec = spec; this.zone = zone;
    this.format = (value: any = Date.now()): string => { const ms = __intlDateValue(value); return __intlResult(__host_intlDate(loc, spec, zone, ms)); };
  }
  resolvedOptions(): any { return JSON.parse(__intlResult(__host_intlDateResolved(this.locale, this.spec, this.zone))); }
  static supportedLocalesOf(locales: any = __undef, options: { localeMatcher?: string } = {}): string[] { __intlChoice(options.localeMatcher, '|lookup|best fit|', 'localeMatcher'); return __intlSupported(__intlLocales(locales)); }
}
)ZN";
}
