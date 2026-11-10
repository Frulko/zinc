# Number and date formatting

`Intl.NumberFormat` and `Intl.DateTimeFormat` provide a deliberately small subset on the interpreter, AOT and QuickJS. `Number.toLocaleString` and the three `Date.toLocale*String` methods use the same option validation and formatters. Existing native Intl implementations in other JavaScript engines keep their own behavior.

```ts
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
console.log(decimal.format(1234.5)); // 1 234,5 (narrow no-break space)
console.log(new Date(Date.UTC(2026, 0, 1)).toLocaleDateString('fr-FR', {
  month: 'long', timeZone: 'UTC',
})); // janvier
```

On macOS the subset uses CoreFoundation, loaded dynamically, without shipping ICU data. Supported locales are `en-US`, `fr-FR`, their language aliases `en` and `fr`, and the host locale when available from the OS. The default follows `zinc:sys.locale()` (environment locale first, otherwise the macOS preferred language). A locale list selects its first supported entry; a valid unsupported locale falls back to the default, while a malformed tag, including an explicitly empty string, throws `RangeError`. An omitted locale or empty list selects the default; a null locale throws `TypeError`. `supportedLocalesOf` reports supported requests without fallback. Locale variants and Unicode extension requests are outside the portable locale list and follow that same fallback rule.

Numbers support decimal style, Latin digits, boolean `useGrouping`, and `minimumFractionDigits` / `maximumFractionDigits` from 0 through 20. Defaults are 0 and 3; a supplied minimum raises the default maximum. Rounding uses the shortest decimal value with ties away from zero, including `1.005` → `1.01`. Negative zero, NaN and infinities are preserved. Explicit default values (`style: 'decimal'`, `notation: 'standard'`, `signDisplay: 'auto'`, `minimumIntegerDigits: 1`, `roundingMode: 'halfExpand'`, `roundingPriority: 'auto'`, `trailingZeroDisplay: 'auto'`, `numberingSystem: 'latn'`) are accepted. Currency, percent, units, significant digits and other rounding/notation modes throw `RangeError`.

Dates support Gregorian/Latin `year`, `month`, `day`, `weekday`, `hour`, `minute`, `second`, boolean `hour12`, and `timeZone`. Numeric fields accept `numeric` and `2-digit`; month and weekday also accept `long`, `short`, `narrow`. Weekday accepts only those three names. macOS uses real OS time-zone objects and their DST rules; `UTC` is always supported. An omitted zone selects the default; empty and null zone values throw `RangeError`. Invalid dates return `Invalid Date` from Date locale methods; formatter `.format(NaN)` throws `RangeError`. Constructor defaults select a numeric date. Date locale methods supply their date/time defaults only when the corresponding fields are absent; a month-only request stays month-only. Styles, era, zone-name display, fractional seconds, day periods and explicit hour cycles are outside this subset and throw. `localeMatcher` accepts `lookup` / `best fit`, and `formatMatcher` accepts `basic` / `best fit`.

Formatters expose `resolvedOptions`, `supportedLocalesOf`, and a stable bound `format` callback. They retain immutable resolved settings, with no native formatter handle or cache.

Portable builds without the OS backend provide the documented `en-US` decimal and Gregorian date subset in UTC. They do not contain French or host-language CLDR data, or a named-zone database. A valid unsupported language falls back to `en-US`; named zones other than UTC throw. UTC conversion is limited by the platform calendar/time range and rejects out-of-range values. Local `Date` getters retain their existing host-zone behavior. Collation, parts/ranges, currency and the rest of ECMA-402 remain outside this addition. Existing `zinc:i18n` translation catalogs are unchanged.
