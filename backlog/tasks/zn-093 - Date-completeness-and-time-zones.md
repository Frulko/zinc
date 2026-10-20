---
id: ZN-093
title: Date completeness and time zones
status: Done
assignee: []
created_date: '2026-10-06 22:54'
updated_date: '2026-10-07 06:07'
labels:
  - stdlib
  - size-M
milestone: m-13
dependencies:
  - ZN-083
ordinal: 40350
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Constructor forms (parts, ISO string, string parse of the RFC 2822/ISO subset), Date.UTC/parse, setters, toISOString/toJSON/toString/toUTCString/toLocale*String (en-US, ISO), getTimezoneOffset with the host zone (TZ database via the OS) and UTC under ZINC_DETERMINISTIC; Howard Hinnant's civil algorithms (already used) or C++20 <chrono> time zone support. Intl is deferred (decision recorded: only DateTimeFormat/NumberFormat en-US if an example needs it).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 fixtures equal Node's output in UTC and in two fixed TZ values (set through TZ)
- [x] #2 audit 01 Date rows pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Date rewritten in the prelude (kDatePrelude section of modules.cpp): constructor forms (parts local, ms, string via Date.parse, Date), Date.UTC/parse (ISO 8601 profile + tolerant legacy reader: RFC 2822, 'Jan 15, 2020 10:00:00', '15 January 2020', m/d/y, y/m/d, AM/PM, GMT+hhmm, zone names), all get/set (local and UTC), toISOString/toJSON/toString/toDateString/toTimeString/toUTCString/toLocale*String (en-US, timeZone option UTC or IANA), getTimezoneOffset; relational and arithmetic operators use valueOf() of an object (a Date). Zones: host rows HostTzOffset/TzName/TzOffsetIn (localtime_r with TZ); a deterministic run is UTC unless TZ is set. DST gap/overlap choices equal Node. Tests: golden/run/date_full.ts equals Node in UTC (golden) and, in tests/t1/date_zones.sh, in America/New_York, Europe/Paris, Asia/Kolkata (tests/data/date_zones/*.out made by Node); the 10 Date rows of audit 01 work. Differences: zone long names only for ~30 abbreviations (others print the abbreviation, e.g. 'Lord Howe Standard Time' prints '+1030'), the locale argument and the other toLocale options are ignored (en-US), Intl is not provided.
<!-- SECTION:NOTES:END -->
